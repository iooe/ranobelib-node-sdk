import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  Chapter,
  ChapterDescriptor,
  ChapterManifestEntry,
  SyncManifest,
  Title,
} from "./types.js";
import { chapterKey, nowIso, safePathSegment } from "./utils.js";

export interface StoredChapterPaths {
  directory: string;
  json: string;
  html: string;
  text: string;
}

export class TitleDirectoryStore {
  readonly #root: string;

  public constructor(directory: string) {
    this.#root = resolve(directory);
  }

  public get root(): string {
    return this.#root;
  }

  public async initialize(): Promise<void> {
    await mkdir(join(this.#root, "chapters"), { recursive: true });
  }

  public async readManifest(): Promise<SyncManifest | null> {
    try {
      const text = await readFile(join(this.#root, "manifest.json"), "utf8");
      const parsed = JSON.parse(String(text)) as SyncManifest;
      return parsed.schemaVersion === 1 ? parsed : null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  public async writeTitle(title: Title, descriptors: ChapterDescriptor[]): Promise<void> {
    await this.#writeJsonAtomic(join(this.#root, "title.json"), title);
    await this.#writeJsonAtomic(join(this.#root, "chapters.json"), descriptors);
  }

  public pathsFor(descriptor: ChapterDescriptor): StoredChapterPaths {
    const volume = safePathSegment(descriptor.volume);
    const number = safePathSegment(descriptor.number);
    const directory = join(this.#root, "chapters", `v${volume}`, `c${number}-${descriptor.id}`);
    return {
      directory,
      json: join(directory, "chapter.json"),
      html: join(directory, "chapter.html"),
      text: join(directory, "chapter.txt"),
    };
  }

  public async hasCompleteEntry(
    descriptor: ChapterDescriptor,
    entry: ChapterManifestEntry | undefined,
    options: { writeHtml: boolean; writeText: boolean; writeRawJson: boolean },
  ): Promise<boolean> {
    if (!entry || entry.revisionKey !== descriptor.revisionKey) return false;
    const paths = this.pathsFor(descriptor);
    const required = [
      options.writeRawJson ? paths.json : null,
      options.writeHtml ? paths.html : null,
      options.writeText ? paths.text : null,
    ].filter((value): value is string => value !== null);
    return (await Promise.all(required.map(fileExists))).every(Boolean);
  }

  public async writeChapter(
    descriptor: ChapterDescriptor,
    chapter: Chapter,
    options: { writeHtml: boolean; writeText: boolean; writeRawJson: boolean },
  ): Promise<ChapterManifestEntry> {
    const paths = this.pathsFor(descriptor);
    await mkdir(paths.directory, { recursive: true });
    if (options.writeRawJson) await this.#writeJsonAtomic(paths.json, chapter);
    if (options.writeHtml) await this.#writeAtomic(paths.html, chapter.content.html);
    if (options.writeText) await this.#writeAtomic(paths.text, chapter.content.text);
    return {
      key: chapterKey(descriptor.volume, descriptor.number),
      id: descriptor.id,
      volume: descriptor.volume,
      number: descriptor.number,
      title: descriptor.title,
      branchId: chapter.branchId,
      revisionKey: descriptor.revisionKey,
      contentSha256: chapter.content.sha256,
      relativeDirectory: relativeDirectory(this.#root, paths.directory),
      fetchedAt: chapter.fetchedAt,
    };
  }

  public async writeManifest(manifest: SyncManifest): Promise<void> {
    await this.#writeJsonAtomic(join(this.#root, "manifest.json"), manifest);
  }

  public async removeEntry(entry: ChapterManifestEntry): Promise<void> {
    await rm(join(this.#root, entry.relativeDirectory), { recursive: true, force: true });
  }

  public async pruneEmptyDirectories(): Promise<void> {
    const chaptersRoot = join(this.#root, "chapters");
    await prune(chaptersRoot);
  }

  public newManifest(title: Title): SyncManifest {
    return {
      schemaVersion: 1,
      source: "ranobelib",
      slugUrl: title.slugUrl,
      titleId: title.id,
      syncedAt: nowIso(),
      chapterCount: 0,
      chapters: {},
      failures: [],
    };
  }

  async #writeJsonAtomic(path: string, value: unknown): Promise<void> {
    await this.#writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  async #writeAtomic(path: string, value: string): Promise<void> {
    const temporary = `${path}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(temporary, value, "utf8");
    await rename(temporary, path);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prune(directory: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = (await readdir(directory)) as string[];
  } catch {
    return false;
  }
  for (const entry of entries) {
    const path = join(directory, entry);
    try {
      const info = await stat(path);
      if (info.isDirectory()) await prune(path);
    } catch {
      // Another process may have removed it; the next sync repairs the manifest.
    }
  }
  const remaining = (await readdir(directory)) as string[];
  if (remaining.length === 0) {
    await rm(directory, { recursive: true, force: true });
    return true;
  }
  return false;
}

function relativeDirectory(root: string, directory: string): string {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  return directory.replace(/\\/g, "/").replace(`${normalizedRoot}/`, "");
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
