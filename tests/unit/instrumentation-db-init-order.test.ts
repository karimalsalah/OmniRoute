/**
 * Guard: ensureDbInitialized must run before HealthCheck/BATCH timers start.
 * Late init raced Timeout sweeps into getDbInstance() on Railway (500s).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(root, "src/instrumentation-node.ts"), "utf8");

test("ensureDbInitialized runs before background timers / batch processor", () => {
  const initAt = src.indexOf('ensureDbInitialized()');
  const batchAt = src.indexOf("initBatchProcessor");
  const spendAt = src.indexOf("startSpendBatchWriter()");
  assert.ok(initAt >= 0, "ensureDbInitialized() call present");
  assert.ok(batchAt >= 0, "initBatchProcessor present");
  assert.ok(spendAt >= 0, "startSpendBatchWriter present");
  assert.ok(
    initAt < batchAt && initAt < spendAt,
    "ensureDbInitialized must appear before batch/spend timer starts"
  );
});

test("startup log marks DB ready before timers", () => {
  assert.match(src, /SQLite ensureDbInitialized complete \(before timers\)/);
});
