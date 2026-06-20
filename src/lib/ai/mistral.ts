import type { z } from "zod";
import type { PlannerAsset } from "@/lib/catalog";
import { planContent, SYSTEM_PROMPT } from "@/lib/spec/prompt";
import { reelSchema } from "@/lib/spec/schema";

/**
 * Mistral provider for the plan + caption routes. Mirrors the Anthropic path:
 * `chat.parse` sends a JSON-schema `responseFormat` derived from our zod schema,
 * so the model can only return a conforming shape. Selected via
 * AI_PROVIDER=mistral — see {@link activeProvider}.
 *
 * Why we read `content` instead of the SDK's `parsed`: Mistral fills *optional*
 * fields with explicit `null` (e.g. `"eyebrow": null`), and zod `.optional()`
 * accepts `undefined`, not `null` — so the SDK's internal zod parse fails and
 * `parsed` comes back null even on otherwise-perfect JSON. We strip null-valued
 * keys (null ≡ "absent" here) and let the caller re-validate. The plan route
 * runs `validateReel` next; the caption helper validates against its schema.
 */

// Models are env-overridable so a key can pin a cheaper/larger tier. Defaults:
// a large text model for planning, a vision model (Pixtral) for captioning.
export const MISTRAL_PLAN_MODEL = process.env.MISTRAL_PLAN_MODEL ?? "mistral-large-latest";
export const MISTRAL_VISION_MODEL = process.env.MISTRAL_VISION_MODEL ?? "pixtral-12b-2409";

async function mistralClient() {
  const { Mistral } = await import("@mistralai/mistralai");
  return new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
}

/** Recursively drop null-valued keys so they read as "absent" to zod optionals. */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === null) continue;
      out[k] = stripNulls(val);
    }
    return out;
  }
  return v;
}

/** Pull the JSON object out of a parse reply, tolerating null-filled optionals. */
function objectFrom(message: { content?: unknown } | undefined): unknown {
  const content = typeof message?.content === "string" ? message.content : "";
  if (!content.trim()) throw new Error("Mistral returned empty content");
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  const json = start >= 0 && end > start ? content.slice(start, end + 1) : content;
  return stripNulls(JSON.parse(json));
}

export async function planWithMistral(
  query: string,
  catalog: PlannerAsset[],
  selectedAssetIds: string[] | null,
): Promise<unknown> {
  const client = await mistralClient();
  const res = await client.chat.parse({
    model: MISTRAL_PLAN_MODEL,
    maxTokens: 8000,
    responseFormat: reelSchema as z.ZodType,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: planContent(query, catalog, selectedAssetIds) },
    ],
  });
  return objectFrom(res.choices?.[0]?.message);
}

export async function captionWithMistral(
  base64: string,
  mimeType: string,
  kind: "photo" | "video",
  captionSchema: z.ZodType<{ caption: string; tags: string[] }>,
): Promise<{ caption: string; tags: string[] }> {
  const client = await mistralClient();
  const prompt =
    kind === "video"
      ? "This is a poster frame from a short video clip. Write one calm, concrete sentence describing it, plus 4–12 lowercase keyword tags (subjects, setting, mood, light). No journal phrasing, no dates."
      : "Write one calm, concrete sentence describing this photo, plus 4–12 lowercase keyword tags (subjects, setting, mood, light). No journal phrasing, no dates.";

  const res = await client.chat.parse({
    model: MISTRAL_VISION_MODEL,
    maxTokens: 1024,
    responseFormat: captionSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", imageUrl: `data:${mimeType};base64,${base64}` },
        ],
      },
    ],
  });

  const parsed = captionSchema.safeParse(objectFrom(res.choices?.[0]?.message));
  if (!parsed.success) throw new Error("Mistral returned no caption");
  return {
    caption: parsed.data.caption,
    tags: parsed.data.tags.slice(0, 12).map((t) => t.toLowerCase()),
  };
}
