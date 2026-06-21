import { MIND_MARK_SVG } from "@mind-studio/ui/brand";
import { ImageResponse } from "next/og";

export const alt = "Mind Video — reels from your pod";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The canonical Mind mark as a data URI, so the share card carries the real
// brand artwork (sourced from the design system, never a vendored copy).
const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MIND_MARK_SVG).toString("base64")}`;

// Social share card. Uses the default font (no remote fetch) so it renders
// deterministically at build time. Mind Green on dark to match the brand
// (green is the single UI accent; cyan/teal only as atmospheric glow).
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "radial-gradient(900px 500px at 50% 0%, #0c241d 0%, #0b0d12 55%, #07080b 100%)",
        color: "#e8edf2",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        {/* biome-ignore lint/performance/noImgElement: Satori (next/og) only supports <img>. */}
        <img src={MARK_DATA_URI} width={96} height={86} alt="" />
        <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: -1 }}>Videos</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 26,
          letterSpacing: 6,
          color: "#16b88a",
          textTransform: "uppercase",
          marginTop: 40,
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: 14, background: "#16b88a" }} />
        Reels from your pod · built on Solid
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          fontSize: 96,
          fontWeight: 700,
          lineHeight: 1.05,
          marginTop: 28,
        }}
      >
        <span>Drop your media.&nbsp;</span>
        <span style={{ color: "#16b88a" }}>Describe a reel.</span>
      </div>
      <div
        style={{ display: "flex", fontSize: 34, color: "#9aa6b2", marginTop: 28, maxWidth: 900 }}
      >
        Mind captions every photo and clip you drop, then turns a sentence into a ReelSpec the agent
        renders to an MP4 — every asset and reel lives in your pod, never our servers.
      </div>
      <div style={{ display: "flex", fontSize: 28, color: "#5f6b78", marginTop: 40 }}>
        mindpods.org
      </div>
    </div>,
    { ...size },
  );
}
