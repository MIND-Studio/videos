"use client";

import { Button } from "@mind-studio/ui";
import { Check, Film, SearchX, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import AssetThumb from "@/components/AssetThumb";
import type { CatalogEntry } from "@/lib/catalog";
import { deleteAsset } from "@/lib/solid/asset-store";

type DateFilter = "all" | "today" | "week";

/** Browse the library: search, filter by tag/date, multi-select → Make. */
export default function LibraryGrid({
  podRoot,
  catalog,
  selectedIds,
  toggleSelect,
  onMakeFromSelection,
  onChanged,
}: {
  podRoot: string;
  catalog: CatalogEntry[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  onMakeFromSelection: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of catalog) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([t]) => t);
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return catalog.filter((e) => {
      if (q && !(e.caption.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q))))
        return false;
      if (activeTags.size > 0 && ![...activeTags].every((t) => e.tags.includes(t))) return false;
      if (dateFilter !== "all") {
        const ms = Date.parse(e.captureDate);
        if (Number.isNaN(ms)) return false;
        const ageDays = (now - ms) / 86_400_000;
        if (dateFilter === "today" && ageDays > 1) return false;
        if (dateFilter === "week" && ageDays > 7) return false;
      }
      return true;
    });
  }, [catalog, search, activeTags, dateFilter]);

  const hasFilters = search.trim() !== "" || activeTags.size > 0 || dateFilter !== "all";

  function clearFilters() {
    setSearch("");
    setActiveTags(new Set());
    setDateFilter("all");
  }

  function toggleTag(t: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function onDelete(id: string) {
    // Two-step: first click arms the button, second click confirms — deleting
    // a pod asset is irreversible, so never act on a single stray click.
    setDeleteError(null);
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setConfirmingId(null);
    try {
      await deleteAsset(podRoot, id);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete asset.");
    }
  }

  if (catalog.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Film className="mb-3 size-8" />
        <p>Your library is empty. Drop some photos or videos first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="/ search captions…"
          className="w-full max-w-xs rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-1 rounded-md border bg-card p-1 font-mono text-[11px]">
          {(["today", "week", "all"] as DateFilter[]).map((d) => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`rounded px-2.5 py-1 ${dateFilter === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {d === "week" ? "this week" : d}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          // {filtered.length} of {catalog.length}
        </span>
      </div>

      {deleteError && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                activeTags.has(t)
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {t}
              {activeTags.has(t) ? " ×" : ""}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <SearchX className="mb-3 size-8" />
          <p>No assets match your filters.</p>
          {hasFilters && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((e) => {
            const selected = selectedIds.has(e.id);
            return (
              <div key={e.id} className="group flex flex-col gap-1.5">
                {/* The tile is a single select button; the badge/checkmark are
                  pointer-events-none overlays and the delete control is a
                  SIBLING button (never nested — nested buttons are invalid HTML). */}
                <div className="relative">
                  <button
                    onClick={() => toggleSelect(e.id)}
                    aria-pressed={selected}
                    aria-label={`${selected ? "Deselect" : "Select"} ${e.caption || "asset"}`}
                    className={`block w-full overflow-hidden rounded-lg border ${
                      selected ? "border-primary ring-2 ring-primary" : "border-border"
                    }`}
                  >
                    <AssetThumb
                      podRoot={podRoot}
                      id={e.id}
                      alt={e.caption}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                  {e.kind === "video" && (
                    <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {e.duration ? `${Math.round(e.duration)}s` : "video"}
                    </span>
                  )}
                  <span
                    className={`pointer-events-none absolute right-2 top-2 flex size-5 items-center justify-center rounded-full border ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/40"
                    }`}
                  >
                    {selected && <Check className="size-3" />}
                  </span>
                  <button
                    onClick={() => onDelete(e.id)}
                    onBlur={() => confirmingId === e.id && setConfirmingId(null)}
                    className={`absolute bottom-2 right-2 flex items-center gap-1 rounded-md p-1.5 text-white transition-opacity ${
                      confirmingId === e.id
                        ? "bg-destructive opacity-100"
                        : "bg-black/60 opacity-0 hover:bg-black/80 group-hover:opacity-100 focus-visible:opacity-100"
                    }`}
                    aria-label={confirmingId === e.id ? "Confirm delete" : "Delete asset"}
                  >
                    <Trash2 className="size-3.5" />
                    {confirmingId === e.id && (
                      <span className="font-mono text-[10px]">Delete?</span>
                    )}
                  </button>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {e.caption || "captioning…"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button className="ml-auto" onClick={onMakeFromSelection}>
              <Film className="size-4" /> Make a reel →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
