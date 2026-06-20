// Stateless MP4 render worker for Mind Video.
//
// `npx hyperframes render` needs Node 22 + headless Chromium + ffmpeg, none of
// which run in the browser. This worker is the only place that runs them, and
// it is deliberately:
//   - STATELESS & CREDENTIAL-FREE — never touches the pod, holds no pod
//     credentials, persists nothing. The browser uploads the MP4 it returns to
//     the pod with the user's own authed fetch.
//   - PER-REQUEST ISOLATED — every request gets its own temp project dir (a copy
//     of the committed hyperframes/ project + the posted index.html + assets).
//     It `rm -rf`s the dir after each request.
//
// The browser serializes the composition (src/lib/reel/serialize.ts is the
// single source for both preview and render) and posts the finished HTML +
// asset bytes, so this worker stays spec-agnostic.
//
// Endpoints:
//   GET  /healthz                       → 200 "ok"
//   POST /export { html, assets:[{filename, base64}] } → video/mp4 bytes
//
// Run locally: `npm run worker`. Requires a system `ffmpeg`.

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PROJECT_DIR = path.join(REPO, "hyperframes");
// Temp projects live under the repo so npx resolves REPO/node_modules.
const WORK_ROOT = path.join(REPO, ".work");

const PORT = Number(process.env.WORKER_PORT ?? 3172);
const REQUEST_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS ?? 180_000);
const MAX_CONCURRENT = Number(process.env.WORKER_CONCURRENCY ?? 1);
const QUEUE_LIMIT = Number(process.env.WORKER_QUEUE_LIMIT ?? 6);
const MAX_PAYLOAD = 96 * 1024 * 1024; // reels carry a few MB of assets

// ---- tiny concurrency gate (Chromium + ffmpeg are heavy) -------------------
let active = 0;
const queue = [];
function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  if (queue.length >= QUEUE_LIMIT) return null;
  return new Promise((resolve) => queue.push(resolve));
}
function release() {
  active--;
  const next = queue.shift();
  if (next) {
    active++;
    next();
  }
}

async function makeProject(html, assets) {
  await fs.mkdir(WORK_ROOT, { recursive: true });
  const dir = await fs.mkdtemp(path.join(WORK_ROOT, "reel-"));
  // Copy the committed hyperframes project (frame.md, blocks/, any config).
  try {
    await fs.cp(PROJECT_DIR, dir, { recursive: true });
  } catch {
    /* project dir optional — the HTML is self-contained */
  }
  await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
  for (const a of assets) {
    const safe = path.basename(String(a.filename || "")); // no path traversal
    if (!safe) continue;
    await fs.writeFile(path.join(dir, safe), Buffer.from(String(a.base64 || ""), "base64"));
  }
  return dir;
}

function runHyperframes(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "npx",
      ["--yes", "hyperframes", ...args],
      { cwd, timeout: REQUEST_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          err.message = `hyperframes ${args[0]} failed: ${err.message}\n${stderr || stdout}`;
          reject(err);
        } else resolve({ stdout, stderr });
      }
    );
    child.on("error", reject);
  });
}

async function doExport(html, assets) {
  const dir = await makeProject(html, assets);
  try {
    const out = path.join(dir, "out.mp4");
    // Lint first so a malformed composition fails fast with a readable error.
    await runHyperframes(["lint", "."], dir).catch((e) => {
      // Lint is advisory; log but don't abort the render on a lint-only failure.
      console.warn("[worker] lint:", e?.message ?? e);
    });
    await runHyperframes(["render", ".", "-o", out], dir);
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_PAYLOAD) reject(new Error("payload too large"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.method !== "POST" || req.url !== "/export") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  const slot = acquire();
  if (slot === null) {
    res.writeHead(503, { "content-type": "text/plain", "retry-after": "15" });
    res.end("render worker busy");
    return;
  }
  await slot;

  try {
    const body = await readJson(req);
    const html = String(body.html ?? "");
    const assets = Array.isArray(body.assets) ? body.assets : [];
    if (!html.trim()) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing html");
      return;
    }
    const mp4 = await doExport(html, assets);
    res.writeHead(200, { "content-type": "video/mp4" });
    res.end(mp4);
  } catch (e) {
    console.error("[worker]", e?.message ?? e);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`render error: ${e?.message ?? e}`);
  } finally {
    release();
  }
});

// Sweep any temp dirs a previous crash left behind.
await fs.rm(WORK_ROOT, { recursive: true, force: true }).catch(() => {});
server.listen(PORT, () => {
  console.log(`[worker] mind-video render worker on :${PORT}`);
});
