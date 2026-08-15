import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("CLI help exits successfully", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ranobelib-sync/);
});

test("CLI without required arguments exits with a usage error", () => {
  const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Usage:/);
});
