"use client";

import { Button } from "@mind-studio/ui";
import { AlertCircle, Check, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { fileToBase64, isModelImage, posterFromVideo } from "@/lib/media";
import { setCaption, uploadAsset } from "@/lib/solid/asset-store";

type RowStatus = "uploading" | "captioning" | "ready" | "deduped" | "error";

interface Row {
  key: string;
  name: string;
  status: RowStatus;
  caption?: string;
  tags?: string[];
  error?: string;
}

/** Drop / pick photos and videos → upload to the pod → auto-caption. */
export default function DropPanel({
  podRoot,
  onChanged,
}: {
  podRoot: string;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);

  function patch(key: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  async function captionFor(file: File, kind: "photo" | "video") {
    let base64: string;
    let mimeType: string;
    let duration: number | undefined;
    if (kind === "video") {
      const poster = await posterFromVideo(file);
      if (!poster) return { caption: "", tags: [] as string[], duration: undefined };
      base64 = poster.base64;
      mimeType = poster.mimeType;
      duration = poster.duration;
    } else {
      base64 = await fileToBase64(file);
      mimeType = isModelImage(file.type) ? file.type : "image/jpeg";
    }
    const res = await fetch("/api/caption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64, mimeType, kind, name: file.name }),
    });
    if (!res.ok) throw new Error(`caption ${res.status}`);
    const data = (await res.json()) as { caption: string; tags: string[] };
    return { caption: data.caption, tags: data.tags, duration };
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`;
      setRows((prev) => [{ key, name: file.name, status: "uploading" }, ...prev]);
      try {
        const nowIso = new Date().toISOString();
        const { entry, deduped } = await uploadAsset(podRoot, file, nowIso);
        if (deduped) {
          patch(key, { status: "deduped", caption: entry.caption, tags: entry.tags });
          onChanged();
          continue;
        }
        patch(key, { status: "captioning" });
        const { caption, tags, duration } = await captionFor(file, entry.kind);
        await setCaption(podRoot, entry.id, { caption, tags, duration });
        patch(key, { status: "ready", caption, tags });
        // Refresh only once the sidecar is fully written — listing the container
        // mid-write hits a brief CSS settle window and 404s the new sidecar.
        onChanged();
      } catch (e) {
        patch(key, { status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center ${
          dragging ? "dropzone-active" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud className="mb-3 size-9 text-muted-foreground" />
        <p className="text-lg font-medium">Drop photos & videos here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          They upload to your pod and get captioned automatically.
        </p>
        <Button className="mt-5" onClick={() => inputRef.current?.click()}>
          Pick files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
              <StatusIcon status={r.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground">{statusLabel(r.status)}</p>
                {r.caption && <p className="mt-1 text-sm">{r.caption}</p>}
                {r.tags && r.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === "uploading" || status === "captioning")
    return <Loader2 className="mt-0.5 size-4 animate-spin text-primary" />;
  if (status === "error") return <AlertCircle className="mt-0.5 size-4 text-destructive" />;
  return <Check className="mt-0.5 size-4 text-primary" />;
}

function statusLabel(status: RowStatus): string {
  switch (status) {
    case "uploading":
      return "uploading…";
    case "captioning":
      return "reading…";
    case "ready":
      return "ready";
    case "deduped":
      return "already in your library";
    case "error":
      return "failed";
  }
}
