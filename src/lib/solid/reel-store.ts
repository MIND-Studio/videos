"use client";

import {
  overwriteFile,
  getSolidDataset,
  getContainedResourceUrlAll,
  deleteContainer,
  deleteFile,
} from "@inrupt/solid-client";
import { fetcher } from "./fetcher";
import { videosContainerFor, reelId } from "@/lib/config";
import { reelSchema, type ReelSpec } from "@/lib/spec/schema";
import { reelDuration } from "@/lib/reel/serialize";

/**
 * Pod storage for rendered reels. The BROWSER uploads the MP4 it got back from
 * the render worker — no Mind server ever holds the bytes. A reel lives at
 * `<pod>/mind-video/videos/<id>/`:
 *   - reel.json — the ReelSpec (source of truth)
 *   - reel.mp4  — the rendered video
 *   - meta.json — { id, title, sceneCount, duration, updatedAt }
 */

export interface ReelMeta {
  id: string;
  title: string;
  sceneCount: number;
  duration: number;
  updatedAt: string;
}

async function putText(url: string, body: string, type: string): Promise<void> {
  await overwriteFile(url, new Blob([body], { type }), { contentType: type, fetch: fetcher() });
}

export async function saveReel(
  podRoot: string,
  reel: ReelSpec,
  mp4: Blob,
  isoNow: string,
  existingId?: string
): Promise<ReelMeta> {
  const container = videosContainerFor(podRoot);
  const id = existingId ?? reelId(reel.title, isoNow.replace(/[^0-9]/g, "").slice(8, 14));
  const base = `${container}${id}/`;

  const meta: ReelMeta = {
    id,
    title: reel.title,
    sceneCount: reel.scenes.length,
    duration: Math.round(reelDuration(reel) * 10) / 10,
    updatedAt: isoNow,
  };

  await putText(`${base}reel.json`, JSON.stringify(reel, null, 2), "application/json");
  await overwriteFile(`${base}reel.mp4`, mp4, { contentType: "video/mp4", fetch: fetcher() });
  await putText(`${base}meta.json`, JSON.stringify(meta, null, 2), "application/json");

  return meta;
}

export async function listReels(podRoot: string): Promise<ReelMeta[]> {
  const container = videosContainerFor(podRoot);
  let dataset;
  try {
    dataset = await getSolidDataset(container, { fetch: fetcher() });
  } catch {
    return [];
  }
  const childContainers = getContainedResourceUrlAll(dataset).filter((u) => u.endsWith("/"));
  const metas = await Promise.all(
    childContainers.map(async (c) => {
      try {
        const res = await fetcher()(`${c}meta.json`);
        if (!res.ok) return null;
        return (await res.json()) as ReelMeta;
      } catch {
        return null;
      }
    })
  );
  return metas
    .filter((m): m is ReelMeta => m !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function loadReel(podRoot: string, id: string): Promise<ReelSpec | null> {
  const url = `${videosContainerFor(podRoot)}${id}/reel.json`;
  try {
    const res = await fetcher()(url);
    if (!res.ok) return null;
    const parsed = reelSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The URL of a reel's rendered MP4 (for a download link or worker re-fetch). */
export function reelVideoUrl(podRoot: string, id: string): string {
  return `${videosContainerFor(podRoot)}${id}/reel.mp4`;
}

/**
 * Fetch a reel's rendered MP4 as a Blob. The pod resource is private, so a bare
 * `<video src>` to {@link reelVideoUrl} would 401 (and the browser ORB-blocks
 * it) — read the bytes through the session fetch and play them as a `blob:` URL,
 * the same pattern as {@link fetchAssetBlob}.
 */
export async function fetchReelVideoBlob(podRoot: string, id: string): Promise<Blob> {
  const res = await fetcher()(reelVideoUrl(podRoot, id));
  if (!res.ok) throw new Error(`fetch reel ${id} → ${res.status}`);
  return res.blob();
}

export async function removeReel(podRoot: string, id: string): Promise<void> {
  const base = `${videosContainerFor(podRoot)}${id}/`;
  const f = fetcher();
  for (const name of ["reel.json", "reel.mp4", "meta.json"]) {
    try {
      await deleteFile(`${base}${name}`, { fetch: f });
    } catch {
      /* already gone */
    }
  }
  try {
    await deleteContainer(base, { fetch: f });
  } catch {
    /* already gone */
  }
}
