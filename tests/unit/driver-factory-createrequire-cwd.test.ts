/**
 * Guard: createRequire must anchor at process.cwd()/package.json, not
 * import.meta.url. Standalone Next chunks break native-module resolution
 * otherwise (Railway 500: Nenhum driver SQLite / sql.js not pre-initialized).
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

test("driverFactory createRequire anchors at process.cwd()/package.json", () => {
  const assignIdx = src.indexOf("const _require = createRequire(");
  assert.ok(assignIdx >= 0, "missing const _require = createRequire(...)");
  const after = src.slice(assignIdx, assignIdx + 120);
  assert.match(after, /process\.cwd\(\)/);
  assert.match(after, /package\.json/);
  assert.ok(
    !after.includes("import.meta.url"),
    `createRequire call site must not use import.meta.url; got: ${after}`
  );
});
