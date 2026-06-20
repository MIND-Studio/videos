import { Button } from "@mind-studio/ui";
import Link from "next/link";

export default function Landing() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Agentic short-form reels
      </p>
      <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
        Drop your media. Describe a reel.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Mind Video captions every photo and clip you drop, then turns a sentence like{" "}
        <em>“a calm reel about apple trees”</em> into an ordered <em>ReelSpec</em> — a fixed set of
        scene blocks the agent fills, never free-form markup. It previews live in your browser and
        renders to an MP4 with{" "}
        <a
          className="text-primary underline-offset-4 hover:underline"
          href="https://github.com/heygen-com/hyperframes"
        >
          hyperframes
        </a>
        . Reliably calm — and yours: every asset and reel lives in your pod.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/studio">Open the studio</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/connect">Connect a pod</Link>
        </Button>
      </div>

      <section className="mt-20 grid gap-8 sm:grid-cols-3">
        <Feature
          title="Drop → auto-caption"
          body="Photos and clips are captioned and tagged by Claude vision as you drop them, so your library is searchable from the first upload."
        />
        <Feature
          title="Spec → preview → MP4"
          body="The agent emits a schema-validated ReelSpec. One serializer renders it as a hyperframes composition — the same artifact previews in-browser and renders to video."
        />
        <Feature
          title="Pod-backed, private"
          body="Your browser talks directly to your pod. Captions and reels are written to your-pod/mind-video/ — never a Mind server."
        />
      </section>

      <p className="mt-16 rounded-lg border bg-muted/40 px-5 py-4 font-mono text-xs leading-relaxed text-muted-foreground">
        Privacy invariant: your browser talks directly to your pod. The query you type and a caption
        thumbnail are sent to the model (this is the authoring tool), but your assets and saved
        reels never touch a Mind server.
      </p>
    </section>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
