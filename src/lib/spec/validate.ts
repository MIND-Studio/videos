import { DEFAULT_DURATION, type ReelSpec, reelSchema, type Scene } from "./schema";

export type ValidateResult = { ok: true; reel: ReelSpec } | { ok: false; error: string };

/**
 * Parse unknown JSON into a ReelSpec with a human-readable error suitable for
 * surfacing in the UI (not a raw Zod dump). Used to re-validate whatever the
 * model (or the worker) returns before we ever trust it / serialize it.
 */
export function validateReel(input: unknown): ValidateResult {
  const parsed = reelSchema.safeParse(input);
  if (parsed.success) return { ok: true, reel: clampReel(parsed.data) };

  const first = parsed.error.issues[0];
  const path = first?.path.join(".") || "(root)";
  return {
    ok: false,
    error: `Invalid reel spec at ${path}: ${first?.message ?? "unknown error"}`,
  };
}

/**
 * Soft bounds enforced AFTER schema parse (kept out of the JSON schema so the
 * structured-output request stays portable). Trims a runaway model to sane
 * limits and clamps durations rather than rejecting — the reel still renders.
 */
export function clampReel(reel: ReelSpec): ReelSpec {
  const scenes = reel.scenes.slice(0, 16).map(clampScene);
  return { ...reel, scenes: scenes.length ? scenes : reel.scenes.map(clampScene) };
}

function clampScene(scene: Scene): Scene {
  const d = scene.duration;
  if (d == null) return scene;
  // Keep each scene between 1.5s and 12s — a guard against a model returning 0
  // or a runaway 120.
  const clamped = Math.min(12, Math.max(1.5, d));
  return clamped === d ? scene : { ...scene, duration: clamped };
}

/** The effective duration of a scene (its own value, or the per-kind default). */
export function sceneDuration(scene: Scene): number {
  return scene.duration ?? DEFAULT_DURATION[scene.kind];
}
