import type { PlannerAsset } from "@/lib/catalog";
import type { ReelSpec, Scene, Transition } from "./schema";

/**
 * Deterministic offline planner. When no ANTHROPIC_API_KEY is set, /api/plan
 * falls back to this so the drop → caption → make → preview loop still works
 * (and `npm test` can exercise the spec pipeline without a key or a pod).
 *
 * It scores catalog assets by keyword overlap with the query (caption + tags),
 * keeps catalog order for ties (stable, no randomness), picks up to 8, and
 * builds a title → scenes → closing ReelSpec.
 */

const STOPWORDS = new Set([
  "make",
  "a",
  "an",
  "the",
  "video",
  "reel",
  "clip",
  "movie",
  "about",
  "of",
  "with",
  "show",
  "me",
  "please",
  "create",
  "build",
  "in",
  "on",
  "to",
  "and",
  "for",
  "my",
  "some",
  "today",
  "this",
  "week",
  "from",
  "30s",
  "second",
  "seconds",
  "minute",
  "mach",
  "ein",
  "über",
  "von",
  "mit",
  " aus",
  "zeig",
]);

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function scoreAsset(asset: PlannerAsset, words: string[]): number {
  if (words.length === 0) return 1; // no keywords → everything is equally fine
  const hay = (asset.caption + " " + asset.tags.join(" ")).toLowerCase();
  let score = 0;
  for (const w of words) {
    if (asset.tags.some((t) => t.toLowerCase() === w)) score += 2;
    else if (hay.includes(w)) score += 1;
  }
  return score;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function reelTitle(query: string, words: string[]): string {
  const subject = words.slice(0, 3).join(" ").trim();
  if (subject) return titleCase(subject);
  const cleaned = query.trim();
  return cleaned ? titleCase(cleaned.slice(0, 40)) : "A Few Moments";
}

export function composeReel(
  query: string,
  catalog: PlannerAsset[],
  selectedAssetIds: string[] | null,
): ReelSpec {
  const words = keywords(query);

  let chosen: PlannerAsset[];
  if (selectedAssetIds && selectedAssetIds.length > 0) {
    // Honor the explicit selection and order; drop ids not in the catalog.
    const byId = new Map(catalog.map((a) => [a.id, a]));
    chosen = selectedAssetIds
      .map((id) => byId.get(id))
      .filter((a): a is PlannerAsset => Boolean(a));
  } else {
    const usable = catalog.filter((a) => !a.tags.some((t) => t === "test" || t === "placeholder"));
    chosen = usable
      .map((a, i) => ({ a, i, s: scoreAsset(a, words) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || x.i - y.i) // score desc, stable by index
      .slice(0, 8)
      .map((x) => x.a);
    // Nothing matched the keywords — fall back to the newest few in catalog order.
    if (chosen.length === 0) chosen = usable.slice(0, 6);
  }

  const title = reelTitle(query, words);
  const scenes: Scene[] = [{ kind: "title", title, eyebrow: "MIND VIDEO", duration: 3.5 }];

  chosen.forEach((asset, idx) => {
    const eyebrow = (asset.tags[0] ?? "scene").toUpperCase();
    const transition: Transition = idx === 0 ? "cut" : "crossfade";
    if (asset.kind === "video") {
      scenes.push({
        kind: "video",
        assetId: asset.id,
        eyebrow,
        headline: asset.caption,
        transition,
        duration: 5,
      });
    } else {
      scenes.push({
        kind: "photo",
        assetId: asset.id,
        eyebrow,
        headline: asset.caption,
        transition,
        duration: 4.5,
      });
    }
  });

  scenes.push({ kind: "closing", title, note: "made with Mind Video", duration: 3.5 });

  return { title, scenes };
}
