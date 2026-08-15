import test from "node:test";
import assert from "node:assert/strict";
import { RanobeLibClient } from "../dist/index.js";

const title = {
  id: 42,
  name: "Original",
  rus_name: "Русское",
  eng_name: "English",
  slug: "original",
  slug_url: "42--original",
  summary: { type: "doc", content: [] },
  status: { id: 1, label: "Онгоинг" },
  scanlateStatus: { id: 1, label: "Продолжается" },
  items_count: { uploaded: 2, total: 0 },
};
const index = [
  {
    id: 10,
    index: 1,
    volume: "1",
    number: "1",
    name: "One",
    branches: [{ id: 101, branch_id: 7, created_at: "2024-01-01T00:00:00Z", teams: [{ id: 5, name: "Team" }] }],
  },
  { id: 11, index: 2, volume: "1", number: "2", name: "Two", branches: [] },
];

function createFetch(counter = { title: 0, index: 0, chapter: 0 }) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/chapters")) {
      counter.index += 1;
      return Response.json({ data: index });
    }
    if (url.pathname.endsWith("/chapter")) {
      counter.chapter += 1;
      const number = url.searchParams.get("number");
      return Response.json({
        data: {
          id: number === "1" ? 10 : 11,
          manga_id: 42,
          volume: "1",
          number,
          name: number === "1" ? "One" : "Two",
          branch_id: url.searchParams.get("branch_id") ? Number(url.searchParams.get("branch_id")) : null,
          teams: number === "1" ? [{ id: 5, name: "Team" }] : [],
          created_at: "2024-01-01T00:00:00Z",
          content: `<p>Chapter ${number}</p>`,
          attachments: [],
        },
      });
    }
    counter.title += 1;
    return Response.json({ data: title });
  };
}

test("client returns title, complete chapter index and full title information", async () => {
  const client = new RanobeLibClient({ fetch: createFetch(), minRequestIntervalMs: 0 });
  const full = await client.getFullTitleInfo("https://ranobelib.me/ru/book/42--original");
  assert.equal(full.title.id, 42);
  assert.equal(full.chapterCount, 2);
  assert.equal(full.volumes[0].chapters[1].number, "2");
});

test("client fetches exact branch and keeps translator metadata", async () => {
  const client = new RanobeLibClient({ fetch: createFetch(), minRequestIntervalMs: 0 });
  const chapter = await client.getChapter("42--original", 1, 1, { branch: { branchId: 7 } });
  assert.equal(chapter.branchId, 7);
  assert.equal(chapter.teams[0].name, "Team");
  assert.equal(chapter.content.html, "<p>Chapter 1</p>");
  assert.equal(chapter.content.text, "Chapter 1");
});

test("streamTitle emits progress and every chapter", async () => {
  const client = new RanobeLibClient({ fetch: createFetch(), minRequestIntervalMs: 0 });
  const progress = [];
  const chapters = [];
  for await (const chapter of client.streamTitle("42--original", {
    branch: "first",
    onProgress: (value) => progress.push(value.completed),
  })) {
    chapters.push(chapter.number);
  }
  assert.deepEqual(chapters, ["1", "2"]);
  assert.deepEqual(progress, [1, 2]);
});

export { createFetch, index, title };
