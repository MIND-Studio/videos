import {
  type ReelSpec,
  type Scene,
  type SceneKind,
  DEFAULT_DURATION,
  CROSSFADE,
} from "@/lib/spec/schema";

/**
 * serializeReel — the SINGLE path from a validated ReelSpec to the hyperframes
 * composition `index.html`. This one artifact serves BOTH:
 *   - the in-browser preview (ReelCanvas mounts it in an iframe and drives
 *     `window.__timelines.main`), and
 *   - the MP4 export (the worker writes it into a hyperframes project and runs
 *     `npx hyperframes render`, which seeks the same timeline frame-by-frame).
 *
 * The scene `kind`s and `transition`s come straight from the ReelSpec's fixed
 * vocabulary; the per-scene HTML + GSAP recipes below ARE the vendored blocks
 * (see hyperframes/blocks/ for the canonical reference + design tokens). There
 * is no free-form HTML path — adding a block means adding a recipe here plus a
 * schema enum, never an escape hatch.
 *
 * `resolveAssetUrl(assetId, kind)` is injected so the same serializer targets
 * different asset locations: pod `blob:` URLs for preview, local filenames
 * (`1-<id>.jpg`) inside the worker's temp project.
 */

export type AssetResolver = (assetId: string, kind: "photo" | "video") => string;

export const COMP_WIDTH = 1080;
export const COMP_HEIGHT = 1920;
export const FPS = 30;

export interface SceneTiming {
  scene: Scene;
  index: number;
  start: number;
  duration: number;
  end: number;
  track: number;
}

/** Lay scenes out on a timeline, overlapping crossfade/flash transitions. */
export function layoutScenes(reel: ReelSpec): { timings: SceneTiming[]; total: number } {
  const timings: SceneTiming[] = [];
  let cursor = 0;
  reel.scenes.forEach((scene, index) => {
    const duration = scene.duration ?? DEFAULT_DURATION[scene.kind];
    const overlaps =
      index > 0 &&
      "transition" in scene &&
      (scene.transition === "crossfade" || scene.transition === "flash-through-white");
    const start = index === 0 ? 0 : overlaps ? Math.max(0, cursor - CROSSFADE) : cursor;
    const end = start + duration;
    timings.push({ scene, index, start, duration, end, track: index });
    cursor = end;
  });
  const total = timings.length ? timings[timings.length - 1].end : 0;
  return { timings, total };
}

export function reelDuration(reel: ReelSpec): number {
  return layoutScenes(reel).total;
}

function esc(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelBlock(id: string, eyebrow?: string, headline?: string, meta?: string): string {
  if (!eyebrow && !headline && !meta) return "";
  return `<div class="label-block">
        ${eyebrow ? `<div class="label-eyebrow" id="${id}-eb">${esc(eyebrow)}</div>` : ""}
        ${headline ? `<div class="label-title" id="${id}-ti">${esc(headline)}</div>` : ""}
        ${meta ? `<div class="label-meta" id="${id}-me">${esc(meta)}</div>` : ""}
      </div>`;
}

function sceneMarkup(t: SceneTiming, resolve: AssetResolver): string {
  const { scene, index, start, duration, track } = t;
  const id = `s${index}`;
  const z = index + 1;
  const flash =
    "transition" in scene && scene.transition === "flash-through-white"
      ? `<div class="flash" id="${id}-flash"></div>`
      : "";

  if (scene.kind === "title" || scene.kind === "closing") {
    const eyebrow = scene.kind === "title" ? scene.eyebrow : undefined;
    const lead = scene.kind === "title" ? scene.title : scene.title;
    const sub = scene.kind === "title" ? scene.subtitle : scene.note;
    return `<div id="${id}" class="clip card ${scene.kind}" data-start="${start}" data-duration="${duration}" data-track-index="${track}" style="z-index:${z}">
      <div class="chrome"></div>
      <div class="card-body">
        ${eyebrow ? `<div class="card-eyebrow" id="${id}-eb">${esc(eyebrow)}</div>` : ""}
        <div class="card-title" id="${id}-ti">${esc(lead)}</div>
        ${sub ? `<div class="card-sub" id="${id}-su">${esc(sub)}</div>` : ""}
      </div>
      ${flash}
    </div>`;
  }

  // photo / video scene
  const url = resolve(scene.assetId, scene.kind);
  const media =
    scene.kind === "video"
      ? `<video id="${id}-fg" class="media-fg" src="${esc(url)}" muted playsinline preload="auto"></video>
      <div class="media-bg" style="background-image:url('${esc(url)}')"></div>`
      : `<div class="media-bg" style="background-image:url('${esc(url)}')"></div>
      <img id="${id}-fg" class="media-fg" src="${esc(url)}" alt="" />`;

  return `<div id="${id}" class="clip scene ${scene.kind}" data-start="${start}" data-duration="${duration}" data-track-index="${track}" style="z-index:${z}">
      ${media}
      <div class="vignette"></div>
      ${labelBlock(id, scene.eyebrow, scene.headline, scene.meta)}
      ${flash}
    </div>`;
}

function timelineScript(timings: SceneTiming[], total: number): string {
  const lines: string[] = [];
  lines.push(`var tl = gsap.timeline({ paused: true });`);
  for (const t of timings) {
    const id = `s${t.index}`;
    const { scene, index, start, duration } = t;
    const fadeIn =
      index === 0 || ("transition" in scene && scene.transition === "cut") ? 0.001 : CROSSFADE;
    // Crossfade / cut-in for the whole clip.
    lines.push(`tl.from("#${id}", { opacity: 0, duration: ${fadeIn} }, ${start});`);

    if (scene.kind === "photo" || scene.kind === "video") {
      // Ken Burns: slow scale on the foreground media across the scene.
      lines.push(
        `tl.fromTo("#${id}-fg", { scale: 1.0 }, { scale: 1.08, duration: ${duration}, ease: "none" }, ${start});`
      );
      if (scene.kind === "video") {
        // Drive the clip's playhead from the timeline so it's frame-seekable.
        lines.push(
          `(function(){var v=document.getElementById("${id}-fg"); if(v){ tl.to({t:0},{t:${duration},duration:${duration},ease:"none",onUpdate:function(){try{v.currentTime=this.targets()[0].t;}catch(e){}}}, ${start}); }})();`
        );
      }
      // Label entrance.
      lines.push(`if(document.getElementById("${id}-eb")) tl.from("#${id}-eb", { x: -28, opacity: 0, duration: 0.5 }, ${start + 0.6});`);
      lines.push(`if(document.getElementById("${id}-ti")) tl.from("#${id}-ti", { y: 36, opacity: 0, duration: 0.6 }, ${start + 0.75});`);
      lines.push(`if(document.getElementById("${id}-me")) tl.from("#${id}-me", { y: 18, opacity: 0, duration: 0.5 }, ${start + 1.0});`);
    } else {
      // Card text entrance.
      lines.push(`if(document.getElementById("${id}-eb")) tl.from("#${id}-eb", { y: 16, opacity: 0, duration: 0.5 }, ${start + 0.3});`);
      lines.push(`tl.from("#${id}-ti", { y: 24, opacity: 0, duration: 0.7 }, ${start + 0.45});`);
      lines.push(`if(document.getElementById("${id}-su")) tl.from("#${id}-su", { y: 16, opacity: 0, duration: 0.5 }, ${start + 0.7});`);
    }

    // flash-through-white: a quick white wash at the scene boundary.
    if ("transition" in scene && scene.transition === "flash-through-white") {
      lines.push(`tl.fromTo("#${id}-flash", { opacity: 0.9 }, { opacity: 0, duration: 0.45, ease: "power2.out" }, ${Math.max(0, start - 0.15)});`);
    }
  }
  // Pin the total so the engine knows the exact length even if the last tween is shorter.
  lines.push(`tl.set({}, {}, ${total});`);
  lines.push(`window.__timelines = window.__timelines || {};`);
  lines.push(`window.__timelines.main = tl;`);
  return lines.join("\n      ");
}

/** Build the full hyperframes composition document for a reel. */
export function serializeReel(reel: ReelSpec, resolve: AssetResolver): string {
  const { timings, total } = layoutScenes(reel);
  const scenes = timings.map((t) => sceneMarkup(t, resolve)).join("\n    ");
  const script = timelineScript(timings, total);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(reel.title)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<style>${STYLES}</style>
</head>
<body>
  <div id="comp" class="composition" data-composition-id="main" data-start="0"
       data-duration="${total}" data-fps="${FPS}"
       style="width:${COMP_WIDTH}px;height:${COMP_HEIGHT}px">
    ${scenes}
  </div>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      ${script}
    });
  </script>
</body>
</html>`;
}

/** Design tokens + block styles — the vendored look (see hyperframes/blocks/). */
export const STYLES = `
:root{
  --bg:#0a0f0d; --fg:#e8f0eb; --muted:#8aa395; --accent:#6a8f4e; --cyan:#7fd1c4;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000;overflow:hidden}
.composition{position:relative;overflow:hidden;background:var(--bg);font-family:var(--sans);color:var(--fg)}
.clip{position:absolute;inset:0;will-change:opacity,transform}
.media-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(28px) brightness(0.5);transform:scale(1.15)}
.media-fg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;will-change:transform}
.vignette{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent 55%,rgba(0,0,0,0.55) 100%),linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 38%)}
.label-block{position:absolute;left:64px;right:64px;bottom:150px}
.label-eyebrow{font-family:var(--mono);font-size:30px;letter-spacing:0.32em;text-transform:uppercase;color:var(--cyan);margin-bottom:22px}
.label-title{font-size:74px;line-height:1.04;font-weight:600;letter-spacing:-0.01em;max-width:90%;text-wrap:balance}
.label-meta{margin-top:24px;font-size:34px;color:var(--muted);font-weight:400}
.card{display:flex;align-items:center;justify-content:center}
.card .chrome{position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 45%,rgba(106,143,78,0.18),transparent 70%),var(--bg)}
.card-body{position:relative;text-align:center;padding:0 90px}
.card-eyebrow{font-family:var(--mono);font-size:30px;letter-spacing:0.42em;text-transform:uppercase;color:var(--cyan);margin-bottom:42px}
.card-title{font-size:96px;line-height:1.02;font-weight:600;letter-spacing:-0.02em;text-wrap:balance}
.card-sub{margin-top:40px;font-size:38px;color:var(--muted)}
.closing .card-title{font-size:78px}
.flash{position:absolute;inset:0;background:#fff;pointer-events:none}
`;
