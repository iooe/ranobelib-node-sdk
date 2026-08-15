import { createHash } from "node:crypto";
import { InvalidInputError } from "./errors.js";
import type { UnknownRecord } from "./types.js";

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNonEmptyString(value: unknown): string | null {
  const text = asString(value)?.trim();
  return text ? text : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function asInteger(value: unknown): number | null {
  const number = asNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Aborted"));
      },
      { once: true },
    );
  });
}

export function parseSlugUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new InvalidInputError("A RanobeLib title URL or slug is required.");
  let candidate = value;
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const segments = url.pathname.split("/").filter(Boolean);
      candidate = segments.at(-1) ?? "";
    }
  } catch (error) {
    throw new InvalidInputError("Invalid RanobeLib URL.", { input, error: String(error) });
  }
  candidate = candidate.replace(/^book\//, "").replace(/^\/+|\/+$/g, "");
  if (!/^\d+--[^/]+$/.test(candidate)) {
    throw new InvalidInputError(
      "Expected a RanobeLib URL or a slug in the form {numeric-id}--{slug}.",
      { input },
    );
  }
  return candidate;
}

export function chapterKey(volume: string, number: string): string {
  return `${volume}\u0000${number}`;
}

export function safePathSegment(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return (normalized || "unknown").slice(0, 120);
}

export function absoluteUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function encodeQuery(entries: Array<[string, string | number | boolean | null | undefined]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    params.append(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
