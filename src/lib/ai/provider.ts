/**
 * Which AI provider the plan + caption routes use this request. Resolved from
 * env so the same build can A/B Claude vs Mistral, or run fully offline:
 *
 *   AI_PROVIDER=mistral + MISTRAL_API_KEY    → "mistral"
 *   AI_PROVIDER=anthropic + ANTHROPIC_API_KEY → "anthropic"
 *   (no pref) → whichever key is present, Anthropic first
 *   (no usable key) → null, and the route falls back to its offline heuristic
 *
 * An explicit AI_PROVIDER whose key is missing resolves to null (offline)
 * rather than silently using the other provider — the choice is honoured.
 */
export type AiProvider = "anthropic" | "mistral";

export function activeProvider(): AiProvider | null {
  const pref = process.env.AI_PROVIDER?.toLowerCase();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasMistral = !!process.env.MISTRAL_API_KEY;

  if (pref === "mistral") return hasMistral ? "mistral" : null;
  if (pref === "anthropic") return hasAnthropic ? "anthropic" : null;

  if (hasAnthropic) return "anthropic";
  if (hasMistral) return "mistral";
  return null;
}
