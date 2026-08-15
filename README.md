# @iooe/ranobelib-sdk

A production-oriented, zero-runtime-dependency TypeScript SDK for **public** RanobeLib/lib.social title metadata and chapter content.

It retrieves full title metadata, the complete table of contents, translation branches, translators and chapter dates; normalizes both HTML and ProseMirror content into safe formatting-preserving HTML; and can resume an interrupted whole-title synchronization from an atomic disk manifest.

> The upstream API is undocumented and is not a stable public developer contract. Use this SDK only with appropriate permission, respect upstream rate limits, and keep live integration tests enabled.

## Highlights

- Node.js 20.12+, ESM, strict TypeScript, no runtime dependencies.
- Full title metadata, aliases, rating/votes, people, teams, genres, tags and statuses.
- Exact string volume/chapter numbers, including fractional values such as `51.6`.
- Translation branches with branch IDs, teams, uploaders and revision dates.
- Raw chapter payload plus sanitized HTML, plain text, attachments and SHA-256.
- HTML and ProseMirror support with paragraphs, marks, links, lists, quotes, code, tables and images.
- Fail-closed translation selection; explicit branch, index, strategy or callback.
- Global request pacing, bounded concurrency, timeouts, response-size limits, retries and `Retry-After` support.
- Memory and disk caches.
- Atomic resumable title sync with per-chapter JSON/HTML/TXT and pruning.
- Catalog pagination and a CLI.

## Install

```bash
npm install @iooe/ranobelib-sdk
```

## Example

```ts
import { FileCache, RanobeLibClient } from "@iooe/ranobelib-sdk";

const client = new RanobeLibClient({
  cache: new FileCache(".ranobelib-cache"),
  minRequestIntervalMs: 800,
  maxConcurrency: 4,
});

const titleUrl = "https://ranobelib.me/ru/book/91443--new-hero-in-dxd";
const full = await client.getFullTitleInfo(titleUrl);

const first = full.volumes[0]?.chapters[0];
if (first) {
  const chapter = await client.getChapter(titleUrl, first.volume, first.number, {
    branch: "first",
  });
  console.log(chapter.teams, chapter.dates, chapter.content.html);
}

await client.syncTitle(titleUrl, "./books/new-hero-in-dxd", {
  branch: "latest",
  concurrency: 4,
});
```

See [README.ru.md](README.ru.md), [docs/API.md](docs/API.md), and [docs/PRODUCTION.md](docs/PRODUCTION.md).

## Legal

This client grants no rights to upstream text, translations, or images. Permission, licensing, attribution, retention and redistribution decisions remain the responsibility of the operator.
