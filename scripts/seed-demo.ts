/**
 * Seed alice's pod with a few demo assets under `mind-video/assets/` (bytes +
 * <id>.json sidecar each), so the Library and Make tabs have material on a fresh
 * pod. The demo "photos" are small self-contained SVGs — no caption API or real
 * media needed.
 *
 * Usage (targets the shared mind-node / CSS on :3011 by default):
 *   # ensure the pod server is up (see SOLID-SERVER.md / mind-setup-dev)
 *   npm run seed:demo
 *
 * Idempotent — content-addressed ids mean re-running overwrites the same files.
 */
import { Session } from "@inrupt/solid-client-authn-node";
import { createHash } from "node:crypto";
import type { CatalogEntry } from "../src/lib/catalog";

const POD_BASE = process.env.POD_BASE_URL ?? "http://localhost:3011/";
const EMAIL = process.env.SEED_EMAIL ?? "alice@mind-video.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "dev-only-do-not-use-in-prod";
const POD_NAME = process.env.SEED_POD ?? "alice";

const ROOT = `${POD_BASE}${POD_NAME}/`;
const WEBID = `${ROOT}profile/card#me`;
const ASSETS = `${ROOT}mind-video/assets/`;

interface Demo {
  caption: string;
  tags: string[];
  captureDate: string;
  hue: number;
}

const DEMOS: Demo[] = [
  { caption: "wild apple tree blossoms in early light", tags: ["apple", "tree", "blossom", "morning", "spring"], captureDate: "2026-06-08", hue: 96 },
  { caption: "moss spreading over a fallen log", tags: ["moss", "forest", "green", "close-up"], captureDate: "2026-06-09", hue: 140 },
  { caption: "a slow stream running over smooth stones", tags: ["water", "stream", "stones", "calm"], captureDate: "2026-06-10", hue: 188 },
  { caption: "tall grass bending in afternoon wind", tags: ["grass", "wind", "meadow", "light"], captureDate: "2026-06-11", hue: 70 },
  { caption: "an apple orchard in rows at dusk", tags: ["apple", "orchard", "dusk", "rows"], captureDate: "2026-06-12", hue: 28 },
  { caption: "first light through the canopy", tags: ["light", "canopy", "morning", "trees"], captureDate: "2026-06-13", hue: 48 },
];

function demoSvg(d: Demo): string {
  const c1 = `hsl(${d.hue} 55% 28%)`;
  const c2 = `hsl(${(d.hue + 40) % 360} 50% 16%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#g)"/>
  <circle cx="820" cy="300" r="170" fill="hsl(${d.hue} 70% 70%)" opacity="0.35"/>
  <text x="60" y="1270" font-family="monospace" font-size="40" fill="#ffffff" opacity="0.85">${d.tags[0]}</text>
</svg>`;
}

async function mintCredentials() {
  const indexRes = await fetch(`${POD_BASE}.account/`);
  if (!indexRes.ok) {
    throw new Error(`Account index ${indexRes.status} — is the pod server running on ${POD_BASE}?`);
  }
  const { controls } = (await indexRes.json()) as { controls: { password: { login: string } } };

  const loginRes = await fetch(controls.password.login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  const { authorization } = (await loginRes.json()) as { authorization: string };

  const accountRes = await fetch(`${POD_BASE}.account/`, {
    headers: { Authorization: `CSS-Account-Token ${authorization}` },
  });
  const account = (await accountRes.json()) as {
    controls: { account: { clientCredentials: string } };
  };

  const credRes = await fetch(account.controls.account.clientCredentials, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `CSS-Account-Token ${authorization}`,
    },
    body: JSON.stringify({ name: "mind-video-seed", webId: WEBID }),
  });
  if (!credRes.ok) throw new Error(`Credentials creation failed: ${credRes.status} ${await credRes.text()}`);
  return (await credRes.json()) as { id: string; secret: string };
}

async function put(session: Session, url: string, body: string, type: string) {
  const res = await session.fetch(url, {
    method: "PUT",
    headers: { "Content-Type": type },
    body,
  });
  if (!res.ok) throw new Error(`PUT ${url} → ${res.status} ${await res.text()}`);
  process.stdout.write(`  · wrote ${url}\n`);
}

async function main() {
  const { id, secret } = await mintCredentials();
  const session = new Session();
  await session.login({ clientId: id, clientSecret: secret, oidcIssuer: POD_BASE });
  if (!session.info.isLoggedIn) throw new Error("Client-credentials login failed");

  const now = new Date().toISOString();
  for (const d of DEMOS) {
    const svg = demoSvg(d);
    const assetId = createHash("sha256").update(svg).digest("hex").slice(0, 12);
    const entry: CatalogEntry = {
      id: assetId,
      kind: "photo",
      caption: d.caption,
      tags: d.tags,
      captureDate: d.captureDate,
      name: `${d.tags[0]}.svg`,
      mimeType: "image/svg+xml",
      addedAt: now,
    };
    await put(session, `${ASSETS}${assetId}`, svg, "image/svg+xml");
    await put(session, `${ASSETS}${assetId}.json`, JSON.stringify(entry, null, 2), "application/json");
  }

  process.stdout.write(`\n✓ Seeded ${DEMOS.length} demo assets to ${ASSETS}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
