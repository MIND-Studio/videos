# Mind Video

Drop photos and videos, let Claude caption them, then describe the reel you want.
The agent plans a schema-validated `ReelSpec`, it previews live in your browser,
and one click renders an MP4 — all stored in **your Solid pod**, never our
servers.

Part of the [mindpods.org](https://mindpods.org) fleet (sibling of drive, notes,
chat, slides, …). Built on Next.js 16 + React 19 + `@mind-studio/ui`.

## How it works

```
drop ──▶ pod  <pod>/mind-video/assets/<id> + <id>.json     (browser → pod)
     └─▶ /api/caption (Claude vision) ─▶ caption + tags ─▶ sidecar

"make a reel about X" ─▶ /api/plan (Claude, structured output) ─▶ ReelSpec
ReelSpec ─ serializeReel() ─▶ hyperframes composition (ONE artifact)
   ├─ preview: ReelCanvas mounts it in an iframe, drives window.__timelines.main
   └─ export : /api/render ─▶ worker `npx hyperframes render` ─▶ MP4 ─▶ pod
```

The browser talks directly to your pod; the worker is stateless and holds no
credentials. See `AGENTS.md` for the architecture rules.

## Quickstart (dev)

Requires Node 22+, a `read:packages` GitHub PAT (for `@mind-studio/*`), and —
for MP4 export — a system `ffmpeg`.

```bash
export NODE_AUTH_TOKEN=<your read:packages PAT>
npm install

# optional: with a key, captions + planning use Claude; without, offline fallbacks
export ANTHROPIC_API_KEY=sk-ant-...

# 1. start the shared pod server on :3011 (see ../../SOLID-SERVER.md), then:
npm run seed:demo     # seed alice's pod with a few captioned demo assets

# 2. run the app + the render worker
npm run dev           # studio on http://localhost:3170
npm run worker        # MP4 render worker on :3172  (needed only for Export MP4)
```

Sign in at `/connect` (dev pod: `alice@mind-video.local` /
`dev-only-do-not-use-in-prod`), then open `/studio`.

## Scripts

| Script            | What it does                                              |
|-------------------|-----------------------------------------------------------|
| `npm run dev`     | Next dev server on :3170                                  |
| `npm run worker`  | Stateless hyperframes MP4 render worker on :3172          |
| `npm run seed:demo` | Seed demo assets into alice's pod                       |
| `npm run typecheck` | `tsc --noEmit`                                          |
| `npm test`        | `scripts/smoke.ts` — spec pipeline invariants (no key/pod/ffmpeg) |
| `npm run build`   | Next production build (standalone)                        |

## Ports

| Service                 | Port |
|-------------------------|------|
| Next.js dev / web       | 3170 |
| Render worker           | 3172 |
| Shared pod (mind-node)  | 3011 |

## Privacy

Your assets and reels live at `<pod>/mind-video/` and never touch a Mind server.
The query you type and a single caption thumbnail are sent to the model (the
authoring tool); nothing else leaves your pod.
