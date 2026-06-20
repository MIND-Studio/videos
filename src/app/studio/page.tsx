"use client";

import { Button } from "@mind-studio/ui";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import VideoApp from "@/components/VideoApp";
import { ensureSession, rememberSignedOutPath } from "@/lib/solid/auth";
import { currentIdentity, signalReady } from "@/lib/solid/broker";

export default function StudioPage() {
  const [state, setState] = useState<"loading" | "signedout" | "ready">("loading");
  const [podRoot, setPodRoot] = useState<string | null>(null);

  useEffect(() => {
    ensureSession()
      .then((info) => {
        const id = currentIdentity();
        if (info.isLoggedIn && id) {
          setPodRoot(id.podRoot);
          setState("ready");
          signalReady(); // clear the shell's loading overlay when embedded
        } else {
          rememberSignedOutPath();
          setState("signedout");
        }
      })
      .catch(() => {
        rememberSignedOutPath();
        setState("signedout");
      });
  }, []);

  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Connecting to your pod…
      </div>
    );
  }

  if (state === "signedout") {
    return (
      <section className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Not connected
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Connect your pod</h1>
        <p className="mt-3 text-muted-foreground">
          Mind Video stores your assets and reels in your pod. Sign in to start.
        </p>
        <Button asChild className="mt-6">
          <Link href="/connect">Connect a pod →</Link>
        </Button>
      </section>
    );
  }

  return <VideoApp podRoot={podRoot!} />;
}
