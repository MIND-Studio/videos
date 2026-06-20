"use client";

import {
  deleteFile,
  getContainedResourceUrlAll,
  getSolidDataset,
  overwriteFile,
} from "@inrupt/solid-client";
import type { CatalogEntry } from "@/lib/catalog";
import { assetsContainerFor } from "@/lib/config";
import { fetcher } from "./fetcher";

/**
 * Pod storage for assets. The BROWSER talks directly to the pod — no Mind server
 * ever sees the bytes. Each asset is content-addressed (sha-256) and stored as:
 *   <pod>/mind-video/assets/<id>        — the original bytes
 *   <pod>/mind-video/assets/<id>.json   — the catalog sidecar (CatalogEntry)
 * The container listing IS the index (no separate index file), like Mind Notes.
 */

/** sha-256 of the bytes, first 12 hex chars — the content-addressed asset id. */
export async function hashBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

function kindFor(mimeType: string): "photo" | "video" {
  return mimeType.startsWith("video/") ? "video" : "photo";
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function putJson(url: string, value: unknown): Promise<void> {
  await overwriteFile(
    url,
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    {
      contentType: "application/json",
      fetch: fetcher(),
    },
  );
}

/** The URL of an asset's stored bytes. */
export function assetBytesUrl(podRoot: string, id: string): string {
  return `${assetsContainerFor(podRoot)}${id}`;
}

/**
 * Upload a file to the pod (content-addressed, deduped). Writes a stub catalog
 * sidecar with an empty caption — the caller then captions it and calls
 * {@link setCaption}. Returns the entry and whether it already existed.
 */
export async function uploadAsset(
  podRoot: string,
  file: File,
  isoNow: string,
): Promise<{ entry: CatalogEntry; deduped: boolean }> {
  const buf = await file.arrayBuffer();
  const id = await hashBytes(buf);
  const container = assetsContainerFor(podRoot);
  const sidecarUrl = `${container}${id}.json`;
  const f = fetcher();

  // Dedupe: if the sidecar already exists, reuse it. no-store so a 404 here (the
  // common "new asset" case) is never cached and then re-served to the catalog
  // listing below, which would silently drop the asset we're about to write.
  try {
    const res = await f(sidecarUrl, { cache: "no-store" });
    if (res.ok) {
      const existing = (await res.json()) as CatalogEntry;
      return { entry: existing, deduped: true };
    }
  } catch {
    /* not present → upload below */
  }

  const mimeType = file.type || "application/octet-stream";
  await overwriteFile(`${container}${id}`, new Blob([buf], { type: mimeType }), {
    contentType: mimeType,
    fetch: f,
  });

  const entry: CatalogEntry = {
    id,
    kind: kindFor(mimeType),
    caption: "",
    tags: [],
    captureDate: file.lastModified ? isoDate(file.lastModified) : isoNow.slice(0, 10),
    name: file.name || id,
    mimeType,
    addedAt: isoNow,
  };
  await putJson(sidecarUrl, entry);
  return { entry, deduped: false };
}

/** Merge a caption + tags (and optional duration) into an asset's sidecar. */
export async function setCaption(
  podRoot: string,
  id: string,
  patch: { caption?: string; tags?: string[]; duration?: number },
): Promise<CatalogEntry> {
  const url = `${assetsContainerFor(podRoot)}${id}.json`;
  const res = await fetcher()(url);
  if (!res.ok) throw new Error(`asset ${id} not found (${res.status})`);
  const entry = (await res.json()) as CatalogEntry;
  const next: CatalogEntry = {
    ...entry,
    caption: patch.caption ?? entry.caption,
    tags: patch.tags ?? entry.tags,
    duration: patch.duration ?? entry.duration,
  };
  await putJson(url, next);
  return next;
}

/** List every catalog entry, newest first. */
export async function listCatalog(podRoot: string): Promise<CatalogEntry[]> {
  const container = assetsContainerFor(podRoot);
  // no-store: the library must reflect a just-uploaded/deleted asset, never a
  // stale cached listing or a poisoned 404 from the pre-upload dedupe check.
  const base = fetcher();
  const noStore: typeof fetch = (input, init) => base(input, { ...init, cache: "no-store" });
  let dataset;
  try {
    dataset = await getSolidDataset(container, { fetch: noStore });
  } catch {
    return []; // container doesn't exist yet → empty library
  }
  const sidecars = getContainedResourceUrlAll(dataset).filter((u) => u.endsWith(".json"));
  const entries = await Promise.all(
    sidecars.map(async (u) => {
      // The container LISTED this sidecar, so it exists. A 404 on the GET is a
      // transient CSS write-settle blip right after an upload — retry briefly
      // rather than silently dropping a just-added asset from the library.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await noStore(u);
          if (res.ok) return (await res.json()) as CatalogEntry;
          if (res.status !== 404) return null;
        } catch {
          return null;
        }
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
      return null;
    }),
  );
  return entries
    .filter((e): e is CatalogEntry => e !== null)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

/** Delete an asset's bytes and its sidecar. */
export async function deleteAsset(podRoot: string, id: string): Promise<void> {
  const container = assetsContainerFor(podRoot);
  const f = fetcher();
  for (const url of [`${container}${id}`, `${container}${id}.json`]) {
    try {
      await deleteFile(url, { fetch: f });
    } catch {
      /* already gone */
    }
  }
}

/** Fetch an asset's bytes as a Blob (for preview blob: URLs + worker upload). */
export async function fetchAssetBlob(podRoot: string, id: string): Promise<Blob> {
  const res = await fetcher()(assetBytesUrl(podRoot, id));
  if (!res.ok) throw new Error(`fetch asset ${id} → ${res.status}`);
  return res.blob();
}
