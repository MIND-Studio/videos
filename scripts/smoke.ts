/**
 * Spec smoke tests — the fast, dependency-free check that the reel pipeline
 * (schema → validate/clamp → serialize, the offline composer, and the pod URL
 * helpers) holds its invariants. No key, no pod, no ffmpeg needed. `npm test`.
 */
import assert from "node:assert/strict";
import { reelSchema, type ReelSpec, CROSSFADE } from "../src/lib/spec/schema";
import { validateReel, clampReel, sceneDuration } from "../src/lib/spec/validate";
import { composeReel } from "../src/lib/spec/compose";
import { serializeReel, layoutScenes, reelDuration } from "../src/lib/reel/serialize";
import type { PlannerAsset } from "../src/lib/catalog";
import {
  podRootFromWebId,
  assetsContainerFor,
  videosContainerFor,
  reelId,
} from "../src/lib/config";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    process.stderr.write(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}

const CATALOG: PlannerAsset[] = [
  { id: "aaa111", kind: "photo", caption: "wild apple tree blossoms in early light", tags: ["apple", "tree", "blossom", "morning"], captureDate: "2026-05-10" },
  { id: "bbb222", kind: "photo", caption: "moss on a fallen log", tags: ["moss", "forest", "green"], captureDate: "2026-05-11" },
  { id: "ccc333", kind: "video", caption: "a stream over stones", tags: ["water", "stream", "stones"], captureDate: "2026-05-12" },
  { id: "ddd444", kind: "photo", caption: "apple orchard rows at dusk", tags: ["apple", "orchard", "dusk"], captureDate: "2026-05-13" },
  { id: "eee555", kind: "photo", caption: "a test color chart", tags: ["test", "placeholder"], captureDate: "2026-05-14" },
];

const resolve = (id: string) => `assets/${id}.jpg`;

function roundTrip(reel: ReelSpec): string {
  const check = validateReel(reel);
  assert.ok(check.ok, !check.ok ? check.error : "");
  const html = serializeReel(check.ok ? check.reel : reel, resolve);
  assert.ok(html.includes("window.__timelines.main"), "timeline not registered");
  assert.ok(html.includes('data-composition-id="main"'), "composition root missing");
  // One .clip per scene.
  const clips = html.match(/class="clip/g)?.length ?? 0;
  assert.equal(clips, reel.scenes.length, "clip count != scene count");
  return html;
}

process.stdout.write("composer\n");
test("composeReel builds a valid title→scenes→closing reel", () => {
  const reel = composeReel("make a reel about apple trees", CATALOG, null);
  const check = validateReel(reel);
  assert.ok(check.ok);
  assert.equal(reel.scenes[0].kind, "title");
  assert.equal(reel.scenes[reel.scenes.length - 1].kind, "closing");
  assert.ok(reel.scenes.length >= 3);
  roundTrip(reel);
});

test("composeReel keyword-matches and ranks apple assets first", () => {
  const reel = composeReel("apple", CATALOG, null);
  const firstPhoto = reel.scenes.find((s) => s.kind === "photo" || s.kind === "video");
  assert.ok(firstPhoto && "assetId" in firstPhoto);
  assert.ok(["aaa111", "ddd444"].includes((firstPhoto as { assetId: string }).assetId));
});

test("composeReel excludes test/placeholder assets", () => {
  const reel = composeReel("everything", CATALOG, null);
  const ids = reel.scenes.flatMap((s) => ("assetId" in s ? [s.assetId] : []));
  assert.ok(!ids.includes("eee555"), "placeholder asset leaked into reel");
});

test("composeReel honors selectedAssetIds order, ignoring keywords", () => {
  const reel = composeReel("ignored query", CATALOG, ["ccc333", "aaa111"]);
  const ids = reel.scenes.flatMap((s) => ("assetId" in s ? [s.assetId] : []));
  assert.deepEqual(ids, ["ccc333", "aaa111"]);
  // ccc333 is a video, so it must be a video scene.
  const vid = reel.scenes.find((s) => "assetId" in s && s.assetId === "ccc333");
  assert.equal(vid?.kind, "video");
});

test("composeReel survives an empty query (newest few in order)", () => {
  const reel = composeReel("", CATALOG, null);
  assert.ok(validateReel(reel).ok);
  assert.ok(reel.scenes.length >= 3);
});

process.stdout.write("layout + serialize\n");
test("layoutScenes overlaps crossfades and stacks track indices", () => {
  const reel: ReelSpec = {
    title: "T",
    scenes: [
      { kind: "title", title: "T", duration: 3 },
      { kind: "photo", assetId: "aaa111", transition: "crossfade", duration: 4 },
      { kind: "photo", assetId: "bbb222", transition: "cut", duration: 4 },
    ],
  };
  const { timings, total } = layoutScenes(reel);
  assert.equal(timings[0].start, 0);
  // crossfade scene starts CROSSFADE before the previous end (3).
  assert.equal(timings[1].start, 3 - CROSSFADE);
  // cut scene starts exactly at the previous end.
  assert.equal(timings[2].start, timings[1].end);
  // each scene on its own track index
  assert.deepEqual(timings.map((t) => t.track), [0, 1, 2]);
  assert.equal(total, timings[2].end);
  assert.equal(reelDuration(reel), total);
});

test("serialize emits flash overlay for flash-through-white", () => {
  const reel: ReelSpec = {
    title: "T",
    scenes: [
      { kind: "title", title: "T" },
      { kind: "photo", assetId: "aaa111", transition: "flash-through-white" },
      { kind: "closing", title: "end" },
    ],
  };
  const html = roundTrip(reel);
  assert.ok(html.includes("s1-flash"), "flash overlay missing");
});

test("serialize drives a <video> currentTime for video scenes", () => {
  const reel: ReelSpec = {
    title: "T",
    scenes: [
      { kind: "title", title: "T" },
      { kind: "video", assetId: "ccc333", duration: 5 },
      { kind: "closing", title: "end" },
    ],
  };
  const html = roundTrip(reel);
  assert.ok(html.includes("<video"), "video element missing");
  assert.ok(html.includes("currentTime"), "video playhead not driven by timeline");
});

process.stdout.write("clamp + validate\n");
test("clampReel trims runaway scene counts and durations", () => {
  const fat: ReelSpec = {
    title: "Fat",
    scenes: Array.from({ length: 30 }, (_, i) => ({
      kind: "photo" as const,
      assetId: `a${i}`,
      duration: 99,
    })),
  };
  const clamped = clampReel(reelSchema.parse(fat));
  assert.equal(clamped.scenes.length, 16);
  for (const s of clamped.scenes) assert.ok(sceneDuration(s) <= 12);
});

test("validateReel reports a readable path on bad input", () => {
  const res = validateReel({ title: "x", scenes: [{ kind: "photo" }] });
  assert.ok(!res.ok);
  assert.ok(!res.ok && res.error.includes("scenes.0"));
});

process.stdout.write("pod helpers\n");
test("podRootFromWebId strips the profile document", () => {
  assert.equal(
    podRootFromWebId("http://localhost:3011/alice/profile/card#me"),
    "http://localhost:3011/alice/"
  );
  assert.equal(
    assetsContainerFor("http://localhost:3011/alice/"),
    "http://localhost:3011/alice/mind-video/assets/"
  );
  assert.equal(
    videosContainerFor("http://localhost:3011/alice/"),
    "http://localhost:3011/alice/mind-video/videos/"
  );
});

test("reelId slugs are url-safe and salted", () => {
  assert.equal(reelId("Apple Trees — today!", "123456"), "apple-trees-today-123456");
  assert.equal(reelId("???", "42"), "reel-42");
});

process.stdout.write(
  process.exitCode ? `\n${passed} passed, with failures\n` : `\n✓ all ${passed} checks passed\n`
);
