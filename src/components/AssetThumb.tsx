"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAssetBlob } from "@/lib/solid/asset-store";

/**
 * A pod asset thumbnail. Pod reads are authenticated, so a bare `<img src>` to
 * the pod URL would 403 — we fetch the bytes through the session fetch and show
 * them as a `blob:` URL, revoked on unmount.
 */
export default function AssetThumb({
  podRoot,
  id,
  alt,
  className,
}: {
  podRoot: string;
  id: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    fetchAssetBlob(podRoot, id)
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
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
      >
        <ImageIcon className="size-6" />
      </div>
    );
  }
  if (!url) {
    return <div className={`animate-pulse bg-muted ${className ?? ""}`} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? ""} className={className} loading="lazy" />;
}
