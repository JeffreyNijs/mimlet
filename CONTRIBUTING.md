# Contributing

Use the pinned pnpm toolchain and Node 22.18.0 or newer. Keep changes in a branch
and preserve existing feature parity unless the migration guide explicitly calls
out an intentional breaking behavior. New integrations must not add vendors to the
schema-free core or introduce an independently maintained runtime.

## Verification

For everyday changes, use the typed source suites:

```sh
pnpm test:unit
pnpm test:watch
pnpm --filter @mimlet/protobuf test:unit
pnpm type-check
```

Vitest watches the core and every integration through source imports. These fast
suites include native codec/conformance checks and seeded behavioral properties.
The integration project retains the real Hey API generation tests. Full verification
also runs the original Node suites against emitted code and isolated package
archives; a source-test pass alone does not establish package compatibility.

Build and package type-check tasks use Turbo's dependency graph and local cache.
Portable packages extend the shared strict NodeNext compiler policy; the Hey API
bundler configuration and minimum-compiler tests retain their distinct requirements.
The consumer harness copies the compiler policy into its isolated temporary tree
without exposing the workspace's dependencies. `typecheck` remains an alias for
`type-check` for existing automation.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm validate
pnpm pack:check
pnpm audit:production
pnpm test:examples
node scripts/test-browser.mjs --install
```

`validate` includes workspace checks, documentation checks, formatting, lint,
all package type checks, tooling tests, runtime/coverage suites, native compatibility
and the packed Hey API consumer. The browser and portable-runtime workflows are
additional release gates. Run `pnpm test:runtimes` for the active Node contract;
`node scripts/test-runtimes.mjs bun` or `deno` requires that runtime to be installed.
`pnpm benchmark` produces a correctness-checked hardware-specific report.

TypeScript expected-error assertions are real tests: an unused expectation fails
compilation. Test both inference and the absence of `any`/`never` degradation.
Exercise factories and native schemas from installed package tarballs, not only
source aliases. Node 22.18/24 and the minimum core compiler are deliberately
separate checks.

The workspace builds with TypeScript 6. TypeScript 7 has no compiler API, which tsup's
declaration build and Hey API need, so it is tested only as a consumer. To reproduce
the TypeScript 7 job, install `typescript@7.0.2` outside the workspace, point
`TOOLKIT_CONSUMER_TYPESCRIPT_COMPILER` at its `bin/tsc` and run
`node scripts/test-optional-all.mjs`, `node scripts/test-typebox.mjs` and
`node scripts/test-examples.mjs`. The packages are still built with TypeScript 6; only the
consumer files are checked with TypeScript 7. `node scripts/validate-package.mjs --typescript-7`
runs the Hey API consumer with TypeScript 6 beside TypeScript 7.

## New adapters and providers

Declare the original schema, standards handle, actual capabilities and limitations
through the [adapter SDK](packages/adapter/README.md). A validator is
not automatically a generator, field inspector or shrinker. Preserve input/output
codec semantics and native failure causes. Test unsupported conversions explicitly.
Custom executable providers must be versioned for replay and documented as trusted.

Every optional package needs a `tests/compatibility/<name>` fixture with locked
external dependencies, positive/negative type cases and runtime tests. The shared
consumer harness packs the real package and tests it outside the workspace.
`types.mts` compiles with the fixture's `compilerLibs` and `compilerTypes`. To check
the declarations under other libraries as well, for example with DOM or with only
`@types/node`, list extra `types.<name>.mts` files in `additionalTypeChecks`.
`test-optional-all.mjs` discovers fixtures so they cannot silently escape the normal
test command. Preserve independent coverage gates rather than suppressing a failing
suite or reclassifying untested code as an exclusion.

Avoid changing seeds, retries or coverage thresholds merely to make CI pass. Keep
regressions for the underlying behavior and document intentional limitations.
Schema-sampling budgets do not justify silently dropping constraints. A failing
property is useful evidence; shrinking must keep fixed overrides and relationships.

## Documentation and releases

Use `pnpm docs:dev` for the Mimlet site and `pnpm docs:build` / `pnpm docs:preview`
to review its static output at `http://127.0.0.1:4174/mimlet/`. Edit canonical
Markdown in `docs/`, package references in their READMEs, and tested examples in
`examples/recipes/`; the private docs app generates both HTML and clean Markdown.
Run `pnpm docs:test` for navigation, search, accessibility and download checks.
The website and its optional agent skill do not add dependencies to published packages.
See the [website launch guide](docs/mimlet-launch.md) for the after-merge rollout.

Update the root package index, package guide, compatibility contract and relevant
focused guide when changing public behavior. Local Markdown file links and the
package index are checked automatically. Anchor validation and external-link health
are outside that check. Add executable examples to the real consumer recipe/suites
for behavior that needs validation; prose examples are not automatically executed.

Use [Changesets](.changeset/README.md) for subsequent version trains and follow the
[release guide](docs/releases.md). Do not publish, merge, change distribution tags or
claim account-level publisher configuration as a side effect of a source-code edit.
Keep sensitive schemas, credentials, captures, dependency caches and generated
release artifacts out of commits. Report security issues through [SECURITY.md](SECURITY.md).
