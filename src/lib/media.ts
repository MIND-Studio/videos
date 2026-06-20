"use client";

/**
 * Client-side media helpers used by the Drop flow. Everything runs in the
 * browser — bytes never leave except the caption thumbnail the user explicitly
 * sends to /api/caption.
 */

/** Read a File's raw bytes as base64 (no data: prefix). */
export async function fileToBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Whether the browser can hand this image type to the vision model directly. */
export function isModelImage(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m === "image/jpeg" || m === "image/png" || m === "image/webp" || m === "image/gif";
}

export interface Poster {
  base64: string;
  mimeType: "image/jpeg";
  duration: number;
}

/**
 * Extract a poster frame (~1s in) from a video File as JPEG base64, plus the
 * clip duration. Used to caption videos and to learn their length. Resolves to
 * null if the browser can't decode the clip.
 */
export function posterFromVideo(file: File): Promise<Poster | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);
    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.onloadedmetadata = () => {
      const seekTo = Math.min(1, (video.duration || 2) / 2);
      const onSeeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 1280;
          const ctx = canvas.getContext("2d");
          if (!ctx) return fail();
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          cleanup();
          resolve({
            base64: dataUrl.replace(/^data:[^,]+,/, ""),
            mimeType: "image/jpeg",
            duration: Number.isFinite(video.duration) ? video.duration : 5,
          });
        } catch {
          fail();
        }
      };
      video.onseeked = onSeeked;
      try {
        video.currentTime = seekTo;
      } catch {
        fail();
      }
    };
    video.onerror = fail;
    // Guard against a clip that never fires events.
    setTimeout(fail, 8000);
  });
}
