import test from "node:test";
import assert from "node:assert/strict";
import { groupVolumes, parseChapter, parseChapterIndex, parseTitle } from "../dist/index.js";

const titlePayload = {
  id: 42,
  name: "Original",
  rus_name: "Русское",
  eng_name: "English",
  otherNames: ["Alias"],
  slug: "original",
  slug_url: "42--original",
  summary: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Summary" }] }] },
  cover: { thumbnail: "/thumb.jpg", default: "/cover.jpg", md: "/cover-md.jpg" },
  background: { url: "/background.jpg" },
  ageRestriction: { id: 3, label: "16+" },
  type: { id: 11, label: "Корея" },
  status: { id: 2, label: "Завершён" },
  scanlateStatus: { id: 1, label: "Продолжается" },
  releaseDate: "2020",
  releaseDateString: "2020 г.",
  is_licensed: false,
  rating: { average: "9.25", votes: 123 },
  items_count: { uploaded: 2, total: 100 },
  authors: [{ id: 1, name: "Author" }],
  artists: [],
  teams: [{ id: 2, name: "Team", details: { is_active: true } }],
  genres: [{ id: 3, name: "Фэнтези" }],
  tags: [{ id: 4, name: "ГГ имба", is_media_spoiler: false }],
};

const indexPayload = [
  {
    id: 10,
    index: 1,
    item_number: 1,
    volume: "1",
    number: "1",
    number_secondary: "1",
    name: "Start",
    branches: [{ id: 100, branch_id: 7, created_at: "2024-01-01T00:00:00Z", teams: [{ id: 2, name: "Team" }] }],
  },
  { id: 11, index: 2, volume: "1", number: "1.5", name: null, branches: [] },
];

test("parseTitle maps complete metadata and aliases", () => {
  const title = parseTitle(titlePayload, "https://ranobelib.me");
  assert.equal(title.id, 42);
  assert.equal(title.names.russian, "Русское");
  assert.deepEqual(title.names.aliases, ["Alias", "Original", "Русское", "English"]);
  assert.equal(title.rating.average, 9.25);
  assert.equal(title.rating.votes, 123);
  assert.equal(title.chapterCount.uploaded, 2);
  assert.equal(title.cover.default, "https://ranobelib.me/cover.jpg");
  assert.equal(title.summary.text, "Summary");
  assert.equal(title.authors[0].name, "Author");
});

test("parseChapterIndex preserves decimal chapter numbers and translator branches", () => {
  const chapters = parseChapterIndex(indexPayload);
  assert.equal(chapters[1].number, "1.5");
  assert.equal(chapters[0].branches[0].branchId, 7);
  assert.equal(chapters[0].branches[0].teams[0].name, "Team");
  assert.equal(chapters[0].revisionKey.length, 64);
  assert.deepEqual(groupVolumes(chapters).map((volume) => volume.number), ["1"]);
});

test("parseChapter retains translator, dates, metrics, raw content and normalized content", () => {
  const descriptor = parseChapterIndex(indexPayload)[0];
  const chapter = parseChapter(
    {
      id: 10,
      manga_id: 42,
      volume: "1",
      number: "1",
      name: "Start",
      branch_id: 7,
      teams: [{ id: 2, name: "Team" }],
      user: { id: 8, username: "Uploader" },
      created_at: "2024-01-01T00:00:00Z",
      publish_at: "2024-01-02T00:00:00Z",
      likes_count: 5,
      moderated: true,
      translation_quality_rating: 4.8,
      content: "<p><strong>Hello</strong></p>",
      attachments: [],
    },
    descriptor,
    "https://ranobelib.me",
    "42--original",
  );
  assert.equal(chapter.branchId, 7);
  assert.equal(chapter.teams[0].name, "Team");
  assert.equal(chapter.uploader.username, "Uploader");
  assert.equal(chapter.dates.publishAt, "2024-01-02T00:00:00Z");
  assert.equal(chapter.content.text, "Hello");
  assert.equal(chapter.raw.content, "<p><strong>Hello</strong></p>");
});
