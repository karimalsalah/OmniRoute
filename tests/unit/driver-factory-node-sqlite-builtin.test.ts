/**
 * Guard: node:sqlite must load via process.getBuiltinModule (or cwd createRequire),
 * never only via createRequire(import.meta.url). Next standalone otherwise reports
 * "node:sqlite (indisponível)" and falls through to a broken sql.js path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(
  path.join(repoRoot, "src/lib/db/adapters/driverFactory.ts"),
  "utf-8"
);

test("driverFactory loads node:sqlite via getBuiltinModule", () => {
  assert.match(src, /getBuiltinModule/);
  assert.match(src, /node:sqlite/);
  assert.match(src, /function loadNodeSqliteModule/);
});

test("driverFactory still anchors better-sqlite3 at process.cwd()", () => {
  const assignIdx = src.indexOf("const _require = createRequire(");
  assert.ok(assignIdx >= 0);
  const after = src.slice(assignIdx, assignIdx + 120);
  assert.match(after, /process\.cwd\(\)/);
  assert.ok(!after.includes("import.meta.url"));
});
