---
name: mimlet
description: Use Mimlet to create typed test fixtures, native-schema builders, correlated scenarios, replayable failures, or generated fluent builders. Use when the user requests Mimlet or the project already uses it; preserve the project's schema and test framework choices.
---

# Mimlet test-data workflow

Mimlet is a modular schema-aware test-data toolkit. This is an optional product
skill, not permission to install dependencies, change unrelated code, or replace
the user's chosen library. Mimlet betas are published on npm's `latest` tag. Read the
installed version first (`npm ls @mimlet/core`, or `npx mimlet --version` when
`@mimlet/codegen` is installed) and use the APIs documented for that version. The
[releases page](https://jeffreynijs.github.io/mimlet/guide/releases.html) names the
current train.

Use `fluent(fromZod(schema), ['name'])` for direct named setters when the installed
train is alpha.2 or newer. When the installed adapter exports a field list function
(`zodFields`, `typeBoxFields`, `valibotFields`, `arkTypeFields`, `effectFields`,
`standardJsonSchemaFields`; beta.1 and newer), `fluent(fromZod(schema), zodFields(schema))`
adds a setter per field, also inside generic helpers. Keep small declarations beside
tests; do not create builder files or a generation step unless the task needs them. For class
instances such as ORM entities (beta.4 and newer), use `createInstanceBuilder(Entity, factory)`
instead of a hand-written transform; `map()` changes what builds return. See
`docs/class-instances.md`. Check
`docs/fluent-builders.md` and `docs/cli-diagnostics.md` for version-specific APIs.
Do not suggest `fluent()` or `mimlet doctor`/`inspect` for alpha.1. Check diagnostic
format/version and branch on codes, not human-readable messages. Successful
metadata checks or schema preparation do not prove application correctness or
that a schema has valid generated values.

1. Inspect the project's package manifest, schema and nearby tests. Choose the
   smallest relevant package: `@mimlet/core` for the core, `@mimlet/<adapter>` for an
   optional integration, or `hey-api-builders` for its existing generator plugin.
2. Distinguish schema input from output. `.with()` accepts input-typed overrides;
   `.build()` creates input; `.buildValidated()` returns validated/decoded output.
   Use the async variants when the factory or validation is asynchronous.
3. Use native adapters for native codecs and supported creation. Standard Schema
   validation does not imply automatic generation. Supply a factory for unsupported
   constraints instead of weakening a schema or casting away its types. In releases
   from 0.1.0-beta.4, `profile: 'realistic'` gives readable values and fills optional
   fields for adapters that generate through JSON Schema.
4. Model relationships as scenario dependencies. For shrinking, shrink independent
   inputs and recompute foreign keys/totals from them. To vary one field of a derived
   node (0.1.0-beta.5 and newer), use `scenario.patch(name, patcher)`
   instead of an override that repeats the derivation. For a class instance node,
   0.1.0-beta.6 and newer also take the changed fields,
   `scenario.patch(name, { status: 'sent' })`, which keeps the class; a spread copy does not.
5. Use explicit seeds and compatible provider/schema/configuration identities.
   Save before an operation to reproduce it. Preserve replay errors and the original
   failing test; a seed does not control arbitrary user I/O or external state.
6. For code generation, start with `mimlet --config builders.json --out generated
--check` when only inspecting drift. Regenerate only within the requested task. For
   an OpenAPI document (0.1.0-beta.4 and newer), use an `openapi` configuration
   entry rather than copying component schemas into JSON Schema targets. For a NestJS
   document (0.1.0-beta.5 and newer), add `"closedObjects": true`.
7. Run the relevant test and type checker. State what was verified; do not infer
   compatibility, publication or performance from an example alone.

## Find the matching contract

In a Mimlet source checkout, read `docs/adapters.md`, `docs/agents.md`, and the
matching package README. `examples/recipes/` contains the actual typed examples;
`pnpm test:examples` compiles and executes them against isolated tarballs.

For DTO classes validated with class-validator (NestJS), `@mimlet/class-validator`
(0.1.0-beta.4 and newer; check that it is installed) builds payloads with `build()` and the
DTO instances `ValidationPipe` produces with `buildValidated()`:
`fromClassValidator(Dto, factory, validationPipeOptions)`, with `wire: qs` for query
DTOs and `fromClassValidatorAsync` for async constraints. From 0.1.0-beta.6, use
`withClassValidatorDefaults(options)` to bind those options once. See `docs/class-validator.md`.

The Zod/ArkType adapters are documented in `docs/zod-and-arktype.md` and included
from `0.1.0-alpha.1`. Match the installed toolkit train. Zod schemas with async
refinements require `fromZodAsync` or `fromZodFactoryAsync`; an async factory alone
does not select the native async validator.

Use [the agent guide](https://jeffreynijs.github.io/mimlet/guide/agents.md)
or the [documentation index](https://jeffreynijs.github.io/mimlet/llms.txt). If the
site is not live or does not match the installed version, use the source checkout
or report that the matching contract is unavailable. Do not invent missing APIs.

Keep saved `test-builders/*` format/provider identifiers and the generator's
`.test-builders.manifest.json` unchanged. They intentionally preserve compatibility
across the rename. Keep fixture secrets out of logs, issue bodies and commits.
