import type { ChapterDescriptor, TranslationBranch, UnknownRecord } from "./types.js";

export class RanobeLibError extends Error {
  public code: string;
  public readonly context: UnknownRecord;

  public constructor(message: string, code = "RANOBELIB_ERROR", context: UnknownRecord = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

export class InvalidInputError extends RanobeLibError {
  public constructor(message: string, context: UnknownRecord = {}) {
    super(message, "INVALID_INPUT", context);
  }
}

export class ApiResponseError extends RanobeLibError {
  public readonly status: number;
  public readonly url: string;
  public readonly retryAfterMs: number | null;

  public constructor(
    message: string,
    options: { status: number; url: string; retryAfterMs?: number | null; body?: unknown },
  ) {
    super(message, "API_RESPONSE_ERROR", {
      status: options.status,
      url: options.url,
      retryAfterMs: options.retryAfterMs ?? null,
      body: options.body as never,
    });
    this.status = options.status;
    this.url = options.url;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export class NotFoundError extends ApiResponseError {
  public constructor(url: string, body?: unknown) {
    super(`RanobeLib resource was not found: ${url}`, { status: 404, url, body });
    this.code = "NOT_FOUND";
  }
}

export class AuthenticationRequiredError extends ApiResponseError {
  public constructor(url: string, body?: unknown) {
    super(`RanobeLib resource requires authorization: ${url}`, { status: 403, url, body });
    this.code = "AUTH_REQUIRED";
  }
}

export class RateLimitError extends ApiResponseError {
  public constructor(url: string, retryAfterMs: number | null, body?: unknown) {
    super(`RanobeLib rate limit was reached: ${url}`, {
      status: 429,
      url,
      retryAfterMs,
      body,
    });
    this.code = "RATE_LIMITED";
  }
}

export class ResponseTooLargeError extends RanobeLibError {
  public constructor(url: string, limit: number) {
    super(`Response exceeded the configured ${limit} byte limit: ${url}`, "RESPONSE_TOO_LARGE", {
      url,
      limit,
    });
  }
}

export class InvalidApiPayloadError extends RanobeLibError {
  public constructor(message: string, context: UnknownRecord = {}) {
    super(message, "INVALID_API_PAYLOAD", context);
  }
}

export class ChapterNotFoundError extends RanobeLibError {
  public constructor(slugUrl: string, volume: string, number: string) {
    super(`Chapter v${volume} c${number} was not found in ${slugUrl}`, "CHAPTER_NOT_FOUND", {
      slugUrl,
      volume,
      number,
    });
  }
}

export class AmbiguousTranslationError extends RanobeLibError {
  public readonly chapter: ChapterDescriptor;
  public readonly branches: readonly TranslationBranch[];

  public constructor(chapter: ChapterDescriptor) {
    super(
      `Chapter v${chapter.volume} c${chapter.number} has ${chapter.branches.length} translation branches; select one explicitly.`,
      "AMBIGUOUS_TRANSLATION",
      { volume: chapter.volume, number: chapter.number, branchCount: chapter.branches.length },
    );
    this.chapter = chapter;
    this.branches = chapter.branches;
  }
}

export class BranchNotFoundError extends RanobeLibError {
  public constructor(chapter: ChapterDescriptor, branchId: number) {
    super(
      `Translation branch ${branchId} is unavailable for v${chapter.volume} c${chapter.number}.`,
      "BRANCH_NOT_FOUND",
      { volume: chapter.volume, number: chapter.number, branchId },
    );
  }
}

export class SyncInterruptedError extends RanobeLibError {
  public constructor(message: string, context: UnknownRecord = {}) {
    super(message, "SYNC_INTERRUPTED", context);
  }
}
