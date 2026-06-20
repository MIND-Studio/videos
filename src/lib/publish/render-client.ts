"use client";

import type { ReelSpec } from "@/lib/spec/schema";
import type { CatalogEntry } from "@/lib/catalog";
import { serializeReel } from "@/lib/reel/serialize";
import { fetchAssetBlob } from "@/lib/solid/asset-store";

/**
 * Browser-side reel rendering, via the same-origin `/api/render` proxy → the
 * stateless worker. We serialize the composition HERE (serialize.ts is the one
 * source shared with the preview), fetch each referenced asset from the pod,
 * and post { html, assets } to the worker. It returns the MP4, which the CALLER
 * writes to the pod with the user's own authed fetch — so no Mind server ever
 * holds pod credentials or persists the reel.
 */

function extFor(mimeType: string): string {
  const m = mimeType.toLowerCase();
  // SVG must keep its extension — Chromium won't render SVG bytes from a file
  // named .jpg when the worker loads it as a CSS background-image / <img> src.
  if (m.includes("svg")) return "svg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("quicktime") || m.includes("mov")) return "mov";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.startsWith("video/")) return "mp4";
  return "jpg";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Asset ids referenced by photo/video scenes, in first-seen order. */
function referencedIds(reel: ReelSpec): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of reel.scenes) {
    if ((s.kind === "photo" || s.kind === "video") && !seen.has(s.assetId)) {
      seen.add(s.assetId);
      ids.push(s.assetId);
    }
  }
  return ids;
}

/**
 * Render `reel` to an MP4 Blob. `catalogById` supplies each asset's mime type
 * (to pick a filename extension); the bytes are fetched from the pod.
 */
export async function renderReel(
  podRoot: string,
  reel: ReelSpec,
  catalogById: Map<string, CatalogEntry>
): Promise<Blob> {
  const ids = referencedIds(reel);
  const filenameById = new Map<string, string>();
  const assets: { filename: string; base64: string }[] = [];

  await Promise.all(
    ids.map(async (id, i) => {
      const entry = catalogById.get(id);
      const ext = extFor(entry?.mimeType ?? "image/jpeg");
      const filename = `${i}-${id}.${ext}`;
      filenameById.set(id, filename);
      const blob = await fetchAssetBlob(podRoot, id);
      assets.push({ filename, base64: await blobToBase64(blob) });
    })
  );

  const html = serializeReel(reel, (id) => filenameById.get(id) ?? id);

  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ html, assets }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Render failed: ${text || `${res.status} ${res.statusText}`}`);
  }
  return res.blob();
}
