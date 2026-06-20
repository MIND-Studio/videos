# AGENTS.md — mind-videos

Orientation for agents working in this prototype. **Read this before editing.**

## What it is

Mind Videos — drop photos/videos, Claude vision captions them, then a natural-
language query becomes a short reel. Sibling of drive/notes/chat/slides — own
port, own data, own docs. **Do not unify with sibling prototypes.** Dev port
**3170**; render worker **3172**; shared pod (mind-node) **3011**.

It is the fleet-native rebuild of the `mind-experiments/mind-video` ("drop-cut")
prototype. The old prototype was Express + vanilla JS + a local-filesystem
inbox/outbox queue where a terminal Claude WAS the editor. None of that is here:
captioning + planning are `/api/*` routes calling the Anthropic SDK, storage is
the pod, and rendering is a stateless worker.

## The one rule that defines this project

**The planner only ever emits a `ReelSpec`. There is no other authoring path.**

- `src/lib/spec/schema.ts` — the Zod `ReelSpec`: a discriminated union over a
  fixed set of scene `kind`s (`title`, `photo`, `video`, `closing`) and a fixed
  `transition` enum. This is the *entire* surface the planner can touch.
- `src/lib/reel/serialize.ts` — `serializeReel(spec, resolveAssetUrl)` is the
  **only** path from a ReelSpec to the hyperframes composition `index.html`. The
  scene/transition vocabulary maps 1:1 to the vendored blocks (see
  `hyperframes/`). No free-form HTML/CSS/JS ever reaches the renderer.

If you want a new visual capability, add a **block** (vendor it under
`hyperframes/blocks/` via `npx hyperframes add`, add a schema enum value, add a
serializer case) — never a runtime escape hatch, never a runtime
`hyperframes add`.

## Preview and render share ONE artifact

Hyperframes compositions are plain HTML + a paused GSAP timeline on
`window.__timelines.main`. So `serializeReel` output serves BOTH:
- **Preview** — `src/components/ReelCanvas.tsx` mounts it in an iframe and drives
  the timeline with a `requestAnimationFrame` seeker (pod assets as `blob:`
  URLs). Server-free, multi-user safe.
- **Export** — the browser (`src/lib/publish/render-client.ts`) fetches the
  assets, serializes with local filenames, and posts `{ html, assets }` to
  `/api/render` → the worker, which runs `npx hyperframes render`. The worker is
  spec-agnostic: it only writes files and shells out.

## Hard rules

1. **Pod is the ONLY store.** No API route persists anything. `/api/caption` and
   `/api/plan` are stateless transforms (bytes/text in → JSON out); `/api/render`
   is a pure forwarder. All pod I/O is client-side through `fetcher()`
   (`src/lib/solid/{asset-store,reel-store}.ts`). Adding an `/api/assets` route
   would break the browser-talks-to-pod invariant.
2. **Single-flight OIDC.** `handleIncomingRedirect` is memoized in
   `src/lib/solid/auth.ts` and called once per page load. Never add a second
   call site.
3. **The worker holds no pod credentials** and persists nothing (per-request
   temp dir, `rm -rf` after). The browser uploads the MP4 to the pod.
4. **Re-validate** every model/worker output with `validateReel` before trusting
   or rendering it.
5. **Never log** tokens or secrets.

## NOT the Next.js you know

Next.js **16.2.6** + React **19.2.4**. Read `node_modules/next/dist/docs/` before
relying on training-cutoff memory. Solid: CSS v7 / WAC; OIDC via
`@inrupt/solid-client-authn-*`.

## Design system

Entirely `@mind-studio/ui` (shadcn-native), Mind brand, **dark** default. Semantic
tokens only (`bg-background`, `text-muted-foreground`, `bg-primary`, …) — no
bespoke palette in the app chrome. The reel composition's own look lives in the
`STYLES` constant in `serialize.ts`. `@mind-studio/*` install from GitHub Packages
— `export NODE_AUTH_TOKEN=<read:packages PAT>` before `npm install`.

## Hyperframes gotchas (carried from the prototype)

- Each scene gets its OWN `data-track-index` so overlapping crossfades pass
  `npx hyperframes lint`.
- ffmpeg here may lack `drawtext` — all text lives in HTML, never a drawtext
  filter.
- The render worker needs **Node 22+**, a system **ffmpeg**, and Chromium.

## Checks before handing off

```bash
npm run typecheck   # tsc --noEmit
npm test            # scripts/smoke.ts — spec pipeline invariants (no key/pod/ffmpeg)
npm run build       # Next production build (standalone)
```

## Never commit

`node_modules/`, `.next/`, `.css-data/`, `.work/`, `.env*`.

## Ask before doing

- Any server-side persistence or an `/api/assets` route (breaks browser↔pod).
- Runtime `hyperframes add` or free-form HTML in the serialize path.
- Touching sibling prototypes — they have their own `AGENTS.md`.
