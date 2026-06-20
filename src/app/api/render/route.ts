import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the stateless MP4 render worker (worker/server.mjs).
 *
 * Real `npx hyperframes render` needs Node + headless Chromium + ffmpeg, so it
 * runs in a separate worker. This route only FORWARDS the request body to it: it
 * holds no pod credentials, writes nothing, and persists nothing — the browser
 * uploads the returned MP4 to the pod itself. Keeping the worker behind this
 * proxy means it stays on the internal network (no CORS, not public).
 */

export const runtime = "nodejs";
// Rendering spins up Chromium + ffmpeg (tens of seconds); don't get cut off.
export const maxDuration = 300;

const WORKER_URL = process.env.RENDER_WORKER_URL ?? "http://localhost:3172";

export async function POST(req: NextRequest) {
  let body: { html?: unknown; assets?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (typeof body.html !== "string" || !Array.isArray(body.assets)) {
    return new Response("expected { html, assets: [...] }", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${WORKER_URL}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return new Response(
      `render worker unreachable at ${WORKER_URL} — is it running? (npm run worker) (${
        e instanceof Error ? e.message : String(e)
      })`,
      { status: 502 },
    );
  }

  // Stream the worker's response (MP4 bytes, or an error message) straight back.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
    },
  });
}
