/**
 * The catalog entry — one per uploaded asset. Stored as a sidecar JSON next to
 * the bytes at `<pod>/mind-video/assets/<id>.json`, and sent (text only, no
 * bytes) to `/api/plan` so the planner can select assets by caption/tags/date.
 *
 * Plain types only (no client-only imports) so both the browser stores and the
 * Node API routes can share it.
 */
export interface CatalogEntry {
  /** Content-addressed id (sha-256, 12 hex) — also the asset's filename. */
  id: string;
  kind: "photo" | "video";
  /** One-sentence caption (from /api/caption, or a fallback). */
  caption: string;
  /** 4–12 lowercase tags. */
  tags: string[];
  /** `YYYY-MM-DD` capture date (EXIF when known, else upload date). */
  captureDate: string;
  /** Original filename, for display + download. */
  name: string;
  /** MIME type of the stored bytes. */
  mimeType: string;
  /** Clip length in seconds (videos only). */
  duration?: number;
  /** ISO timestamp the asset was added. */
  addedAt: string;
}

/** A catalog entry pared down to what the planner needs (no internal fields). */
export interface PlannerAsset {
  id: string;
  kind: "photo" | "video";
  caption: string;
  tags: string[];
  captureDate: string;
}

export function toPlannerAsset(e: CatalogEntry): PlannerAsset {
  return {
    id: e.id,
    kind: e.kind,
    caption: e.caption,
    tags: e.tags,
    captureDate: e.captureDate,
  };
}
