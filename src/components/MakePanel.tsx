"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@mind-studio/ui";
import { Loader2, Sparkles, Film, Download, X } from "lucide-react";
import type { CatalogEntry } from "@/lib/catalog";
import { toPlannerAsset } from "@/lib/catalog";
import type { ReelSpec } from "@/lib/spec/schema";
import { renderReel } from "@/lib/publish/render-client";
import { saveReel, listReels, type ReelMeta } from "@/lib/solid/reel-store";
import ReelCanvas from "@/components/ReelCanvas";
import ReelVideo from "@/components/ReelVideo";

/** Describe a reel → plan a ReelSpec → preview → export an MP4 to the pod. */
export default function MakePanel({
  podRoot,
  catalog,
  selectedIds,
  clearSelection,
}: {
  podRoot: string;
  catalog: CatalogEntry[];
  selectedIds: Set<string>;
  clearSelection: () => void;
}) {
  const [query, setQuery] = useState("");
  const [planning, setPlanning] = useState(false);
  const [reel, setReel] = useState<ReelSpec | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  const [recent, setRecent] = useState<ReelMeta[]>([]);

  const catalogById = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  useEffect(() => {
    listReels(podRoot).then(setRecent).catch(() => {});
  }, [podRoot]);

  async function onPlan() {
    if (!query.trim() || planning) return;
    setPlanning(true);
    setPlanError(null);
    setReel(null);
    setRenderedUrl(null);
    setRenderError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          catalog: catalog.map(toPlannerAsset),
          selectedAssetIds: selectedIds.size > 0 ? [...selectedIds] : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `plan ${res.status}`);
      setReel(data.reel as ReelSpec);
      setSource(data.source ?? null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }

  async function onExport() {
    if (!reel || rendering) return;
    setRendering(true);
    setRenderError(null);
    try {
      const mp4 = await renderReel(podRoot, reel, catalogById);
      const nowIso = new Date().toISOString();
      await saveReel(podRoot, reel, mp4, nowIso);
      setRenderedUrl(URL.createObjectURL(mp4));
      listReels(podRoot).then(setRecent).catch(() => {});
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
        <label className="text-sm font-medium" htmlFor="reel-query">
          What do you want to see?
        </label>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-primary">◉ working from {selectedIds.size} selected</span>
            <button onClick={clearSelection} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Clear selection">
              <X className="size-4" />
            </button>
          </div>
        )}
        <textarea
          id="reel-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onPlan();
          }}
          rows={3}
          placeholder="a calm reel about apple trees this spring…"
          className="w-full resize-none rounded-lg border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <div className="flex items-center gap-3">
          <Button onClick={onPlan} disabled={planning || !query.trim()}>
            {planning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Plan the reel
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">⌘↵</span>
          {source === "local" && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              offline planner
            </span>
          )}
        </div>
        {planError && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {planError}
          </p>
        )}

        {reel && (
          <div className="mt-2 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{reel.title}</p>
              <span className="font-mono text-[11px] text-muted-foreground">{reel.scenes.length} scenes</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={onExport} disabled={rendering} variant="secondary">
                {rendering ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export MP4 to pod
              </Button>
              {renderError && <span className="text-sm text-destructive">{renderError}</span>}
            </div>
            {renderedUrl && (
              <video src={renderedUrl} controls className="mt-4 w-full max-w-[300px] rounded-lg border" />
            )}
          </div>
        )}

      </div>

      {/* Preview is the second grid item so on mobile (single column) it stacks
          right after the plan controls — the just-made reel, not buried below
          "Recently made". On lg+ it sits sticky in the right column while
          "Recently made" flows into the left column's second row. */}
      <div className="lg:row-span-2 lg:sticky lg:top-6 lg:self-start">
        {reel ? (
          <ReelCanvas reel={reel} podRoot={podRoot} />
        ) : (
          <div className="reel-stage mx-auto flex w-full max-w-[300px] flex-col items-center justify-center rounded-xl border text-center text-muted-foreground">
            <Film className="mb-2 size-7" />
            <p className="px-6 text-sm">Plan a reel to preview it here.</p>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="lg:col-start-1">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Recently made
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {recent.map((m) => (
              <li key={m.id} className="rounded-lg border bg-card p-3">
                <ReelVideo podRoot={podRoot} id={m.id} className="w-full rounded-md border" />
                <p className="mt-2 truncate text-sm font-medium">{m.title}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {m.sceneCount} scenes · {m.duration}s
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
