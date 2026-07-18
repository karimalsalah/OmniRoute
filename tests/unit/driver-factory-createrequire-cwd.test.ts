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
  assert.match(
    src,
    /const _require = createRequire\(\s*path\.join\(\s*process\.cwd\(\)\s*,\s*["']package\.json["']\s*\)\s*\)/
  );
  // Live call site must not use import.meta.url (comments may mention it).
  const callSites = [...src.matchAll(/const _require = createRequire\(([^)]+)\)/g)].map((m) =>
    m[1].trim()
  );
  assert.equal(callSites.length, 1);
  assert.match(callSites[0], /process\.cwd\(\)/);
  assert.doesNotMatch(callSites[0], /import\.meta\.url/);
});
