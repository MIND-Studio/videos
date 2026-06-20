/**
 * Pod URL helpers. Mind Video claims one namespace in the pod —
 * `<pod>/mind-video/` — and never touches anything outside it.
 *
 *   <pod>/mind-video/assets/<id>        — original uploaded photo/video bytes
 *   <pod>/mind-video/assets/<id>.json   — catalog sidecar (caption, tags, …)
 *   <pod>/mind-video/videos/<id>/       — a rendered reel:
 *       reel.json  — the ReelSpec (source of truth)
 *       reel.mp4   — the rendered video
 *       meta.json  — { id, title, sceneCount, duration, updatedAt }
 */
export const POD_BASE_URL =
  process.env.NEXT_PUBLIC_POD_BASE_URL ?? "http://localhost:3011/";

export const ASSETS_PATH = "mind-video/assets/";
export const VIDEOS_PATH = "mind-video/videos/";

/** `http://host/alice/profile/card#me` → `http://host/alice/`. */
export function podRootFromWebId(webId: string): string {
  const url = new URL(webId);
  url.hash = "";
  url.search = "";
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1].startsWith("card")) {
    parts.pop();
    parts.pop();
  }
  url.pathname = "/" + parts.join("/") + (parts.length ? "/" : "");
  return url.toString();
}

function ensureSlash(podRoot: string): string {
  return podRoot.endsWith("/") ? podRoot : podRoot + "/";
}

export function assetsContainerFor(podRoot: string): string {
  return ensureSlash(podRoot) + ASSETS_PATH;
}

export function videosContainerFor(podRoot: string): string {
  return ensureSlash(podRoot) + VIDEOS_PATH;
}

/** A url-safe id from a reel title plus a short disambiguator. */
export function reelId(title: string, salt: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "reel";
  return `${slug}-${salt}`;
}
