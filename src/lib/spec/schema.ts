import { z } from "zod";

/**
 * The ReelSpec is the ONLY contract the planner (or any UI) ever emits. Every
 * field is constrained; there is no free-form HTML/CSS/JS escape hatch. The
 * scene `kind`s and the `transition` enum map 1:1 to the vendored hyperframes
 * blocks under `hyperframes/blocks/`, and `src/lib/reel/serialize.ts` is the
 * single path from a validated ReelSpec to the hyperframes composition. So a
 * well-typed spec can only ever produce our controlled set of blocks.
 *
 * Schema design rules (so it round-trips through Anthropic structured outputs /
 * `zodOutputFormat` without unsupported-keyword errors):
 *   - discriminated union on `kind` (no recursion)
 *   - no string-length / numeric-range keywords in the emitted JSON schema —
 *     soft bounds are enforced afterwards in `clampReel`
 *   - every object is closed (`.strict()`)
 */

/** The transition INTO a scene. Each maps to a vendored hyperframes block. */
export const TRANSITIONS = ["cut", "crossfade", "flash-through-white"] as const;
export type Transition = (typeof TRANSITIONS)[number];

// ---- the controlled scene set ----------------------------------------------

const titleCard = z
  .object({
    kind: z.literal("title"),
    eyebrow: z.string().optional().describe("Tiny uppercase eyebrow above the title"),
    title: z.string().describe("The reel's opening title — short and evocative"),
    subtitle: z.string().optional().describe("One supporting line under the title"),
    duration: z.number().optional().describe("Seconds on screen (default ~3.5)"),
  })
  .strict();

const photoScene = z
  .object({
    kind: z.literal("photo"),
    assetId: z.string().describe("Catalog id of the photo to show (from the provided catalog)"),
    eyebrow: z.string().optional().describe("Tiny uppercase theme word, e.g. 'LIGHT' or 'MORNING'"),
    headline: z.string().optional().describe("A short noticing — what to see in this frame"),
    meta: z.string().optional().describe("One small supporting line under the headline"),
    transition: z.enum(TRANSITIONS).optional().describe("Transition INTO this scene (default crossfade)"),
    duration: z.number().optional().describe("Seconds on screen (default ~4.5)"),
  })
  .strict();

const videoScene = z
  .object({
    kind: z.literal("video"),
    assetId: z.string().describe("Catalog id of the video clip to show"),
    eyebrow: z.string().optional(),
    headline: z.string().optional(),
    meta: z.string().optional(),
    transition: z.enum(TRANSITIONS).optional().describe("Transition INTO this scene (default crossfade)"),
    duration: z.number().optional().describe("Seconds of the clip to play (default ~5)"),
  })
  .strict();

const closingCard = z
  .object({
    kind: z.literal("closing"),
    title: z.string().describe("The closing line — a soft landing"),
    note: z.string().optional().describe("Optional one-line sign-off"),
    duration: z.number().optional().describe("Seconds on screen (default ~3.5)"),
  })
  .strict();

export const sceneSchema = z.discriminatedUnion("kind", [
  titleCard,
  photoScene,
  videoScene,
  closingCard,
]);

export const reelSchema = z
  .object({
    title: z.string().describe("Reel title — used for the pod folder name and the title card"),
    scenes: z.array(sceneSchema).describe("The ordered scenes: title card → photo/video scenes → closing card"),
  })
  .strict();

export type Scene = z.infer<typeof sceneSchema>;
export type ReelSpec = z.infer<typeof reelSchema>;
export type SceneKind = Scene["kind"];

export const SCENE_KINDS: SceneKind[] = ["title", "photo", "video", "closing"];

/** Default per-kind durations (seconds) used when a scene omits `duration`. */
export const DEFAULT_DURATION: Record<SceneKind, number> = {
  title: 3.5,
  photo: 4.5,
  video: 5,
  closing: 3.5,
};

/** Crossfade overlap (seconds) between consecutive scenes. */
export const CROSSFADE = 0.6;
