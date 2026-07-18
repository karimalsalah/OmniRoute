/**
 * chatCore semantic-cache store (Quality Gate v2 / Fase 9 — chatCore god-file decomposition,
 * #3501).
 *
 * Extracted from handleChatCore's non-streaming success path (Phase 9.1): when semantic caching is
 * enabled and the request/response are cacheable, store the translated response under its signature
 * so a later temp=0 request can be served from cache. Side-effect only (cache write + debug log);
 * no early-return, no outer-variable reassignment. Behaviour is byte-identical to the previous
 * inline block, including the `prompt + completion || 0` token-saved precedence.
 */
import {
  generateSignature as defaultGenerateSignature,
  setCachedResponse as defaultSetCachedResponse,
  isCacheableForWrite as defaultIsCacheableForWrite,
} from "@/lib/semanticCache";
import { isSmallEnoughForSemanticCache as defaultIsSmallEnough } from "../../utils/estimateSize.ts";

type LoggerLike = { debug?: (...args: unknown[]) => void } | null | undefined;

type CacheBody = {
  messages?: unknown;
  input?: unknown;
  temperature?: unknown;
  top_p?: unknown;
};

type UsageLike = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

export interface SemanticCacheStoreDeps {
  isCacheableForWrite: typeof defaultIsCacheableForWrite;
  isSmallEnoughForSemanticCache: typeof defaultIsSmallEnough;
  generateSignature: typeof defaultGenerateSignature;
  setCachedResponse: typeof defaultSetCachedResponse;
}

const DEFAULT_DEPS: SemanticCacheStoreDeps = {
  isCacheableForWrite: defaultIsCacheableForWrite,
  isSmallEnoughForSemanticCache: defaultIsSmallEnough,
  generateSignature: defaultGenerateSignature,
  setCachedResponse: defaultSetCachedResponse,
};

/**
 * True when the response's first choice carries no content and no tool_calls
 * (reasoning-only truncation — the model spent the whole output budget on
 * reasoning). Replaying such a response from cache poisons every combo retry:
 * the quality validator rejects it again on each attempt until the combo 503s.
 * Shared by the non-streaming and streaming store paths.
 */
export function isReasoningOnlyTruncation(translatedResponse: unknown): boolean {
  const choices = (translatedResponse as { choices?: Array<Record<string, unknown>> })?.choices;
  const msg = (choices?.[0]?.message ?? choices?.[0]?.delta) as
    { content?: unknown; tool_calls?: unknown[] } | undefined;
  return (
    !!msg &&
    (msg.content == null || msg.content === "") &&
    !(Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0)
  );
}

export function storeSemanticCacheResponse(
  args: {
    enabled: boolean;
    body: CacheBody;
    headers: unknown;
    translatedResponse: unknown;
    model: string;
    apiKeyId?: string | number;
    usage?: UsageLike;
    log?: LoggerLike;
  },
  deps: SemanticCacheStoreDeps = DEFAULT_DEPS
): void {
  if (
    !args.enabled ||
    !deps.isCacheableForWrite(args.body, args.headers) ||
    !deps.isSmallEnoughForSemanticCache(args.translatedResponse)
  ) {
    return;
  }
  // Never cache a response whose choices carry no content and no tool_calls
  // (reasoning-only truncation) — replaying it poisons every retry.
  if (isReasoningOnlyTruncation(args.translatedResponse)) {
    return;
  }
  const signature = deps.generateSignature(
    args.model,
    args.body.messages ?? args.body.input,
    args.body.temperature,
    args.body.top_p,
    args.apiKeyId ?? undefined,
    args.body.max_tokens ?? (args.body as { max_completion_tokens?: unknown }).max_completion_tokens
  );
  const tokensSaved = args.usage?.prompt_tokens + args.usage?.completion_tokens || 0;
  deps.setCachedResponse(signature, args.model, args.translatedResponse, tokensSaved);
  args.log?.debug?.("CACHE", `Stored response for ${args.model} (${tokensSaved} tokens)`);
}
