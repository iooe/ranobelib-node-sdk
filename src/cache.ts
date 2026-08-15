import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CacheEntry, CacheStore } from "./types.js";
import { sha256 } from "./utils.js";

export class MemoryCache implements CacheStore {
  readonly #entries = new Map<string, CacheEntry<unknown>>();

  public async get<T>(key: string): Promise<T | undefined> {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlMs: number | null = null): Promise<void> {
    this.#entries.set(key, {
      value,
      expiresAt: ttlMs === null ? null : Date.now() + Math.max(0, ttlMs),
    });
  }

  public async delete(key: string): Promise<void> {
    this.#entries.delete(key);
  }

  public async clear(): Promise<void> {
    this.#entries.clear();
  }
}

export class FileCache implements CacheStore {
  readonly #directory: string;

  public constructor(directory = ".ranobelib-cache") {
    this.#directory = directory;
  }

  public async get<T>(key: string): Promise<T | undefined> {
    const path = this.#path(key);
    try {
      const text = await readFile(path, "utf8");
      const entry = JSON.parse(String(text)) as CacheEntry<T>;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        await rm(path, { force: true });
        return undefined;
      }
      return entry.value;
    } catch (error) {
      if (isMissing(error)) return undefined;
      await rm(path, { force: true }).catch(() => undefined);
      return undefined;
    }
  }

  public async set<T>(key: string, value: T, ttlMs: number | null = null): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const path = this.#path(key);
    const temporary = `${path}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttlMs === null ? null : Date.now() + Math.max(0, ttlMs),
    };
    await writeFile(temporary, JSON.stringify(entry), "utf8");
    await rename(temporary, path);
  }

  public async delete(key: string): Promise<void> {
    await rm(this.#path(key), { force: true });
  }

  public async clear(): Promise<void> {
    await rm(this.#directory, { recursive: true, force: true });
  }

  #path(key: string): string {
    return join(this.#directory, `${sha256(key)}.json`);
  }
}

export class NoopCache implements CacheStore {
  public async get<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }

  public async set<T>(_key: string, _value: T, _ttlMs?: number | null): Promise<void> {
    return undefined;
  }

  public async delete(_key: string): Promise<void> {
    return undefined;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
