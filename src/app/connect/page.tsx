import ConnectForm from "@/components/ConnectForm";

const ISSUER =
  process.env.NEXT_PUBLIC_SOLID_ISSUER ??
  process.env.NEXT_PUBLIC_POD_BASE_URL ??
  "https://pods.mindpods.org/";
const IS_LOCAL_ISSUER = ISSUER.includes("localhost") || ISSUER.includes("127.0.0.1");
const ISSUER_HOST = (() => {
  try {
    return new URL(ISSUER).host;
  } catch {
    return ISSUER;
  }
})();

export default function ConnectPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Connect a pod
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Sign in to drop media and make reels.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Mind Video stores everything in your pod under <code>your-pod/mind-video/</code> — your
        assets and rendered reels live on your pod, never our servers. Pick the issuer that hosts
        your pod; we redirect you there for the OIDC dance and come back once you&apos;re in.
      </p>
      <div className="mt-8">
        <ConnectForm />
      </div>
      {IS_LOCAL_ISSUER && (
        <div className="mt-12 rounded-lg border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Dev shortcut
          </p>
          <p className="mt-2">
            The shared local pod server (on {ISSUER_HOST}) ships a pre-seeded account:
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>alice@mind-video.local · dev-only-do-not-use-in-prod</li>
          </ul>
        </div>
      )}
    </section>
  );
}
