import { RanobeLibClient } from "../dist/index.js";

const slug = process.env.RANOBELIB_SMOKE_TITLE ?? "91443--new-hero-in-dxd";
const client = new RanobeLibClient({
  minRequestIntervalMs: 250,
  maxConcurrency: 2,
  maxRetries: 3,
  timeoutMs: 30_000,
});

const title = await client.getTitle(slug, { refresh: true });
const index = await client.getChapterIndex(slug, { refresh: true });
if (title.id <= 0 || index.length === 0) throw new Error("Live API returned no title or chapters.");
const descriptor = index[0];
if (!descriptor) throw new Error("Live API returned an empty chapter index.");
const chapter = await client.getChapter(slug, descriptor.volume, descriptor.number, {
  branch: "first",
  refresh: true,
});
if (chapter.id <= 0 || (chapter.content.html === "" && chapter.content.text === "")) {
  throw new Error("Live API chapter payload was empty.");
}
console.log(
  JSON.stringify({
    titleId: title.id,
    slugUrl: title.slugUrl,
    chapters: index.length,
    sampledChapter: { volume: chapter.volume, number: chapter.number, branchId: chapter.branchId },
    contentFormat: chapter.content.rawFormat,
    contentBytes: new TextEncoder().encode(chapter.content.html).byteLength,
  }),
);
