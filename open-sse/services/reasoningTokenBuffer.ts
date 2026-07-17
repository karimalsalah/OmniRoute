import { getResolvedModelCapabilities } from "../../src/lib/modelCapabilities.ts";

export function toPositiveInteger(value: unknown): number | null {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : null;
  if (numericValue === null || !Number.isFinite(numericValue)) return null;
  const normalized = Math.floor(numericValue);
  return normalized > 0 ? normalized : null;
}

// Conservative output ceiling when a model's maxOutputTokens is unknown
// (custom providers / unsynced catalogs). Buffering up to this cannot
// trigger a provider 400 the way an unbounded raise could.
const UNKNOWN_CAP_SAFE_MAX_OUTPUT = 8192;

export function resolveReasoningBufferedMaxTokens(
  modelStr: string,
  currentMaxTokens: unknown,
  options: { enabled?: boolean } = {}
): number | null {
  if (options.enabled === false) return null;

  const current = toPositiveInteger(currentMaxTokens);
  if (current === null) return null;

  const capabilities = getResolvedModelCapabilities(modelStr);
  // Only a POSITIVE "does not think" verdict skips the buffer.
  // Unknown capability (null) must not be treated as non-reasoning —
  // custom providers (tllm/*, aug/*, oc/*) often lack catalog entries
  // yet route to thinking models that burn the whole budget on reasoning.
  if (capabilities.supportsThinking === false) return null;

  const maxOutputTokens =
    toPositiveInteger(capabilities.maxOutputTokens) ??
    (capabilities.supportsThinking === true ? null : UNKNOWN_CAP_SAFE_MAX_OUTPUT);
  if (maxOutputTokens === null) return null;
  if (current > maxOutputTokens) return maxOutputTokens;
  if (current === maxOutputTokens) return current;

  const buffered = Math.max(current + 1000, Math.ceil(current * 1.5));
  if (buffered > maxOutputTokens) return current;

  return buffered;
}
