"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@mind-studio/ui";
import { LogOut } from "lucide-react";
import { clearLastIdentity } from "@mind-studio/core";
import { ensureSession } from "@/lib/solid/auth";
import { session } from "@/lib/solid/session";
import ThemeToggle from "@/components/ThemeToggle";

const APP_NAME = "Video";

/** App masthead: name, theme toggle, account chip (WebID host) + sign-out. */
export default function Header() {
  const router = useRouter();
  const [webId, setWebId] = useState<string | null>(null);

  useEffect(() => {
    ensureSession()
      .then((info) => setWebId(info.webId ?? null))
      .catch(() => setWebId(null));
  }, []);

  async function onSignOut() {
    await session().logout();
    clearLastIdentity(APP_NAME);
    setWebId(null);
    router.replace("/connect");
  }

  const host = (() => {
    if (!webId) return null;
    try {
      return new URL(webId).host;
    } catch {
      return webId;
    }
  })();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-tight">Mind Video</span>
          <span className="hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            <span className="text-primary">●</span> reels from your pod
          </span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Main">
          <Button asChild variant="ghost" size="sm">
            <Link href="/studio">Studio</Link>
          </Button>
          {host && (
            <span
              className="hidden rounded-full border bg-muted/40 px-3 py-1 font-mono text-xs text-muted-foreground sm:inline"
              title={webId ?? undefined}
              data-testid="account-chip"
            >
              {host}
            </span>
          )}
          <ThemeToggle />
          {webId && (
            <Button variant="ghost" size="sm" onClick={onSignOut} data-testid="sign-out" aria-label="Sign out">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
