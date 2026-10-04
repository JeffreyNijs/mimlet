# Mimlet website

This private VitePress application contains the custom landing page and documentation
theme. It is outside `packages/` and is excluded from the publishable package inventory.

From the repository root:

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
pnpm docs:test
```

The preview listens on `127.0.0.1:4174/mimlet/`. Install the test browser once with
`pnpm --dir apps/docs exec playwright install chromium`. CI also installs its OS dependencies.

Edit technical Markdown in `docs/` and package READMEs in `packages/`. Edit executable
snippets in `examples/recipes/`; `pnpm test:examples` checks their types and behavior
against packed packages. `scripts/prepare.ts` creates ignored `.generated/` content,
clean Markdown alternates and `llms.txt` from those same sources. Do not edit the
generated pages. Development mode watches canonical sources and writes changed
pages atomically; removed canonical pages are removed from generated output too.

Landing-page copy lives in `content.ts`, layout/styles in `.vitepress/theme/`, and
original artwork in the repository's `assets/brand/`. Run `pnpm brand:render` when
changing the SVG social card. The public base path is always `/mimlet/`.

The homepage demo video and its poster live in `assets/demo/` and are copied to
`/mimlet/demo/`. The video is rendered from SVG and code with the approved mascot
(no generated imagery) by `pnpm video checkout` (see `scripts/video/`), and follows
`examples/recipes/checkout.ts` at seed 12345; `pnpm video:verify checkout` re-runs that
recipe against the published packages. Copy `dist/videos/checkout.mp4` here, then take
the poster from the shrinking scene at 21 seconds:
`ffmpeg -ss 21 -i mimlet-checkout-demo.mp4 -frames:v 1 -vf scale=1280:720:flags=lanczos -q:v 3 mimlet-checkout-demo-poster.jpg`.

## In-browser sandbox

The "Try it" page (`docs/try-it.md`) renders `MimletSandbox.vue`, which is loaded only on
that page. Its logic lives in `sandbox/`: presets, the import rewriter, the value
formatter, the page-side runner with its time budgets, and the frame host.
`scripts/sandbox-runtime.ts` bundles `sandbox/worker.ts` with the workspace builds of
`@mimlet/core`, `@mimlet/json-schema`, `@mimlet/zod` and `@mimlet/valibot`, and the pinned
`zod` and `valibot` from this app, into one content-hashed classic worker script in
`.generated/public/sandbox/`. `prepare.ts` and `dev.ts` run it; restart `docs:dev` after
changing `sandbox/` or a bundled package. The page fetches the runtime on the first run.

Each run gets a new `sandbox="allow-scripts"` frame (opaque origin) whose Content Security
Policy allows only its hashed bootstrap script, `eval` and a `blob:` worker. Workers
created from `blob:` URLs inherit that policy, so visitor code has no network access.
Stopping a run terminates the worker and removes the frame. If you change the bootstrap
in `sandbox/frame.ts`, update `BOOTSTRAP_HASH`; `tests/unit/docs-sandbox.test.ts` checks it.
Unit tests cover the runner, rewriter, formatter and presets, `tests/sandbox.spec.ts`
covers the page, and `pnpm test:browser` runs a smoke test in Chromium, Firefox and WebKit.

## Toolchain boundaries

- VitePress stays at stable 1.6.4. Its Vite dependency is pinned to patched 6.4.3.
- The site targets ES2022/current evergreen browsers. Toolkit runtime and browser
  support is verified separately by the existing packed-consumer workflows.
- Vue source/configuration is checked strictly by `vue-tsc`. Only this private
  app skips dependency declaration checking: VitePress 1.6 and its transitive VueUse
  declarations are not fully compatible with TypeScript 6. The published package
  declarations and consumer compiler tests retain their existing stricter gates.
- The theme corrects the pinned VitePress local-search overlay's button role to a
  labelled modal, retaining native focus/search behavior. Browser tests cover search,
  keyboard access, WCAG checks, paths, Markdown alternates and metadata.

See `docs/mimlet-launch.md` for the after-merge launch sequence. Building or testing
this app does not reserve npm names, rename the repository, or deploy a website.
