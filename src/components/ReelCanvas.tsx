"use client";

import { Button } from "@mind-studio/ui";
import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { reelDuration, serializeReel } from "@/lib/reel/serialize";
import { fetchAssetBlob } from "@/lib/solid/asset-store";
import type { ReelSpec } from "@/lib/spec/schema";

/**
 * In-browser reel preview. It serializes the ReelSpec with the SAME
 * `serializeReel` the render worker uses (the one source), mounts the resulting
 * hyperframes composition in an iframe, and drives `window.__timelines.main`
 * with a requestAnimationFrame seeker — no server render state, multi-user safe.
 * Asset bytes are fetched from the pod as `blob:` URLs.
 */
export default function ReelCanvas({ reel, podRoot }: { reel: ReelSpec; podRoot: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const headRef = useRef<number>(0);
  const objectUrlsRef = useRef<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState(0);

  const total = reelDuration(reel);

  // Reach the GSAP timeline the composition registered on window.
  const timeline = useCallback((): {
    time: (t?: number) => number;
    duration: () => number;
  } | null => {
    const win = iframeRef.current?.contentWindow as unknown as {
      __timelines?: { main?: { time: (t?: number) => number; duration: () => number } };
    } | null;
    return win?.__timelines?.main ?? null;
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  // Build the composition + asset blob URLs whenever the reel changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaying(false);
    stopLoop();
    headRef.current = 0;
    setHead(0);

    const ids = Array.from(
      new Set(
        reel.scenes.flatMap((s) => (s.kind === "photo" || s.kind === "video" ? [s.assetId] : [])),
      ),
    );

    (async () => {
      const urlById = new Map<string, string>();
      await Promise.all(
        ids.map(async (id) => {
          try {
            const blob = await fetchAssetBlob(podRoot, id);
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            urlById.set(id, url);
          } catch {
            /* missing asset → resolver falls back to the id (broken img, but renders) */
          }
        }),
      );
      if (cancelled) return;
      const html = serializeReel(reel, (id) => urlById.get(id) ?? id);
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.onload = () => {
        // Pin the timeline to t=0 once the composition has registered it.
        let tries = 0;
        const settle = () => {
          const tl = timeline();
          if (tl) {
            tl.time(0);
            if (!cancelled) {
              setLoading(false);
              setPlaying(true); // auto-play so the reel isn't a black frame at rest
            }
          } else if (tries++ < 30) {
            setTimeout(settle, 50);
          } else if (!cancelled) {
            setLoading(false);
          }
        };
        settle();
      };
      iframe.srcdoc = html;
    })();

    return () => {
      cancelled = true;
      stopLoop();
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel, podRoot]);

  const tick = useCallback(
    (ts: number) => {
      const tl = timeline();
      if (!tl) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dur = tl.duration() || total;
      const last = lastTsRef.current || ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      let next = headRef.current + dt;
      if (next >= dur) next = 0; // loop the preview
      headRef.current = next;
      tl.time(next);
      setHead(next);
      rafRef.current = requestAnimationFrame(tick);
    },
    [timeline, total],
  );

  // Drive the rAF seeker from the `playing` flag, so both the play/pause button
  // and the auto-play-on-load path share one loop (and cleanup) path.
  useEffect(() => {
    if (!playing) return;
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => stopLoop();
  }, [playing, tick, stopLoop]);

  function togglePlay() {
    setPlaying((p) => !p);
  }

  function scrub(t: number) {
    headRef.current = t;
    setHead(t);
    timeline()?.time(t);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="reel-stage relative mx-auto w-full max-w-[300px] overflow-hidden rounded-xl border">
        <iframe
          ref={iframeRef}
          title="Reel preview"
          className="absolute left-1/2 top-1/2 origin-center"
          style={{
            width: 1080,
            height: 1920,
            transform: "translate(-50%, -50%) scale(calc(300 / 1080))",
            border: "0",
          }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, total)}
          step={0.05}
          value={head}
          onChange={(e) => scrub(Number(e.target.value))}
          className="flex-1 accent-primary"
          aria-label="Scrub preview"
        />
        <span className="w-16 text-right font-mono text-xs text-muted-foreground">
          {head.toFixed(1)}/{total.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
