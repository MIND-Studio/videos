# Vendored blocks

The canonical HTML + GSAP recipe for each block lives in
`src/lib/reel/serialize.ts` (so it is type-checked and shared with the preview).
This folder holds the **design tokens** and any blocks vendored from the
hyperframes catalog via `npx hyperframes add`.

Current vocabulary (one recipe per entry in `serialize.ts`):

- **title** / **closing** — centered cards (`.card`, `.card-title`, …)
- **photo** — `.media-bg` (blurred fill) + `.media-fg` (contained image) with a
  Ken-Burns scale tween and a bottom-left `.label-block`
- **video** — same as photo, but `.media-fg` is a `<video>` whose `currentTime`
  is driven by the scene's slice of the timeline
- **flash-through-white** — a `.flash` white overlay tweened `0.9 → 0` at the
  scene boundary (the catalog `flash-through-white` transition, vendored here)

Design tokens (palette, type scale) are defined in the `STYLES` constant in
`serialize.ts` and inlined into every composition. If you vendor a catalog block
that ships its own CSS, add it here and `@import` or inline it from the
serializer so preview and render stay byte-identical.
