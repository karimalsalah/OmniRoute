/**
 * Railway deploy 91327fdd (2026-07-17) failed because npm 12's allowScripts
 * default-deny silently skipped `npm rebuild better-sqlite3` after
 * `npm ci --ignore-scripts`. Guard the durable Docker + package.json contract.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf-8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));

test("package.json allowScripts permits better-sqlite3 (npm 12)", () => {
  assert.equal(packageJson.allowScripts?.["better-sqlite3"], true);
});

test("Dockerfile rebuild forces better-sqlite3 scripts past npm 12 allowlist", () => {
  assert.match(dockerfile, /npm rebuild better-sqlite3 --dangerously-allow-all-scripts/);
  assert.match(
    dockerfile,
    /test -f node_modules\/better-sqlite3\/build\/Release\/better_sqlite3\.node/
  );
});

test("Dockerfile image.source points at karimalsalah/OmniRoute", () => {
  assert.match(
    dockerfile,
    /org\.opencontainers\.image\.source="https:\/\/github\.com\/karimalsalah\/OmniRoute"/
  );
  assert.doesNotMatch(dockerfile, /diegosouzapw\/OmniRoute/);
});

test("Dockerfile ENTRYPOINT invokes check-permissions via /bin/sh (CRLF-safe)", () => {
  assert.match(dockerfile, /ENTRYPOINT\s*\[\s*"\/bin\/sh"\s*,\s*"\/tmp\/check-permissions\.sh"\s*\]/);
});

test("Dockerfile starts ENTRYPOINT as root so volume DATA_DIR can be chowned", () => {
  // Railway mounts are root-owned; UID 1000 cannot write /app/data without this.
  const entryIdx = dockerfile.indexOf('ENTRYPOINT ["/bin/sh", "/tmp/check-permissions.sh"]');
  assert.ok(entryIdx > 0, "ENTRYPOINT present");
  const before = dockerfile.slice(0, entryIdx);
  const lastUser = [...before.matchAll(/^USER\s+(\S+)/gm)].at(-1);
  assert.equal(lastUser?.[1], "root");
});

test("check-permissions.sh chowns DATA_DIR then drops to UID 1000", () => {
  const script = fs.readFileSync(path.join(repoRoot, "scripts/check-permissions.sh"), "utf-8");
  assert.match(script, /chown -R 1000:1000/);
  assert.match(script, /setpriv --reuid=1000/);
});
