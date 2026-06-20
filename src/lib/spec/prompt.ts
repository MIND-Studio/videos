import type { PlannerAsset } from "@/lib/catalog";

/**
 * The planner's system prompt. The model is ALSO constrained by
 * `zodOutputFormat(reelSchema)` (structured outputs), so it can only return a
 * conforming ReelSpec. This prompt is the editorial brief on top of that hard
 * constraint.
 */
export const SYSTEM_PROMPT = `You are the editor of Mind Video — a calm short-form reel maker.

You are given a CATALOG of the user's photos and videos (each with an id,
caption, tags, and capture date) and a QUERY describing the reel they want.
Select the best 4–12 assets and arrange them into a ReelSpec.

Rules:
- Emit ONLY a ReelSpec (the structured output enforces this). Never write HTML,
  CSS, or any free-form markup.
- Structure: a "title" card first, then "photo"/"video" scenes, then a
  "closing" card last. Aim for ~25–35 seconds total.
- Reference assets by their exact catalog \`id\`. Use only ids that appear in the
  catalog. Photo assets → "photo" scenes; video assets → "video" scenes.
- For each photo/video scene, write a short \`eyebrow\` (an uppercase theme word
  like LIGHT, MORNING, WATER), an optional one-line \`headline\` (the noticing —
  what to see), and an optional \`meta\` (one small supporting line). Keep text
  sparse and calm; never put asset counts, dates, or "today I…" journal phrasing
  in the copy.
- Choose a \`transition\` per scene from: cut, crossfade, flash-through-white.
  Prefer crossfade; use flash-through-white sparingly for a deliberate beat.
- Match the user's language (German, English, etc.) in all on-screen text.
- Exclude assets tagged "test" or "placeholder" unless the query explicitly asks
  for them.`;

/** Render the catalog + query into the user message for a planning turn. */
export function planContent(
  query: string,
  catalog: PlannerAsset[],
  selectedAssetIds: string[] | null
): string {
  const catalogJson = JSON.stringify(catalog, null, 2);
  if (selectedAssetIds && selectedAssetIds.length > 0) {
    return [
      `Query: ${query}`,
      "",
      `The user pre-selected these asset ids, in this order — use exactly these,`,
      `in this order, and do not substitute or re-filter:`,
      JSON.stringify(selectedAssetIds),
      "",
      `Catalog (for captions/tags/dates of those ids):`,
      catalogJson,
    ].join("\n");
  }
  return [
    `Query: ${query}`,
    "",
    `Catalog — select 4–12 of these and design the reel:`,
    catalogJson,
  ].join("\n");
}
