"use client";

import { Clapperboard, Library, Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import DropPanel from "@/components/DropPanel";
import LibraryGrid from "@/components/LibraryGrid";
import MakePanel from "@/components/MakePanel";
import type { CatalogEntry } from "@/lib/catalog";
import { listCatalog } from "@/lib/solid/asset-store";

type Tab = "drop" | "make" | "library";

const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: "drop", label: "Drop", icon: Upload },
  { id: "make", label: "Make", icon: Clapperboard },
  { id: "library", label: "Library", icon: Library },
];

/** The whole signed-in studio surface. Owns the catalog + cross-tab selection. */
export default function VideoApp({ podRoot }: { podRoot: string }) {
  const [tab, setTab] = useState<Tab>("drop");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // DropPanel fires onChanged twice per upload (after the bytes land, then after
  // captioning), so refreshes overlap. Without this guard a slower stale listing
  // can resolve last and clobber a newer one — making a just-uploaded asset
  // vanish until a full reload. Last-call-wins: only the newest refresh applies.
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const next = await listCatalog(podRoot);
      if (seq === refreshSeq.current) setCatalog(next);
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, [podRoot]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const pendingCaptions = catalog.filter((e) => !e.caption).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      {/* counters */}
      <div className="mb-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{catalog.length} assets</span>
        {pendingCaptions > 0 && <span>· {pendingCaptions} captioning</span>}
        {selectedIds.size > 0 && (
          <span className="text-primary">· {selectedIds.size} selected</span>
        )}
      </div>

      {/* tab bar */}
      <div className="mb-6 inline-flex w-fit gap-1 rounded-lg border bg-card p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${id}`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Loading your library…
        </div>
      ) : (
        <>
          {tab === "drop" && <DropPanel podRoot={podRoot} onChanged={refresh} />}
          {tab === "make" && (
            <MakePanel
              podRoot={podRoot}
              catalog={catalog}
              selectedIds={selectedIds}
              clearSelection={clearSelection}
            />
          )}
          {tab === "library" && (
            <LibraryGrid
              podRoot={podRoot}
              catalog={catalog}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              onMakeFromSelection={() => setTab("make")}
              onChanged={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}
