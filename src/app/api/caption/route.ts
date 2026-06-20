import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { activeProvider } from "@/lib/ai/provider";
import { captionWithMistral, MISTRAL_VISION_MODEL } from "@/lib/ai/mistral";

// The Anthropic SDK needs the Node runtime, not Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_MODEL = "claude-opus-4-8";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // base64 of the poster/image we caption

/** The structured output we force the vision model to return. */
const captionSchema = z
  .object({
    caption: z.string().describe("One calm, concrete sentence describing the image"),
    tags: z.array(z.string()).describe("4–12 lowercase keyword tags"),
  })
  .strict();

/**
 * Caption a single asset. The BROWSER sends the bytes it already holds (the
 * just-uploaded image, or a poster frame it extracted from a video) as base64 —
 * the pod is never read server-side, preserving the browser-talks-to-pod
 * invariant. With no ANTHROPIC_API_KEY, a filename heuristic stands in so the
 * upload → caption loop still works offline.
 */
export async function POST(req: NextRequest) {
  let body: { base64?: string; mimeType?: string; kind?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const base64 = (body.base64 ?? "").replace(/^data:[^,]+,/, "");
  if (!base64) {
    return NextResponse.json({ error: "base64 image data is required" }, { status: 400 });
  }
  if (base64.length > MAX_IMAGE_BYTES * 1.4) {
    return NextResponse.json({ error: "Image too large to caption" }, { status: 413 });
  }
  const mimeType = normalizeMime(body.mimeType);
  const kind = body.kind === "video" ? "video" : "photo";
  const name = typeof body.name === "string" ? body.name : "";

  const provider = activeProvider();
  if (!provider) {
    return NextResponse.json({ ...fallbackCaption(name, kind), source: "local" });
  }

  try {
    const out =
      provider === "mistral"
        ? await captionWithMistral(base64, mimeType, kind, captionSchema)
        : await captionWithClaude(base64, mimeType, kind);
    const model = provider === "mistral" ? MISTRAL_VISION_MODEL : ANTHROPIC_MODEL;
    return NextResponse.json({ ...out, source: "model", model });
  } catch (e) {
    // Captioning is best-effort; never block an upload on it. Degrade to the
    // heuristic and report the error so the client can surface it softly.
    return NextResponse.json({
      ...fallbackCaption(name, kind),
      source: "local",
      warning: e instanceof Error ? e.message : String(e),
    });
  }
}

function normalizeMime(m: unknown): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const s = typeof m === "string" ? m.toLowerCase() : "";
  if (s.includes("png")) return "image/png";
  if (s.includes("webp")) return "image/webp";
  if (s.includes("gif")) return "image/gif";
  return "image/jpeg";
}

async function captionWithClaude(
  base64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  kind: "photo" | "video"
): Promise<{ caption: string; tags: string[] }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

  const client = new Anthropic();
  const prompt =
    kind === "video"
      ? "This is a poster frame from a short video clip. Write one calm, concrete sentence describing it, plus 4–12 lowercase keyword tags (subjects, setting, mood, light). No journal phrasing, no dates."
      : "Write one calm, concrete sentence describing this photo, plus 4–12 lowercase keyword tags (subjects, setting, mood, light). No journal phrasing, no dates.";

  const message = await client.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    output_config: { format: zodOutputFormat(captionSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const parsed = message.parsed_output as { caption: string; tags: string[] } | null;
  if (!parsed) throw new Error("model returned no caption");
  return { caption: parsed.caption, tags: parsed.tags.slice(0, 12).map((t) => t.toLowerCase()) };
}

/** Derive a passable caption + tags from the filename when there's no key. */
function fallbackCaption(name: string, kind: "photo" | "video"): { caption: string; tags: string[] } {
  const stem = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  const words = stem
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !/^(img|dsc|mov|vid|photo|video)$/.test(w))
    .slice(0, 6);
  const caption = stem && words.length ? stem : kind === "video" ? "a short video clip" : "a photo";
  const tags = words.length ? words : [kind];
  return { caption, tags };
}
