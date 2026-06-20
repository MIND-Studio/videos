import { type NextRequest, NextResponse } from "next/server";
import { MISTRAL_PLAN_MODEL, planWithMistral } from "@/lib/ai/mistral";
import { activeProvider } from "@/lib/ai/provider";
import type { PlannerAsset } from "@/lib/catalog";
import { composeReel } from "@/lib/spec/compose";
import { planContent, SYSTEM_PROMPT } from "@/lib/spec/prompt";
import { reelSchema } from "@/lib/spec/schema";
import { validateReel } from "@/lib/spec/validate";

// The Anthropic SDK needs the Node runtime, not Edge.
export const runtime = "nodejs";

const MAX_QUERY_CHARS = 2000;
const MAX_CATALOG = 400;
const ANTHROPIC_MODEL = "claude-opus-4-8";

/**
 * Plan a reel from a natural-language query + the user's catalog (text only —
 * captions/tags/dates, never bytes). Returns a schema-validated ReelSpec.
 *
 * With ANTHROPIC_API_KEY set, Claude is constrained to `reelSchema` via
 * structured outputs, so it can only return a conforming spec. Without a key, a
 * deterministic local composer produces a valid spec so the loop works offline.
 * Either way the result is re-validated before return; the browser renders it
 * in-process (no server-side render state).
 */
export async function POST(req: NextRequest) {
  let body: { query?: string; catalog?: unknown; selectedAssetIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "A query is required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `Query too long (max ${MAX_QUERY_CHARS} characters)` },
      { status: 413 },
    );
  }

  const catalog = sanitizeCatalog(body.catalog);
  if (catalog.length === 0) {
    return NextResponse.json(
      { error: "Your library is empty — drop some photos or videos first." },
      { status: 422 },
    );
  }
  const selectedAssetIds = sanitizeIds(body.selectedAssetIds);

  let rawReel: unknown;
  let source: "model" | "local";
  let model: string | null = null;

  const provider = activeProvider();
  if (provider === "mistral") {
    try {
      rawReel = await planWithMistral(query, catalog, selectedAssetIds);
      source = "model";
      model = MISTRAL_PLAN_MODEL;
    } catch (e) {
      return NextResponse.json(
        { error: `Planning failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 502 },
      );
    }
  } else if (provider === "anthropic") {
    try {
      rawReel = await planWithClaude(query, catalog, selectedAssetIds);
      source = "model";
      model = ANTHROPIC_MODEL;
    } catch (e) {
      const { message, status } = await describeAnthropicError(e);
      return NextResponse.json({ error: message }, { status });
    }
  } else {
    rawReel = composeReel(query, catalog, selectedAssetIds);
    source = "local";
  }

  const result = validateReel(rawReel);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  // Guard: a model could hallucinate an assetId not in the catalog. Drop scenes
  // that reference unknown assets so the renderer never 404s.
  const known = new Set(catalog.map((a) => a.id));
  const scenes = result.reel.scenes.filter(
    (s) => !(s.kind === "photo" || s.kind === "video") || known.has(s.assetId),
  );
  const reel = { ...result.reel, scenes };

  return NextResponse.json({ reel, source, model });
}

function sanitizeCatalog(input: unknown): PlannerAsset[] {
  if (!Array.isArray(input)) return [];
  const out: PlannerAsset[] = [];
  for (const raw of input.slice(0, MAX_CATALOG)) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (typeof a.id !== "string") continue;
    out.push({
      id: a.id,
      kind: a.kind === "video" ? "video" : "photo",
      caption: typeof a.caption === "string" ? a.caption : "",
      tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === "string") : [],
      captureDate: typeof a.captureDate === "string" ? a.captureDate : "",
    });
  }
  return out;
}

function sanitizeIds(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const ids = input.filter((x): x is string => typeof x === "string");
  return ids.length ? ids : null;
}

async function planWithClaude(
  query: string,
  catalog: PlannerAsset[],
  selectedAssetIds: string[] | null,
): Promise<unknown> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

  const client = new Anthropic();
  const message = await client.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(reelSchema) },
    messages: [{ role: "user", content: planContent(query, catalog, selectedAssetIds) }],
  });
  return message.parsed_output ?? message;
}

async function describeAnthropicError(e: unknown): Promise<{ message: string; status: number }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  if (e instanceof Anthropic.AuthenticationError) {
    return { message: "Planning key rejected — check ANTHROPIC_API_KEY.", status: 502 };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { message: "Planning is rate-limited right now — try again shortly.", status: 429 };
  }
  if (e instanceof Anthropic.APIError) {
    return { message: `Planning failed (${e.status}): ${e.message}`, status: 502 };
  }
  return {
    message: `Planning failed: ${e instanceof Error ? e.message : String(e)}`,
    status: 502,
  };
}
