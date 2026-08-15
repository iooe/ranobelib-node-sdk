import { CatalogService } from "./catalog-service.js";
import { ChapterService } from "./chapter-service.js";
import { DownloadService } from "./download-service.js";
import { SyncService } from "./sync-service.js";
import { TitleService } from "./title-service.js";
import type {
  CatalogPage,
  CatalogQuery,
  Chapter,
  ChapterDescriptor,
  ClientOptions,
  DownloadedTitle,
  FullTitleInfo,
  GetChapterOptions,
  RequestOptions,
  StreamTitleOptions,
  SyncResult,
  SyncTitleOptions,
  Title,
  TranslationBranch,
} from "./types.js";

export class RanobeLibClient {
  readonly #titles: TitleService;
  readonly #chapters: ChapterService;
  readonly #downloads: DownloadService;
  readonly #sync: SyncService;
  readonly #catalog: CatalogService;

  public constructor(options: ClientOptions = {}) {
    this.#titles = new TitleService(options);
    this.#chapters = new ChapterService(this.#titles);
    this.#downloads = new DownloadService(this.#titles, this.#chapters);
    this.#sync = new SyncService(this.#titles, this.#chapters);
    this.#catalog = new CatalogService(this.#titles);
  }

  public getTitle(input: string, options: RequestOptions = {}): Promise<Title> {
    return this.#titles.getTitle(input, options);
  }

  public getChapterIndex(
    input: string,
    options: RequestOptions = {},
  ): Promise<ChapterDescriptor[]> {
    return this.#titles.getChapterIndex(input, options);
  }

  public getFullTitleInfo(
    input: string,
    options: RequestOptions = {},
  ): Promise<FullTitleInfo> {
    return this.#titles.getFullTitleInfo(input, options);
  }

  public getTranslations(
    input: string,
    volume: string | number,
    number: string | number,
    options: RequestOptions = {},
  ): Promise<TranslationBranch[]> {
    return this.#chapters.getTranslations(input, volume, number, options);
  }

  public getChapter(
    input: string,
    volume: string | number,
    number: string | number,
    options: GetChapterOptions = {},
  ): Promise<Chapter> {
    return this.#chapters.getChapter(input, volume, number, options);
  }

  public getVolume(
    input: string,
    volume: string | number,
    options: StreamTitleOptions = {},
  ): Promise<{ number: string; chapters: Chapter[] }> {
    return this.#chapters.getVolume(input, volume, options);
  }

  public streamTitle(
    input: string,
    options: StreamTitleOptions = {},
  ): AsyncGenerator<Chapter, void, void> {
    return this.#downloads.streamTitle(input, options);
  }

  public downloadTitle(
    input: string,
    options: StreamTitleOptions = {},
  ): Promise<DownloadedTitle> {
    return this.#downloads.downloadTitle(input, options);
  }

  public syncTitle(
    input: string,
    directory: string,
    options: SyncTitleOptions = {},
  ): Promise<SyncResult> {
    return this.#sync.syncTitle(input, directory, options);
  }

  public listCatalog(query: CatalogQuery = {}): Promise<CatalogPage> {
    return this.#catalog.listCatalog(query);
  }

  public iterateCatalog(
    query: Omit<CatalogQuery, "page"> = {},
  ): AsyncGenerator<CatalogPage> {
    return this.#catalog.iterateCatalog(query);
  }
}
