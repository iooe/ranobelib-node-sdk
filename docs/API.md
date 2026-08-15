# API reference

## `RanobeLibClient`

### Constructor

```ts
new RanobeLibClient(options?: ClientOptions)
```

Important options:

- `apiBaseUrl`: default `https://api.cdnlibs.org/api`.
- `siteId`: default `3`.
- `sourceBaseUrl`: default `https://ranobelib.me`.
- `timeoutMs`: total fetch-and-body timeout, default 30 seconds.
- `maxResponseBytes`: default 16 MiB.
- `maxConcurrency`: in-flight network attempts, default 4.
- `minRequestIntervalMs`: minimum interval between request starts, default 800 ms.
- `maxRetries`: default 6 for `408`, `425`, `429`, `5xx` and retryable network failures.
- `cache`: `MemoryCache`, `FileCache`, custom `CacheStore`, or `false`.
- `logger`: custom structured logger or `false`.

### Title methods

```ts
getTitle(urlOrSlug, options?): Promise<Title>
getChapterIndex(urlOrSlug, options?): Promise<ChapterDescriptor[]>
getFullTitleInfo(urlOrSlug, options?): Promise<FullTitleInfo>
```

`getChapterIndex` retains volume and number as strings. Do not coerce them to floats: `1.10`, `1.1`, special chapters and nonstandard numbering can otherwise collide.

### Translation methods

```ts
getTranslations(urlOrSlug, volume, number, options?): Promise<TranslationBranch[]>
getChapter(urlOrSlug, volume, number, options?): Promise<Chapter>
```

`options.branch` accepts:

- `"error"` (default), `"first"`, `"latest"`, `"oldest"`;
- `{ branchId: 2251 }`;
- `{ translationIndex: 0 }`;
- an async/sync callback receiving the chapter and all branches.

### Bulk methods

```ts
getVolume(urlOrSlug, volume, options?): Promise<{ number; chapters }>
streamTitle(urlOrSlug, options?): AsyncGenerator<Chapter>
downloadTitle(urlOrSlug, options?): Promise<DownloadedTitle>
syncTitle(urlOrSlug, directory, options?): Promise<SyncResult>
```

Use `streamTitle` or `syncTitle` for hundreds or thousands of chapters. `downloadTitle` intentionally keeps the whole result in memory and is best for small titles.

### Catalog

```ts
listCatalog(query?): Promise<CatalogPage>
iterateCatalog(query?): AsyncGenerator<CatalogPage>
```

The server accepts 10–60 catalog items per page.

## Chapter content

```ts
chapter.content.raw        // exact upstream field: HTML string or ProseMirror object
chapter.content.rawFormat  // html | prosemirror | unknown
chapter.content.html       // sanitized formatting-preserving HTML
chapter.content.text       // plain text
chapter.content.attachments
chapter.content.sha256
```

The sanitizer only keeps an explicit tag/attribute allowlist and only permits HTTP(S) links and images. The untouched `raw` field is retained for auditing and future reprocessing; do not render it directly in a browser.
