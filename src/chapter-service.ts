import { resolveBranch } from "./branches.js";
import { ChapterNotFoundError } from "./errors.js";
import { parseChapter } from "./parsers.js";
import { TitleService } from "./title-service.js";
import type {
  BranchSelector,
  Chapter,
  ChapterDescriptor,
  GetChapterOptions,
  RequestOptions,
  StreamTitleOptions,
  TranslationBranch,
} from "./types.js";
import { parseSlugUrl } from "./utils.js";

export interface PlannedChapter {
  descriptor: ChapterDescriptor;
  branch: TranslationBranch | null;
}

export class ChapterService {
  readonly #titles: TitleService;

  public constructor(titles: TitleService) {
    this.#titles = titles;
  }

  public async getTranslations(
    input: string,
    volume: string | number,
    number: string | number,
    options: RequestOptions = {},
  ): Promise<TranslationBranch[]> {
    const descriptor = await this.#titles.findDescriptor(
      input,
      String(volume),
      String(number),
      options,
    );
    return descriptor.branches;
  }

  public async getChapter(
    input: string,
    volume: string | number,
    number: string | number,
    options: GetChapterOptions = {},
  ): Promise<Chapter> {
    const slugUrl = parseSlugUrl(input);
    const descriptor = await this.#titles.findDescriptor(
      slugUrl,
      String(volume),
      String(number),
      options,
    );
    const branch = await resolveBranch(slugUrl, descriptor, options.branch ?? "error");
    return this.fetchChapter(slugUrl, descriptor, branch, options);
  }

  public async getVolume(
    input: string,
    volume: string | number,
    options: StreamTitleOptions = {},
  ): Promise<{ number: string; chapters: Chapter[] }> {
    const slugUrl = parseSlugUrl(input);
    const title = await this.#titles.getTitle(slugUrl, options);
    const descriptors = (await this.#titles.getChapterIndex(slugUrl, options)).filter(
      (chapter) => chapter.volume === String(volume),
    );
    if (descriptors.length === 0) {
      throw new ChapterNotFoundError(slugUrl, String(volume), "*");
    }
    const planned = await this.plan(title.slugUrl, descriptors, options.branch ?? "error");
    const chapters: Chapter[] = [];
    for (const item of planned) {
      chapters.push(await this.fetchChapter(slugUrl, item.descriptor, item.branch, options));
    }
    return { number: String(volume), chapters };
  }

  public async plan(
    title: string,
    descriptors: ChapterDescriptor[],
    selector: BranchSelector,
  ): Promise<PlannedChapter[]> {
    const result: PlannedChapter[] = [];
    for (const descriptor of descriptors) {
      result.push({ descriptor, branch: await resolveBranch(title, descriptor, selector) });
    }
    return result;
  }

  public async fetchChapter(
    input: string,
    descriptor: ChapterDescriptor,
    branch: TranslationBranch | null,
    options: RequestOptions = {},
  ): Promise<Chapter> {
    const slugUrl = parseSlugUrl(input);
    const branchKey = branch?.branchId ?? "default";
    const cacheKey = `chapter:${slugUrl}:${descriptor.volume}:${descriptor.number}:${branchKey}:${descriptor.revisionKey}`;
    if (!options.refresh) {
      const cached = await this.#titles.getCachedChapter(cacheKey);
      if (cached) return cached;
    }
    const query: Array<[string, string | number | null]> = [
      ["volume", descriptor.volume],
      ["number", descriptor.number],
      ["branch_id", branch?.branchId ?? null],
    ];
    const data = await this.#titles.transport.getData(
      `/manga/${encodeURIComponent(slugUrl)}/chapter`,
      query,
      options.signal,
    );
    const chapter = parseChapter(
      data,
      descriptor,
      this.#titles.sourceBaseUrl,
      slugUrl,
    );
    await this.#titles.setCachedChapter(cacheKey, chapter);
    return chapter;
  }
}
