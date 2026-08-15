import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RanobeLibClient } from "../dist/index.js";
import { createFetch } from "./client.test.mjs";

test("syncTitle writes atomic JSON/HTML/text and resumes without re-downloading", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ranobelib-sdk-"));
  const counter = { title: 0, index: 0, chapter: 0 };
  try {
    const firstClient = new RanobeLibClient({ fetch: createFetch(counter), minRequestIntervalMs: 0 });
    const first = await firstClient.syncTitle("42--original", directory, { branch: "first", concurrency: 2 });
    assert.equal(first.downloaded, 2);
    assert.equal(first.failed, 0);
    assert.equal(counter.chapter, 2);

    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    assert.equal(Object.keys(manifest.chapters).length, 2);
    const entry = manifest.chapters["1\u00001"];
    const html = await readFile(join(directory, entry.relativeDirectory, "chapter.html"), "utf8");
    const text = await readFile(join(directory, entry.relativeDirectory, "chapter.txt"), "utf8");
    assert.equal(html, "<p>Chapter 1</p>");
    assert.equal(text, "Chapter 1");

    const secondClient = new RanobeLibClient({ fetch: createFetch(counter), minRequestIntervalMs: 0 });
    const second = await secondClient.syncTitle("42--original", directory, { branch: "first", concurrency: 2 });
    assert.equal(second.downloaded, 0);
    assert.equal(second.skipped, 2);
    assert.equal(counter.chapter, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
