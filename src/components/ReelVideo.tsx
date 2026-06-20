"use client";

import { Film } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchReelVideoBlob } from "@/lib/solid/reel-store";

/**
 * An inline player for a rendered reel stored in the pod. Pod reads are
 * authenticated, so a bare `<video src>` to the pod URL would 401 (and the
 * browser ORB-blocks it) — we fetch the bytes through the session fetch and
 * play them as a `blob:` URL, revoked on unmount. Mirrors {@link AssetThumb}.
 */
export default function ReelVideo({
  podRoot,
  id,
  className,
}: {
  podRoot: string;
  id: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    fetchReelVideoBlob(podRoot, id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [podRoot, id]);

  if (failed) {
    return (
      <div
        className={`flex aspect-[9/16] items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
      >
        <Film className="size-6" />
      </div>
    );
  }
  if (!url) {
    return <div className={`aspect-[9/16] animate-pulse bg-muted ${className ?? ""}`} />;
  }
  // `#t=0.1` seeks to the first frame so the card shows the reel's title frame
  // as a poster instead of a blank black rectangle at rest. The blob is already
  // in memory, so the seek is instant.
  return (
    <video src={`${url}#t=0.1`} controls preload="metadata" playsInline className={className} />
  );
}
