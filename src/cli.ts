#!/usr/bin/env node
import { FileCache } from "./cache.js";
import { RanobeLibClient } from "./client.js";
import type { BranchSelector } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wantsHelp = args.includes("--help") || args.includes("-h");
  if (wantsHelp || args.length < 2) {
    printHelp();
    process.exitCode = wantsHelp ? 0 : 1;
    return;
  }

  const input = args[0];
  const directory = args[1];
  if (!input || !directory) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const branch = parseBranch(args);
  const delay = numericFlag(args, "--delay-ms") ?? 800;
  const transportConcurrency = numericFlag(args, "--request-concurrency") ?? 4;
  const syncConcurrency = numericFlag(args, "--sync-concurrency") ?? 4;
  const client = new RanobeLibClient({
    cache: new FileCache(flagValue(args, "--cache") ?? ".ranobelib-cache"),
    minRequestIntervalMs: delay,
    maxConcurrency: transportConcurrency,
    logger: consoleLogger,
  });

  const result = await client.syncTitle(input, directory, {
    branch,
    concurrency: syncConcurrency,
    refresh: args.includes("--refresh"),
    pruneRemoved: !args.includes("--no-prune"),
    continueOnError: args.includes("--continue-on-error"),
    onProgress: ({ completed, total, skipped, failed, current }) => {
      const chapter = current ? ` v${current.volume} c${current.number}` : "";
      process.stdout.write(
        `\rdownloaded=${completed}/${total} skipped=${skipped} failed=${failed}${chapter}      `,
      );
    },
  });

  process.stdout.write("\n");
  process.stdout.write(
    `${JSON.stringify(
      {
        directory: result.directory,
        title: result.title.names.russian ?? result.title.names.original,
        downloaded: result.downloaded,
        skipped: result.skipped,
        failed: result.failed,
        removed: result.removed,
      },
      null,
      2,
    )}\n`,
  );
}

function parseBranch(args: string[]): BranchSelector {
  const branchId = numericFlag(args, "--branch-id");
  if (branchId !== null) return { branchId };
  const translationIndex = numericFlag(args, "--translation-index");
  if (translationIndex !== null) return { translationIndex };
  const strategy = flagValue(args, "--branch") ?? "error";
  if (!["error", "first", "latest", "oldest"].includes(strategy)) {
    throw new Error(`Invalid --branch value: ${strategy}`);
  }
  return strategy as BranchSelector;
}

function flagValue(args: string[], name: string): string | null {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function numericFlag(args: string[], name: string): number | null {
  const value = flagValue(args, name);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${name}: ${value}`);
  return parsed;
}

function printHelp(): void {
  process.stdout.write(`Usage:\n  ranobelib-sync <title-url-or-slug> <directory> [options]\n\nOptions:\n  --branch=error|first|latest|oldest\n  --branch-id=<id>\n  --translation-index=<index>\n  --delay-ms=<milliseconds>          Default: 800 (~75 starts/minute)\n  --request-concurrency=<number>     Default: 4\n  --sync-concurrency=<number>        Default: 4\n  --cache=<directory>                Default: .ranobelib-cache\n  --refresh\n  --no-prune\n  --continue-on-error\n`);
}

const consoleLogger = {
  debug: () => undefined,
  info: (message: string) => process.stderr.write(`[info] ${message}\n`),
  warn: (message: string) => process.stderr.write(`[warn] ${message}\n`),
  error: (message: string) => process.stderr.write(`[error] ${message}\n`),
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
