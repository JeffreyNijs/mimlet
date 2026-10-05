# Meet Mimlet

**Test data, with character.** Build typed fixtures from your schemas, keep related
records consistent, and save a failing case so you can replay it later.

Mimlet's core has no dependencies. Everything else is a separate package, so you
install only the adapters you use. [Choose an adapter](adapters.md) for your schema
library.

<!-- github-only -->

Reading this on GitHub? [Open the rendered quickstart](https://jeffreynijs.github.io/mimlet/guide/getting-started.html)
for inline examples, or follow the tested recipe source links below.
<!-- /github-only -->

## Install the beta

The coordinated beta is published on npm: `@mimlet/*` packages at `0.1.0-beta.3` on
the `latest` tag, alongside `hey-api-builders@3.0.0-beta.3` on `next`. Pin matching versions
when reproducing fixtures or generated clients. The existing Hey API `latest` tag
remains on v2.

For the TypeBox example below, use Node **22.18 or newer** and install:

```sh
npm install --save-dev @mimlet/core@0.1.0-beta.3 @mimlet/typebox@0.1.0-beta.3 typebox@1.3.34
```

For a plain factory, only `@mimlet/core` is needed. The `mimlet` executable comes
from `@mimlet/codegen`; the core package does not install a CLI. See
[compatibility](compatibility.md) for tested runtime and schema-library versions.

Already using Zod? Skip the TypeBox install and go straight to
[native Zod builders](zod-and-arktype.md), or use the Zod install under
[Named fluent helpers](#named-fluent-helpers) below.

## Your first fixture

This example uses modern `typebox@1.3.34` and `@mimlet/typebox`. It is the same
source compiled and executed by `pnpm test:examples` and shown on the home page.

<!-- recipe:hero -->

[View the tested TypeBox first fixture source](../examples/recipes/hero.ts).

The original builder remains unchanged when you call `.with()`. `.build()` creates
schema input; `.buildValidated()` validates that input and returns decoded output.
Those types can differ when your schema has a codec or transform. Use the async
methods when validation or the factory is asynchronous.

## Named fluent helpers

Use `fluent()` to add selected named setters directly to a schema builder. Declare
it once beside the test, then create the variations you need. No builder file or
code-generation step is required:

```sh
npm install --save-dev @mimlet/core@0.1.0-beta.3 @mimlet/zod@0.1.0-beta.3 zod@4.6.5
```

<!-- recipe:fluent -->

[View the tested Zod named setters source](../examples/recipes/fluent.ts).

To run this example in a fresh project, save the linked source as `fixture.mts`,
append `console.log(output)`, and run `node fixture.mts` with Node 22.18 or newer.
It prints `{ name: 'Ada', age: 42 }`. Node executes TypeScript by stripping types;
use your project's TypeScript check as well to verify the input/output types.

The field tuple is checked against the schema's input. Generic `.with()` remains
available. For finite ordinary records, [named setters](fluent-builders.md) retain
native validation, immutable branches and async capabilities. Existing generated
classes and the Hey API plugin remain optional alternatives.

## Build from source

Use the repository's pinned pnpm toolchain:

```sh
git clone https://github.com/JeffreyNijs/mimlet.git
cd mimlet
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test:examples
corepack pnpm docs:dev
```

The example command installs toolkit tarballs in a temporary consumer, compiles
the recipes, and runs them. If Corepack is unavailable, use pnpm **10.34.5** directly.

## Try an isolated source consumer

From a clean, committed Mimlet checkout, `pnpm release:prepare` creates the verified
tarballs and their digest manifest in `release/`. The command requires a clean
tree and refuses to overwrite an existing release directory.

In a separate test project, install the core and TypeBox adapter tarballs together:

```sh
npm init -y
npm pkg set type=module
npm install /absolute/path/to/checkout/release/mimlet-core-0.1.0-beta.3.tgz /absolute/path/to/checkout/release/mimlet-typebox-0.1.0-beta.3.tgz typebox@1.3.34
```

Replace the absolute paths with the checkout you built. Add only the adapters you
need, using the matching release train. This local workflow lets you test source changes before publishing a new version.

## When generation needs your help

Automatic generation has a supported capability set. A native refinement, custom
format or callback may need an explicit factory:

<!-- recipe:factory -->

[View the tested explicit factory source](../examples/recipes/factory.ts).

Use a factory to express meaningful domain data while retaining native validation.
A generation failure does not prove that a schema has no valid values.

Continue with [scenarios](correlated-scenarios.md), [replay](sessions-and-replay.md),
or the [coding-agent recipes](agents.md). Existing Hey API users should read the
[migration guide](hey-api-migration.md).
