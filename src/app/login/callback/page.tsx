"use client";

import { Button } from "@mind-studio/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeLoginRedirect, consumeReturnTo } from "@/lib/solid/auth";

export default function LoginCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Consume the OIDC code, then SPA-navigate to the returnTo. `router.replace`
    // (not `window.location`) keeps the in-memory @inrupt session alive.
    // `completeLoginRedirect` shares one single-flight `handleIncomingRedirect`
    // with `ensureSession`, so the one-time code is never redeemed twice.
    completeLoginRedirect()
      .then((info) => {
        if (!info.isLoggedIn) {
          setError("Sign-in did not complete. Please try again.");
          return;
        }
        router.replace(consumeReturnTo());
      })
      .catch((e) => setError(String(e)));
  }, [router]);

  return (
    <section className="mx-auto max-w-md px-6 py-20 text-center">
      {error ? (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-destructive">
            Login failed
          </p>
          <p className="mt-3 break-all font-mono text-sm">{error}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/connect">Try again</Link>
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">Finishing sign-in…</p>
      )}
    </section>
  );
}
