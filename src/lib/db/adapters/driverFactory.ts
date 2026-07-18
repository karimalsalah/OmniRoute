import { createRequire } from "node:module";
import path from "node:path";
import { createBetterSqliteAdapter } from "./betterSqliteAdapter";
import {
  createNodeSqliteAdapterFromDatabase,
  type NodeSqliteDatabaseLike,
} from "./nodeSqliteShared";
import type { SqliteAdapter } from "./types";

// Next standalone chunks rewrite import.meta.url under `.build/next/server/chunks/…`.
// Anchor createRequire at process.cwd()/package.json (Docker WORKDIR=/app) so
// better-sqlite3 resolves from /app/node_modules — matching the runner COPY.
const _require = createRequire(path.join(process.cwd(), "package.json"));

declare global {
  var __omnirouteSqlJsAdapters: Map<string, SqliteAdapter> | undefined;
  var __omnirouteSqliteDriverWarnOnce: boolean | undefined;
}

function getSqlJsCache(): Map<string, SqliteAdapter> {
  if (!globalThis.__omnirouteSqlJsAdapters) {
    globalThis.__omnirouteSqlJsAdapters = new Map();
  }
  return globalThis.__omnirouteSqlJsAdapters;
}

function warnDriverOnce(label: string, err: unknown): void {
  if (globalThis.__omnirouteSqliteDriverWarnOnce) return;
  globalThis.__omnirouteSqliteDriverWarnOnce = true;
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[DB] ${label} unavailable: ${message}`);
}

type NodeSqliteModule = {
  DatabaseSync: new (p: string) => NodeSqliteDatabaseLike;
};

/** Load Node's built-in sqlite — never via createRequire (breaks under Next standalone). */
function loadNodeSqliteModule(): NodeSqliteModule | null {
  try {
    const getBuiltin = (
      process as NodeJS.Process & {
        getBuiltinModule?: (id: string) => unknown;
      }
    ).getBuiltinModule;
    if (typeof getBuiltin === "function") {
      const mod = getBuiltin("node:sqlite") as NodeSqliteModule | undefined;
      if (mod?.DatabaseSync) return mod;
    }
  } catch (err) {
    warnDriverOnce("node:sqlite (getBuiltinModule)", err);
  }
  try {
    // Fallback: createRequire from cwd can still load Node builtins.
    const mod = _require("node:sqlite") as NodeSqliteModule;
    if (mod?.DatabaseSync) return mod;
  } catch (err) {
    warnDriverOnce("node:sqlite (createRequire)", err);
  }
  return null;
}

function tryOpenBetterSqlite(
  filePath: string,
  options?: Record<string, unknown>
): SqliteAdapter | null {
  const candidates = [
    path.join(process.cwd(), "node_modules", "better-sqlite3"),
    "better-sqlite3",
  ];
  let lastErr: unknown;
  for (const id of candidates) {
    try {
      const BetterSqlite = _require(id) as {
        new (p: string, o?: object): import("better-sqlite3").Database;
      };
      const db = new BetterSqlite(filePath, options);
      return createBetterSqliteAdapter(db);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) warnDriverOnce("better-sqlite3", lastErr);
  return null;
}

function tryOpenNodeSqlite(filePath: string): SqliteAdapter | null {
  const [maj, min] = (process.versions.node ?? "0.0").split(".").map(Number);
  if (!(maj > 22 || (maj === 22 && min >= 5))) return null;
  const mod = loadNodeSqliteModule();
  if (!mod) return null;
  try {
    const db = new mod.DatabaseSync(filePath);
    return createNodeSqliteAdapterFromDatabase(db, filePath);
  } catch (err) {
    warnDriverOnce("node:sqlite (open)", err);
    return null;
  }
}

/** Tenta abrir com better-sqlite3 e node:sqlite sincronamente. Retorna null se ambos falharem. */
export function tryOpenSync(
  filePath: string,
  options?: Record<string, unknown>
): SqliteAdapter | null {
  // better-sqlite3: rápido, nativo — skip em Bun
  if (!process.versions.bun) {
    const better = tryOpenBetterSqlite(filePath, options);
    if (better) return better;
  }

  // node:sqlite: built-in desde Node 22.5 — skip em Bun
  if (!process.versions.bun) {
    const nodeSqlite = tryOpenNodeSqlite(filePath);
    if (nodeSqlite) return nodeSqlite;
  }

  return null;
}

/**
 * Pré-inicializa sql.js para um filePath.
 * Armazena em globalThis para acesso posterior via getSqlJsAdapter().
 * Idempotente — seguro chamar múltiplas vezes.
 */
export async function preInitSqlJs(filePath: string): Promise<SqliteAdapter> {
  const cache = getSqlJsCache();
  const existing = cache.get(filePath);
  if (existing) return existing;

  const { createSqlJsAdapter } = await import("./sqljsAdapter");
  const adapter = await createSqlJsAdapter(filePath);
  cache.set(filePath, adapter);
  return adapter;
}

/** Retorna adapter sql.js pré-inicializado ou null se ainda não inicializado. */
export function getSqlJsAdapter(filePath: string): SqliteAdapter | null {
  return getSqlJsCache().get(filePath) ?? null;
}

/**
 * Factory assíncrona completa: tenta todos os drivers em cascata.
 * Ordem: better-sqlite3 → node:sqlite → sql.js
 */
export async function openDatabaseAsync(
  filePath: string,
  options?: Record<string, unknown>
): Promise<SqliteAdapter> {
  const sync = tryOpenSync(filePath, options);
  if (sync) {
    console.log(`[DB] Driver: ${sync.driver} | file: ${filePath}`);
    return sync;
  }

  console.warn("[DB] Synchronous drivers unavailable — falling back to sql.js (WASM)");
  const adapter = await preInitSqlJs(filePath);
  console.log(`[DB] Driver: sql.js | file: ${filePath}`);
  return adapter;
}
