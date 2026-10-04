# Try Mimlet in your browser

Edit a small program and run it on this page, with nothing to install. The code runs
locally in your browser. Nothing you type is sent to a server or saved.

Mimlet is in beta (`0.1.0-beta.1`), so APIs can still change before a stable release.
If something is confusing, [send beta feedback](https://github.com/JeffreyNijs/mimlet/issues/new?template=beta-feedback.yml).

<!-- github-only -->

Reading this on GitHub? [Open the sandbox](https://jeffreynijs.github.io/mimlet/guide/try-it.html)
to run the examples.
<!-- /github-only -->

<!-- interactive:sandbox -->

## What you can run

Each example is a short JavaScript program with ES module imports. It can import from:

- `@mimlet/core`, for builders, `fluent()`, scenarios and sessions
- `@mimlet/zod`, with `zod` 4.6.5
- `@mimlet/valibot`, with `valibot` 1.5.0
- `@mimlet/json-schema`

The Mimlet packages are built from the same revision of this repository as the site you
are reading. The vendor libraries are pinned to the versions above.

Output shows what the program passes to `console.log()` and the values it exports. When
the program throws, the sandbox shows the error. For a validation error from
`buildValidated()`, it lists each issue with the path of the field that failed, such as
`age` or `address.postcode`.

The sandbox runs JavaScript, not TypeScript. Remove type annotations when you paste code
from the guides. Put imports at the top of the program.

## How it runs

- The first time you press Run, the page downloads the sandbox runtime: the packages and
  libraries above, bundled into one file. Other pages never load it.
- Each run starts in a new hidden frame that has its own empty origin. The program runs
  in a Web Worker inside that frame. It cannot read or change this page, its cookies or
  the site's storage.
- The frame's Content Security Policy blocks network requests and scripts from anywhere
  else, so the program cannot send data out of your browser.
- Each run has a time limit of 2, 5 or 10 seconds. Stop, Escape or the time limit ends the
  run straight away, even in the middle of a loop. Chromium-based browsers can take up to
  two more seconds to release the processor.
- Output is limited to 500 console entries. Memory is not limited beyond what your browser
  allows, so a program that allocates a lot can slow down or close the tab.
- Edits stay in the page while it is open. Reloading the page restores the examples.

## Use it in a project

Install the beta packages you need, then continue with
[Getting started](getting-started.md), [named setters](fluent-builders.md) or
[correlated scenarios](correlated-scenarios.md).

```sh
npm install --save-dev @mimlet/zod@0.1.0-beta.1 zod@4.6.5
```

For JSON Schema documents on your own machine, the
[local schema playground](../packages/playground/README.md) generates fixtures without a
network connection.
