/**
 * Production-safe default provider block for `auto/*` combo pools.
 *
 * These providers cannot function headless on Railway (or any container
 * without an interactive browser session / local CLI binary), so they must
 * never be silently auto-selected into a candidate pool:
 *
 * - `duckduckgo-web` (alias `ddgw`): the VQD token flow returns 503 / gets
 *   banned from shared datacenter IPs — verified failing in production.
 * - `auggie` (alias `aug`, if ever configured): the Auggie CLI binary is not
 *   installed in the production Docker image (see Docker build `2a075417`
 *   — do NOT re-add it there just to unblock this), so every call 502s.
 *
 * Both flood an `auto/*` combo with dead candidates, which can exhaust the
 * whole combo (every candidate fails) instead of just skipping the one bad
 * provider. Blocked by default; override per-deployment via env below.
 */
// Grouped by [id, alias] so unblocking either name (OMNIROUTE_UNBLOCK_PROVIDERS)
// releases the whole provider — not just one of its two identifiers.
const PRODUCTION_UNSAFE_HEADLESS_PROVIDER_GROUPS: readonly (readonly string[])[] = [
  ["duckduckgo-web", "ddgw"],
  ["auggie", "aug"],
];

export const PRODUCTION_UNSAFE_HEADLESS_PROVIDERS: readonly string[] =
  PRODUCTION_UNSAFE_HEADLESS_PROVIDER_GROUPS.flat();

function parseCsvEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Merge a settings-sourced `blockedProviders` list with:
 *   1. `OMNIROUTE_BLOCKED_PROVIDERS` — comma-separated env addition.
 *   2. `PRODUCTION_UNSAFE_HEADLESS_PROVIDERS` — always applied unless the
 *      provider id/alias is named in `OMNIROUTE_UNBLOCK_PROVIDERS`
 *      (comma-separated escape hatch for local/dev environments where the
 *      provider does work, e.g. a machine with the Auggie CLI installed).
 *
 * Every place that builds an `auto/*` candidate pool (or any other
 * settings.blockedProviders consumer) from raw settings should call this
 * instead of using the raw settings value directly — otherwise a
 * headless-unsafe provider can sneak back into the pool.
 */
export function resolveEffectiveBlockedProviders(
  settingsBlocked: readonly string[] = []
): Set<string> {
  const unblocked = new Set(parseCsvEnv(process.env.OMNIROUTE_UNBLOCK_PROVIDERS));
  const envBlocked = parseCsvEnv(process.env.OMNIROUTE_BLOCKED_PROVIDERS);
  // Unblocking via EITHER the id or the alias releases the whole group —
  // otherwise blocking "duckduckgo-web" while leaving "ddgw" blocked (or
  // vice versa) would still filter the provider out via its other name.
  const defaultBlocked = PRODUCTION_UNSAFE_HEADLESS_PROVIDER_GROUPS.filter(
    (group) => !group.some((id) => unblocked.has(id))
  ).flat();

  return new Set<string>([...settingsBlocked, ...envBlocked, ...defaultBlocked]);
}
