export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type UnknownRecord = Record<string, unknown>;

export interface NamedEntity {
  id: number | null;
  name: string;
  russianName: string | null;
  alternativeName: string | null;
  raw: UnknownRecord;
}

export interface Team {
  id: number | null;
  name: string;
  slugUrl: string | null;
  active: boolean | null;
  raw: UnknownRecord;
}

export interface TaxonomyItem {
  id: number | null;
  name: string;
  adult: boolean;
  alert: boolean;
  spoiler: boolean;
  raw: UnknownRecord;
}

export interface TitleNames {
  original: string;
  russian: string | null;
  english: string | null;
  aliases: string[];
}

export interface RichText {
  raw: unknown;
  html: string;
  text: string;
}

export interface TitleImageSet {
  filename: string | null;
  thumbnail: string | null;
  default: string | null;
  medium: string | null;
}

export interface Title {
  id: number;
  slug: string;
  slugUrl: string;
  sourceUrl: string;
  names: TitleNames;
  summary: RichText;
  cover: TitleImageSet;
  backgroundUrl: string | null;
  ageRestriction: { id: number | null; label: string | null };
  origin: { id: number | null; label: string | null };
  status: { id: number | null; label: string | null };
  translationStatus: { id: number | null; label: string | null };
  releaseDate: string | null;
  releaseDateLabel: string | null;
  licensed: boolean;
  rating: { average: number | null; votes: number };
  chapterCount: { uploaded: number; total: number };
  authors: NamedEntity[];
  artists: NamedEntity[];
  teams: Team[];
  genres: TaxonomyItem[];
  tags: TaxonomyItem[];
  fetchedAt: string;
  raw: UnknownRecord;
}

export interface Uploader {
  id: number | null;
  username: string | null;
  raw: UnknownRecord | null;
}

export interface TranslationBranch {
  revisionId: number | null;
  branchId: number | null;
  createdAt: string | null;
  teams: Team[];
  uploader: Uploader | null;
  raw: UnknownRecord;
}

export interface ChapterDescriptor {
  id: number;
  index: number | null;
  itemNumber: number | null;
  volume: string;
  number: string;
  title: string | null;
  bundleId: number | null;
  branches: TranslationBranch[];
  revisionKey: string;
  raw: UnknownRecord;
}

export interface VolumeDescriptor {
  number: string;
  chapters: ChapterDescriptor[];
}

export interface Attachment {
  id: number | null;
  name: string | null;
  url: string | null;
  filename: string | null;
  extension: string | null;
  raw: UnknownRecord;
}

export interface ChapterContent {
  raw: unknown;
  rawFormat: "html" | "prosemirror" | "unknown";
  html: string;
  text: string;
  attachments: Attachment[];
  sha256: string;
}

export interface ChapterDates {
  createdAt: string | null;
  publishAt: string | null;
  expiredAt: string | null;
}

export interface Chapter {
  id: number;
  mangaId: number | null;
  volume: string;
  number: string;
  title: string | null;
  branchId: number | null;
  teams: Team[];
  uploader: Uploader | null;
  dates: ChapterDates;
  moderated: boolean | null;
  likes: number | null;
  viewed: boolean | null;
  liked: boolean | null;
  expirationType: string | null;
  translationQualityRating: number | null;
  bundle: unknown;
  content: ChapterContent;
  sourceUrl: string;
  fetchedAt: string;
  raw: UnknownRecord;
}

export interface FullTitleInfo {
  title: Title;
  volumes: VolumeDescriptor[];
  chapterCount: number;
  ambiguousChapters: ChapterDescriptor[];
}

export type BranchStrategy = "error" | "first" | "latest" | "oldest";

export interface BranchContext {
  title: string;
  chapter: ChapterDescriptor;
  branches: readonly TranslationBranch[];
}

export type BranchSelector =
  | BranchStrategy
  | { branchId: number }
  | { translationIndex: number }
  | ((context: BranchContext) => number | TranslationBranch | null | Promise<number | TranslationBranch | null>);

export interface RequestOptions {
  signal?: AbortSignal;
  refresh?: boolean;
}

export interface GetChapterOptions extends RequestOptions {
  branch?: BranchSelector;
}

export interface StreamTitleOptions extends RequestOptions {
  branch?: BranchSelector;
  startAt?: number;
  stopAfter?: number;
  onProgress?: (progress: DownloadProgress) => void | Promise<void>;
}

export interface DownloadProgress {
  completed: number;
  total: number;
  skipped: number;
  failed: number;
  current: ChapterDescriptor | null;
}

export interface DownloadedTitle {
  title: Title;
  volumes: Array<{ number: string; chapters: Chapter[] }>;
}

export interface SyncTitleOptions extends StreamTitleOptions {
  concurrency?: number;
  pruneRemoved?: boolean;
  writeHtml?: boolean;
  writeText?: boolean;
  writeRawJson?: boolean;
  continueOnError?: boolean;
}

export interface ChapterManifestEntry {
  key: string;
  id: number;
  volume: string;
  number: string;
  title: string | null;
  branchId: number | null;
  revisionKey: string;
  contentSha256: string;
  relativeDirectory: string;
  fetchedAt: string;
}

export interface SyncManifest {
  schemaVersion: 1;
  source: "ranobelib";
  slugUrl: string;
  titleId: number;
  syncedAt: string;
  chapterCount: number;
  chapters: Record<string, ChapterManifestEntry>;
  failures: Array<{ key: string; message: string }>;
}

export interface SyncResult {
  directory: string;
  title: Title;
  manifest: SyncManifest;
  downloaded: number;
  skipped: number;
  failed: number;
  removed: number;
}

export interface CatalogTitle {
  id: number;
  slugUrl: string;
  name: string;
  russianName: string | null;
  englishName: string | null;
  sourceUrl: string;
  raw: UnknownRecord;
}

export interface CatalogPage {
  page: number;
  perPage: number;
  hasNextPage: boolean;
  items: CatalogTitle[];
  rawMeta: UnknownRecord;
}

export interface CatalogQuery {
  page?: number;
  perPage?: number;
  query?: string;
  genres?: number[];
  tags?: number[];
  status?: number;
  origins?: number[];
  sort?: string;
  signal?: AbortSignal;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number | null): Promise<void>;
  delete(key: string): Promise<void>;
  clear?(): Promise<void>;
}

export interface Logger {
  debug(message: string, context?: UnknownRecord): void;
  info(message: string, context?: UnknownRecord): void;
  warn(message: string, context?: UnknownRecord): void;
  error(message: string, context?: UnknownRecord): void;
}

export interface ClientOptions {
  apiBaseUrl?: string;
  siteId?: string;
  sourceBaseUrl?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxConcurrency?: number;
  minRequestIntervalMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  cache?: CacheStore | false;
  titleCacheTtlMs?: number | null;
  indexCacheTtlMs?: number | null;
  chapterCacheTtlMs?: number | null;
  fetch?: typeof fetch;
  logger?: Logger | false;
  headers?: Record<string, string>;
}
