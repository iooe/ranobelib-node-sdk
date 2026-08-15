import { ambiguousChapters } from "./branches.js";
import { MemoryCache, NoopCache } from "./cache.js";
import { DEFAULTS, TITLE_FIELDS } from "./config.js";
import { ChapterNotFoundError, InvalidInputError } from "./errors.js";
import { groupVolumes, parseChapterIndex, parseTitle } from "./parsers.js";
import { JsonTransport } from "./transport.js";
import type {
  CacheStore,
  Chapter,
  ChapterDescriptor,
  ClientOptions,
  FullTitleInfo,
  RequestOptions,
  Title,
} from "./types.js";
import { parseSlugUrl } from "./utils.js";

export class TitleService {
  public readonly transport: JsonTransport;
  public readonly cache: CacheStore;
  public readonly sourceBaseUrl: string;
  public readonly siteId: string;
  public readonly chapterCacheTtlMs: number | null;
  readonly #titleCacheTtlMs: number | null;
  readonly #indexCacheTtlMs: number | null;

  public constructor(options: ClientOptions = {}) {
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!fetchImplementation) {
      throw new InvalidInputError("A Fetch API implementation is required (Node.js 20+ includes one).");
    }

    this.sourceBaseUrl = options.sourceBaseUrl ?? DEFAULTS.sourceBaseUrl;
    this.siteId = options.siteId ?? DEFAULTS.siteId;
    this.#titleCacheTtlMs =
      options.titleCacheTtlMs === undefined ? DEFAULTS.titleCacheTtlMs : options.titleCacheTtlMs;
    this.#indexCacheTtlMs =
      options.indexCacheTtlMs === undefined ? DEFAULTS.indexCacheTtlMs : options.indexCacheTtlMs;
    this.chapterCacheTtlMs =
      options.chapterCacheTtlMs === undefined
        ? DEFAULTS.chapterCacheTtlMs
        : options.chapterCacheTtlMs;
    this.cache = options.cache === false ? new NoopCache() : options.cache ?? new MemoryCache();
    this.transport = new JsonTransport({
      baseUrl: options.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
      siteId: this.siteId,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      maxResponseBytes: options.maxResponseBytes ?? DEFAULTS.maxResponseBytes,
      maxConcurrency: options.maxConcurrency ?? DEFAULTS.maxConcurrency,
      minRequestIntervalMs: options.minRequestIntervalMs ?? DEFAULTS.minRequestIntervalMs,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs ?? DEFAULTS.retryMaxDelayMs,
      fetch: fetchImplementation,
      logger: options.logger === false || options.logger === undefined ? null : options.logger,
      headers: {
        Origin: this.sourceBaseUrl,
        Referer: `${this.sourceBaseUrl.replace(/\/+$/, "")}/`,
        ...(options.headers ?? {}),
      },
    });
  }

  public async getTitle(input: string, options: RequestOptions = {}): Promise<Title> {
    const slugUrl = parseSlugUrl(input);
    const cacheKey = `title:${slugUrl}`;
    if (!options.refresh) {
      const cached = await this.cache.get<Title>(cacheKey);
      if (cached) return cached;
    }
    const query = TITLE_FIELDS.map((field) => ["fields[]", field] as [string, string]);
    const data = await this.transport.getData(
      `/manga/${encodeURIComponent(slugUrl)}`,
      query,
      options.signal,
    );
    const title = parseTitle(data, this.sourceBaseUrl);
    await this.cache.set(cacheKey, title, this.#titleCacheTtlMs);
    return title;
  }

  public async getChapterIndex(
    input: string,
    options: RequestOptions = {},
  ): Promise<ChapterDescriptor[]> {
    const slugUrl = parseSlugUrl(input);
    const cacheKey = `index:${slugUrl}`;
    if (!options.refresh) {
      const cached = await this.cache.get<ChapterDescriptor[]>(cacheKey);
      if (cached) return cached;
    }
    const data = await this.transport.getData(
      `/manga/${encodeURIComponent(slugUrl)}/chapters`,
      [],
      options.signal,
    );
    const chapters = parseChapterIndex(data);
    await this.cache.set(cacheKey, chapters, this.#indexCacheTtlMs);
    return chapters;
  }

  public async getFullTitleInfo(
    input: string,
    options: RequestOptions = {},
  ): Promise<FullTitleInfo> {
    const [title, chapters] = await Promise.all([
      this.getTitle(input, options),
      this.getChapterIndex(input, options),
    ]);
    return {
      title,
      volumes: groupVolumes(chapters),
      chapterCount: chapters.length,
      ambiguousChapters: ambiguousChapters(chapters),
    };
  }

  public async findDescriptor(
    input: string,
    volume: string,
    number: string,
    options: RequestOptions = {},
  ): Promise<ChapterDescriptor> {
    const slugUrl = parseSlugUrl(input);
    const chapters = await this.getChapterIndex(slugUrl, options);
    const descriptor = chapters.find(
      (chapter) => chapter.volume === volume && chapter.number === number,
    );
    if (!descriptor) throw new ChapterNotFoundError(slugUrl, volume, number);
    return descriptor;
  }

  public async getCachedChapter(key: string): Promise<Chapter | undefined> {
    return this.cache.get<Chapter>(key);
  }

  public async setCachedChapter(key: string, chapter: Chapter): Promise<void> {
    await this.cache.set(key, chapter, this.chapterCacheTtlMs);
  }
}
