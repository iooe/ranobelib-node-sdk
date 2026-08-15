import {
  ApiResponseError,
  AuthenticationRequiredError,
  InvalidApiPayloadError,
  NotFoundError,
  RateLimitError,
  ResponseTooLargeError,
} from "./errors.js";
import { RequestScheduler } from "./rate-limiter.js";
import type { Logger, UnknownRecord } from "./types.js";
import { asRecord, encodeQuery, sleep } from "./utils.js";

const RETRYABLE_STATUSES = new Set([408, 425, 429]);

export interface TransportOptions {
  baseUrl: string;
  siteId: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxConcurrency: number;
  minRequestIntervalMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  fetch: typeof fetch;
  logger: Logger | null;
  headers: Record<string, string>;
}

export class JsonTransport {
  readonly #baseUrl: string;
  readonly #siteId: string;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #maxRetries: number;
  readonly #retryBaseDelayMs: number;
  readonly #retryMaxDelayMs: number;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger | null;
  readonly #headers: Record<string, string>;
  readonly #scheduler: RequestScheduler;

  public constructor(options: TransportOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#siteId = options.siteId;
    this.#timeoutMs = options.timeoutMs;
    this.#maxResponseBytes = options.maxResponseBytes;
    this.#maxRetries = options.maxRetries;
    this.#retryBaseDelayMs = options.retryBaseDelayMs;
    this.#retryMaxDelayMs = options.retryMaxDelayMs;
    this.#fetch = options.fetch;
    this.#logger = options.logger;
    this.#headers = options.headers;
    this.#scheduler = new RequestScheduler({
      maxConcurrency: options.maxConcurrency,
      minIntervalMs: options.minRequestIntervalMs,
    });
  }

  public async getData(
    path: string,
    query: Array<[string, string | number | boolean | null | undefined]> = [],
    signal?: AbortSignal,
  ): Promise<unknown> {
    const payload = await this.get(path, query, signal);
    const record = asRecord(payload);
    if (!("data" in record)) {
      throw new InvalidApiPayloadError("RanobeLib API response has no data field.", { path });
    }
    return record.data;
  }

  public async get(
    path: string,
    query: Array<[string, string | number | boolean | null | undefined]> = [],
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = `${this.#baseUrl}${path.startsWith("/") ? path : `/${path}`}${encodeQuery(query)}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
      try {
        return await this.#scheduler.schedule(() => this.#fetchOnce(url, signal), signal);
      } catch (error) {
        lastError = error;
        if (!this.#shouldRetry(error, attempt, signal)) throw error;
        const delayMs = this.#retryDelay(error, attempt);
        this.#logger?.warn("Retrying RanobeLib request", {
          url,
          attempt: attempt + 1,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(delayMs, signal);
      }
    }

    throw lastError;
  }

  async #fetchOnce(url: string, outerSignal?: AbortSignal): Promise<unknown> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () =>
        timeoutController.abort(
          new DOMException(`Request timed out after ${this.#timeoutMs} ms`, "TimeoutError"),
        ),
      this.#timeoutMs,
    );
    const signal = mergeSignals(outerSignal, timeoutController.signal);

    try {
      this.#logger?.debug("Fetching RanobeLib API", { url });
      const request: RequestInit = {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Site-Id": this.#siteId,
          "User-Agent": "@iooe/ranobelib-sdk/0.1.0",
          ...this.#headers,
        },
      };
      if (signal) request.signal = signal;
      const response = await this.#fetch(url, request);
      const text = await readResponseText(response, this.#maxResponseBytes, url);
      let body: unknown = null;
      if (text !== "") {
        try {
          body = JSON.parse(text) as unknown;
        } catch (error) {
          throw new InvalidApiPayloadError("RanobeLib API returned non-JSON content.", {
            url,
            status: response.status,
            preview: text.slice(0, 500),
            error: String(error),
          });
        }
      }

      if (response.ok) return body;
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      if (response.status === 404) throw new NotFoundError(url, body);
      if (response.status === 403) throw new AuthenticationRequiredError(url, body);
      if (response.status === 429) throw new RateLimitError(url, retryAfterMs, body);
      throw new ApiResponseError(`RanobeLib API returned HTTP ${response.status}.`, {
        status: response.status,
        url,
        retryAfterMs,
        body,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  #shouldRetry(error: unknown, attempt: number, signal?: AbortSignal): boolean {
    if (attempt >= this.#maxRetries || signal?.aborted) return false;
    if (error instanceof ApiResponseError) {
      return RETRYABLE_STATUSES.has(error.status) || error.status >= 500;
    }
    if (error instanceof InvalidApiPayloadError || error instanceof ResponseTooLargeError) return false;
    return (
      error instanceof TypeError ||
      (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
    );
  }

  #retryDelay(error: unknown, attempt: number): number {
    if (error instanceof ApiResponseError && error.retryAfterMs !== null) {
      return Math.min(this.#retryMaxDelayMs, Math.max(0, error.retryAfterMs));
    }
    const exponential = Math.min(
      this.#retryMaxDelayMs,
      this.#retryBaseDelayMs * 2 ** attempt,
    );
    return Math.round(exponential * (0.8 + Math.random() * 0.4));
  }
}

async function readResponseText(response: Response, limit: number, url: string): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new ResponseTooLargeError(url, limit);
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new ResponseTooLargeError(url, limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function mergeSignals(first?: AbortSignal, second?: AbortSignal): AbortSignal | undefined {
  if (!first) return second;
  if (!second) return first;
  if (first.aborted) return first;
  if (second.aborted) return second;
  const controller = new AbortController();
  const abort = (signal: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  first.addEventListener("abort", () => abort(first), { once: true });
  second.addEventListener("abort", () => abort(second), { once: true });
  return controller.signal;
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export const consoleLogger: Logger = {
  debug: (message, context) => console.debug(message, context ?? {}),
  info: (message, context) => console.info(message, context ?? {}),
  warn: (message, context) => console.warn(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {}),
};

export function transportContext(value: unknown): UnknownRecord {
  return asRecord(value);
}
