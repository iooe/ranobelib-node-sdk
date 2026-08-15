import { ChapterService } from "./chapter-service.js";
import { TitleService } from "./title-service.js";
import type { Chapter, DownloadedTitle, DownloadProgress, StreamTitleOptions } from "./types.js";
import { parseSlugUrl } from "./utils.js";

export class DownloadService {
  readonly #titles: TitleService;
  readonly #chapters: ChapterService;

  public constructor(titles: TitleService, chapters: ChapterService) {
    this.#titles = titles;
    this.#chapters = chapters;
  }

  public async *streamTitle(
    input: string,
    options: StreamTitleOptions = {},
  ): AsyncGenerator<Chapter, void, void> {
    const slugUrl = parseSlugUrl(input);
    const title = await this.#titles.getTitle(slugUrl, options);
    const descriptors = await this.#titles.getChapterIndex(slugUrl, options);
    const startAt = Math.max(0, options.startAt ?? 0);
    const stopAt =
      options.stopAfter === undefined
        ? descriptors.length
        : Math.min(descriptors.length, startAt + Math.max(0, options.stopAfter));
    const selected = descriptors.slice(startAt, stopAt);
    const planned = await this.#chapters.plan(title.slugUrl, selected, options.branch ?? "error");
    const progress: DownloadProgress = {
      completed: 0,
      total: planned.length,
      skipped: 0,
      failed: 0,
      current: null,
    };

    for (const item of planned) {
      progress.current = item.descriptor;
      const chapter = await this.#chapters.fetchChapter(
        slugUrl,
        item.descriptor,
        item.branch,
        options,
      );
      progress.completed += 1;
      await options.onProgress?.({ ...progress });
      yield chapter;
    }
  }

  public async downloadTitle(
    input: string,
    options: StreamTitleOptions = {},
  ): Promise<DownloadedTitle> {
    const title = await this.#titles.getTitle(input, options);
    const byVolume = new Map<string, Chapter[]>();
    for await (const chapter of this.streamTitle(input, options)) {
      const current = byVolume.get(chapter.volume) ?? [];
      current.push(chapter);
      byVolume.set(chapter.volume, current);
    }
    return {
      title,
      volumes: [...byVolume.entries()].map(([number, chapters]) => ({ number, chapters })),
    };
  }
}
