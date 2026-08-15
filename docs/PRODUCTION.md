# Production operation

## Recommended topology

Use one logical `RanobeLibClient` per worker process so all imports share one scheduler. Do not create a client per chapter: that defeats global pacing.

For a book import service:

1. enqueue title sync jobs;
2. keep one client per worker;
3. call `syncTitle` or consume `streamTitle`;
4. persist source IDs, string volume/number, branch ID, revision key and content hash;
5. expose progress from `onProgress`;
6. retry failed jobs, relying on the manifest/cache rather than restarting from zero.

## Rate limits

The defaults target roughly 75 request starts per minute. `maxConcurrency` does not bypass this: it only hides network latency while `minRequestIntervalMs` controls the global start rate.

When the server returns `Retry-After`, it takes precedence. Otherwise retries use jittered exponential backoff capped by `retryMaxDelayMs`.

Do not rotate IPs, multiply workers without a shared limit, or treat permission to use content as permission to overload infrastructure. Ask the upstream operator for an explicit technical rate limit or IP allowlist before increasing throughput.

## Database identity

Recommended unique key:

```text
(source, source_title_id, volume_string, chapter_number_string, branch_id_nullable)
```

Store `descriptor.revisionKey` and `chapter.content.sha256` separately. The first detects upstream branch/index changes; the second detects content changes.

## Raw versus rendered content

Keep `content.raw` in restricted storage if you need exact reproducibility. Render only `content.html`, which is normalized through an allowlist. Re-run normalization after SDK upgrades when the upstream editor adds node types.

## Failure and recovery

`syncTitle` writes each chapter atomically and checkpoints `manifest.json` after every success/failure. A process crash can leave a harmless temporary file, but not a partially replaced chapter. The next run skips entries whose revision, selected branch and requested output files still match.

With `continueOnError: false` (default), no new tasks are started after the first observed failure; already in-flight requests can finish and are checkpointed. With `true`, failures are collected in the manifest and the rest of the title continues.

## Monitoring

Track at least:

- request count/status/latency;
- retry and 429 count;
- chapters downloaded/skipped/failed;
- response sizes;
- content-format distribution (`html`, `prosemirror`, `unknown`);
- branch ambiguity count;
- live smoke-test status.

## Upstream changes

Because this is an undocumented API, treat a parser failure as a schema alert, not as empty content. The SDK throws `InvalidApiPayloadError` for structurally invalid responses and retains raw payloads for diagnosis.
