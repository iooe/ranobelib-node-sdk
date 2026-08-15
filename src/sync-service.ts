import { ChapterService, type PlannedChapter } from "./chapter-service.js";
import { TitleDirectoryStore } from "./storage.js";
import { TitleService } from "./title-service.js";
import type {
  DownloadProgress,
  SyncManifest,
  SyncResult,
  SyncTitleOptions,
} from "./types.js";
import { chapterKey, errorMessage, nowIso, parseSlugUrl } from "./utils.js";
import { SyncInterruptedError } from "./errors.js";

export class SyncService {
  readonly #titles: TitleService;
  readonly #chapters: ChapterService;

  public constructor(titles: TitleService, chapters: ChapterService) {
    this.#titles = titles;
    this.#chapters = chapters;
  }

  public async syncTitle(
    input: string,
    directory: string,
    options: SyncTitleOptions = {},
  ): Promise<SyncResult> {
    const slugUrl = parseSlugUrl(input);
    const [title, descriptors] = await Promise.all([
      this.#titles.getTitle(slugUrl, options),
      this.#titles.getChapterIndex(slugUrl, options),
    ]);
    const store = new TitleDirectoryStore(directory);
    await store.initialize();
    await store.writeTitle(title, descriptors);

    const previous = await store.readManifest();
    const manifest =
      previous?.slugUrl === title.slugUrl && previous.titleId === title.id
        ? previous
        : store.newManifest(title);
    manifest.syncedAt = nowIso();
    manifest.failures = [];

    const writeOptions = {
      writeHtml: options.writeHtml ?? true,
      writeText: options.writeText ?? true,
      writeRawJson: options.writeRawJson ?? true,
    };
    const planned = await this.#chapters.plan(
      title.slugUrl,
      descriptors,
      options.branch ?? "error",
    );
    const tasks: PlannedChapter[] = [];
    let skipped = 0;
    let failed = 0;
    let downloaded = 0;
    let removed = 0;
    const desiredKeys = new Set<string>();

    for (const item of planned) {
      const key = chapterKey(item.descriptor.volume, item.descriptor.number);
      desiredKeys.add(key);
      const existing = manifest.chapters[key];
      const selectedBranchId = item.branch?.branchId ?? null;
      const complete =
        existing?.branchId === selectedBranchId &&
        (await store.hasCompleteEntry(item.descriptor, existing, writeOptions));
      if (complete && !options.refresh) skipped += 1;
      else tasks.push(item);
    }

    const progress: DownloadProgress = {
      completed: skipped,
      total: planned.length,
      skipped,
      failed: 0,
      current: null,
    };
    await options.onProgress?.({ ...progress });

    let fatal: unknown = null;
    let cursor = 0;
    let checkpoint = Promise.resolve();
    const checkpointManifest = async (): Promise<void> => {
      const snapshot: SyncManifest = {
        ...manifest,
        chapters: { ...manifest.chapters },
        failures: [...manifest.failures],
      };
      checkpoint = checkpoint.then(() => store.writeManifest(snapshot));
      await checkpoint;
    };

    const worker = async (): Promise<void> => {
      while (fatal === null) {
        const index = cursor;
        cursor += 1;
        const item = tasks[index];
        if (!item) return;
        progress.current = item.descriptor;
        try {
          const chapter = await this.#chapters.fetchChapter(
            slugUrl,
            item.descriptor,
            item.branch,
            options,
          );
          const entry = await store.writeChapter(item.descriptor, chapter, writeOptions);
          manifest.chapters[entry.key] = entry;
          downloaded += 1;
          progress.completed = skipped + downloaded + failed;
          await checkpointManifest();
        } catch (error) {
          failed += 1;
          progress.failed = failed;
          progress.completed = skipped + downloaded + failed;
          manifest.failures.push({
            key: chapterKey(item.descriptor.volume, item.descriptor.number),
            message: errorMessage(error),
          });
          await checkpointManifest();
          if (!(options.continueOnError ?? false)) fatal = error;
        }
        await options.onProgress?.({ ...progress });
      }
    };

    const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
    await Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(1, tasks.length)) }, worker),
    );

    if (options.pruneRemoved ?? true) {
      for (const [key, entry] of Object.entries(manifest.chapters)) {
        if (desiredKeys.has(key)) continue;
        await store.removeEntry(entry);
        delete manifest.chapters[key];
        removed += 1;
      }
      await store.pruneEmptyDirectories();
    }

    manifest.syncedAt = nowIso();
    manifest.chapterCount = Object.keys(manifest.chapters).length;
    await checkpointManifest();

    if (fatal !== null) {
      throw new SyncInterruptedError("Title synchronization stopped after a chapter failure.", {
        directory: store.root,
        downloaded,
        skipped,
        failed,
        cause: errorMessage(fatal),
      });
    }

    return {
      directory: store.root,
      title,
      manifest,
      downloaded,
      skipped,
      failed,
      removed,
    };
  }
}
