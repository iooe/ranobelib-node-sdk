import test from "node:test";
import assert from "node:assert/strict";
import { AmbiguousTranslationError, BranchNotFoundError, resolveBranch } from "../dist/index.js";

const chapter = {
  id: 1,
  index: 1,
  itemNumber: 1,
  volume: "1",
  number: "1",
  title: null,
  bundleId: null,
  revisionKey: "x",
  raw: {},
  branches: [
    { revisionId: 11, branchId: 100, createdAt: "2020-01-01T00:00:00Z", teams: [], uploader: null, raw: {} },
    { revisionId: 12, branchId: 200, createdAt: "2021-01-01T00:00:00Z", teams: [], uploader: null, raw: {} },
  ],
};

test("ambiguous translations fail closed by default", async () => {
  await assert.rejects(resolveBranch("title", chapter), AmbiguousTranslationError);
});

test("branch strategies and explicit selectors are deterministic", async () => {
  assert.equal((await resolveBranch("title", chapter, "first")).branchId, 100);
  assert.equal((await resolveBranch("title", chapter, "latest")).branchId, 200);
  assert.equal((await resolveBranch("title", chapter, "oldest")).branchId, 100);
  assert.equal((await resolveBranch("title", chapter, { translationIndex: 1 })).branchId, 200);
  assert.equal((await resolveBranch("title", chapter, { branchId: 100 })).branchId, 100);
});

test("an unavailable explicit branch is rejected", async () => {
  await assert.rejects(resolveBranch("title", chapter, { branchId: 999 }), BranchNotFoundError);
});
