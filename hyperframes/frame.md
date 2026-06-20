# Mind Video — hyperframes composition project

This folder is the **render project base** for Mind Video reels. The render
worker (`worker/server.mjs`) copies it into a per-request temp dir, writes a
generated `index.html` into it, drops the selected assets next to it, and runs
`npx hyperframes render . -o out.mp4`.

**The composition is generated, not hand-written.** `src/lib/reel/serialize.ts`
is the single source of truth: `serializeReel(spec, resolveAssetUrl)` turns a
validated `ReelSpec` into the hyperframes `index.html`. The same function feeds
the in-browser preview (`src/components/ReelCanvas.tsx`).

## Fixed vocabulary

The planner only ever emits a `ReelSpec` over this fixed set (see
`src/lib/spec/schema.ts`); nothing else can reach the renderer.

| Scene `kind` | Block | Notes |
|--------------|-------|-------|
| `title`      | title card    | eyebrow + title + subtitle, centered |
| `photo`      | ken-burns photo | full-bleed image, slow scale, label block |
| `video`      | video scene   | clip playhead driven by the timeline |
| `closing`    | closing card  | soft sign-off |

| `transition` | Block | Notes |
|--------------|-------|-------|
| `cut`        | hard cut       | no fade in |
| `crossfade`  | crossfade      | 0.6s opacity overlap with the previous scene |
| `flash-through-white` | flash | quick white wash at the boundary |

## Adding a block (dev-time only)

The catalog is a **dev-time** component library, never a runtime install. To add
a capability:

1. `npx hyperframes add <block>` here once, and vendor the result under `blocks/`.
2. Add the new value to the relevant enum in `src/lib/spec/schema.ts`.
3. Add a serializer case in `src/lib/reel/serialize.ts`.

Never let the planner pull or write blocks at runtime — that would break the
"agent only emits a spec over a fixed vocabulary" invariant.

## Format contract (carried from the drop-cut prototype)

- Every scene is a `<div class="clip" data-start data-duration data-track-index>`.
- Each scene gets its **own** `data-track-index` so overlapping crossfades pass
  `npx hyperframes lint`.
- The GSAP timeline is `gsap.timeline({ paused: true })`, registered on
  `window.__timelines.main`; the engine seeks it frame-by-frame.
- Text lives in HTML (this build's ffmpeg has no `drawtext`).
- Requires Node 22+ and a system `ffmpeg`.
