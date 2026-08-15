import test from "node:test";
import assert from "node:assert/strict";
import { JsonTransport } from "../dist/transport.js";
import { ResponseTooLargeError } from "../dist/index.js";

function transport(fetchImpl, overrides = {}) {
  return new JsonTransport({
    baseUrl: "https://api.example.test/api",
    siteId: "3",
    timeoutMs: 1000,
    maxResponseBytes: 1024,
    maxConcurrency: 2,
    minRequestIntervalMs: 0,
    maxRetries: 2,
    retryBaseDelayMs: 0,
    retryMaxDelayMs: 0,
    fetch: fetchImpl,
    logger: null,
    headers: {},
    ...overrides,
  });
}

test("transport sends required headers and unwraps data", async () => {
  let request;
  const api = transport(async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ data: { ok: true } });
  });
  assert.deepEqual(await api.getData("/manga/1--x", [["fields[]", "summary"]]), { ok: true });
  assert.match(request.url, /fields%5B%5D=summary/);
  assert.equal(new Headers(request.init.headers).get("site-id"), "3");
  assert.equal(new Headers(request.init.headers).get("accept"), "application/json");
});

test("transport retries HTTP 429 and respects a zero Retry-After", async () => {
  let calls = 0;
  const api = transport(async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ data: { message: "slow down" } }, { status: 429, headers: { "Retry-After": "0" } });
    }
    return Response.json({ data: [1, 2, 3] });
  });
  assert.deepEqual(await api.getData("/manga/x/chapters"), [1, 2, 3]);
  assert.equal(calls, 2);
});

test("transport aborts oversized responses before JSON parsing", async () => {
  const api = transport(
    async () => new Response(JSON.stringify({ data: "x".repeat(200) }), { headers: { "content-length": "5000" } }),
    { maxResponseBytes: 100 },
  );
  await assert.rejects(api.getData("/large"), ResponseTooLargeError);
});
