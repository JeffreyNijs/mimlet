# Compatibility contract

This describes the published `0.1.0-beta.2` train and its tested source contracts. A supported interface, a native parser,
an automatic generator and a shrinker are different capabilities. Native package
versions below are explicit conformance targets or exhaustively tested bounded
ranges. Fixture manifests, lockfiles and `tests/vendor-versions.json` are the
executable source of truth.

| Input or integration | Tested target                          | Generation and types                                                                                          | Validation, codecs and limits                                                                                             |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Typed factories      | Core API                               | Inferred values/arguments, sync or async; caller owns generation.                                             | Optional Standard Schema validation; no schema dependency.                                                                |
| Standard Schema      | v1 interface                           | Any conforming validator plus an input factory.                                                               | Native input/output distinction; sync/async execution and options. Standards acceptance alone is not auto-generation.     |
| Standard JSON Schema | v1 interface                           | Input conversion plus generation; input/output types retained.                                                | Must also supply Standard Schema to validate native output; opaque refinements can reject generated input.                |
| TypeBox              | `typebox` 1.3.34                       | Native minimal/default creation with a deterministic fill, complete anyOf-branch selection, custom factories. | Strict checking, root/field Codec handling, named contexts; no lossy JSON conversion.                                     |
| Legacy TypeBox       | `@sinclair/typebox` 0.34.48–0.34.52    | Separate native minimal/default creation with the same fill, and anyOf selection.                             | Native Transform, references, recursion, Date and format cases. Native version semantics are not rewritten.               |
| Zod                  | 4.4.3–4.6.5                            | Dedicated Zod/Mini builders, input JSON generation and typed factories.                                       | Native parsing/codecs; explicit async path avoids the Standard entry probe.                                               |
| Valibot              | 1.5.0; converter 1.8.0                 | Native adapter converts synchronous schema input.                                                             | Original parsing/transformations. Async/native-only schemas use a factory with Standard Schema.                           |
| ArkType              | 2.2.5–2.2.7 (2.2.5 through alpha.3)    | Dedicated builders, input JSON generation and native typed factories.                                         | Native morphs/scopes and input checks retained; no private AST dependency.                                                |
| Effect               | 4.0.0 (3.22.2 through alpha.3)         | Native decoded arbitrary re-encoded as input; sync/async factory escape hatches.                              | Native input/output arbitraries, codecs and Effect 4's own arbitrary engine and shrinking (fast-check 3 through alpha.3). |
| JSON Schema          | Draft-07, 2019-09, 2020-12             | `json-schema-faker` 0.6.3; explicit versioned alternative providers.                                          | Separate Ajv 8.20.0 validators and ajv-formats 3.0.1; checked output, offline references and bounded attempts.            |
| Faker                | 10.5.0–10.6.0 (10.5.0 through alpha.3) | Explicit factories, locale fallback and stable named session streams.                                         | Native schemas can validate results; fixed reference dates and versioned replay.                                          |
| fast-check           | 4.10.2                                 | Native arbitraries, fixture mappings, parameter/scenario shrinking.                                           | Sync/async properties, assertions and replay; arbitrary derivation from every schema is not claimed.                      |
| OpenAPI              | 3.0, 3.1, 3.2                          | Request/response envelope builders and component projection.                                                  | Directional policy, media/status selection and explicit serializers; not a full document validator or HTTP client.        |
| AsyncAPI             | 2.0–2.6, 3.0–3.1                       | Headers/payload message envelopes.                                                                            | Native dialect selection; message identity and offline references. No broker connection.                                  |
| GraphQL              | graphql 17.0.2                         | Native inputs and selection-aware output fixtures.                                                            | Original schema rules, custom scalars and bounded recursion; not live resolver execution.                                 |
| Protobuf             | protobufjs 8.8.0                       | Native message fixtures and lossless integer representation.                                                  | Explicit offline imports, oneofs, binary codecs and input limits.                                                         |
| Avro                 | avsc 5.7.9                             | Native fixtures, recursive records and explicit union branches.                                               | BigInt-backed signed 64-bit values, defaults and binary codecs; unknown logical semantics need explicit support.          |
| Hey API              | openapi-ts 0.99.0                      | Generated named builders using the shared core.                                                               | Real Swagger 2/OpenAPI 3.0/3.1 generation, compilation and installed ESM consumer tests; breaking v3 migration.           |

See each [package guide](../README.md#packages) for its exact constructors and
unsupported features. Unsupported automatic generation has a factory/provider
escape hatch; an exhausted sampling budget is not proof of unsatisfiability.

## Execution and TypeScript

All packages are ESM. Native synchronous CommonJS exports and Node10 resolution
are not advertised; package diagnostics intentionally use the ESM-only profile.
The full workspace is verified with Node 22.18.0 on Linux, macOS and Windows,
and additionally Node 24 on Linux, using TypeScript 6.0.3. Runtime versions are pinned where reproducibility
requires them and recorded by the corresponding CI jobs.

The dependency-free core and portable consumer/adapter/Faker declarations are
additionally tested with TypeScript 5.8.3. Do not extrapolate that result to modern
TypeBox or vendor declarations requiring newer compiler features. Some native
vendor declarations require Web/DOM types; the core does not. `@mimlet/consumers`
needs only the Fetch globals, from either the DOM library or `@types/node`.

The packed core runs as native ESM in Chromium, Firefox and WebKit, and in Bun
1.4.2 and Deno 2.9.7. Deno's acceptance contract receives no filesystem, network,
environment or subprocess permissions. This is a core portability claim, not a
claim that Node filesystem/worker/codegen packages run in browsers or Deno.
The playground browser UI is exercised on all three browser engines against its
local Node server. Playwright engine versions come from the locked test fixture.

## Semantic boundaries

Input patches precede transformations and native validation. Validators may apply
their own transformations; the builder does not silently repair explicit overrides.
The pinned Zod Standard Schema entry can probe an async refinement synchronously
before running it asynchronously. For effectful refinements that must execute
once, the published `@mimlet/zod` package provides `fromZodAsync` and
`fromZodFactoryAsync`, which use native async parsing directly. Other Standard Schema integrations
can provide an explicit `safeParseAsync`-based Standard Schema wrapper. Calling
one standards entry is not a promise about a vendor's internal callback count.

TypeBox minimal creation is not random sampling; use a factory, Faker integration
or a suitable provider for realistic data. Root union output can differ from its
selected input branch because the original codec is retained. Native schemas and
callbacks are trusted application code and are not serialized into replay files.

Generic JSON generation explicitly rejects unsupported dynamic/recursive
references, anchors and unknown assertions rather than dropping them. Custom
vocabularies require paired versioned extension support. Patterns and opaque
callbacks can still require separately restricted execution. See [security](../SECURITY.md).

A seed reproduces a supported configuration and provider version, not arbitrary
future dependency releases. Named-stream isolation applies where a provider uses
those scopes, not to every field of a third-party generator. Fixture capture is
available when the actual value must survive dependency changes.

## Version ranges since alpha.2

Alpha.1 used exact peer pins. Alpha.2 widened Zod to `>=4.4.3 <=4.6.5` and
legacy TypeBox to `>=0.34.48 <=0.34.52`, and later trains keep both ranges.
Alpha.4 widens ArkType to `>=2.2.5 <=2.2.7` and Faker to `>=10.5.0 <=10.6.0`;
alpha.3 pinned them to 2.2.5 and 10.5.0. ArkType brings its own exact `@ark/*` and `arkregex`
dependencies, so each matrix entry pins that whole set by integrity.
`tests/vendor-versions.json` pins every currently published version in those
intervals by tarball integrity. `pnpm test:vendors` reuses the full native
conformance, negative-type and coverage suites for each version in isolated
installations, including a production dependency audit. Future versions require
a new reviewed matrix entry.

Modern TypeBox remains exactly `1.3.34`. Probing 1.3.30–1.3.33 found that a
property named `a/b~c` is reported as `/a/b~c` rather than the unambiguous JSON
Pointer `/a~1b~0c`. The existing path-preservation regression fails on those
versions; the adapter does not guess a repair.

Zod adapter metadata records the loaded Zod version. Generation identity comes from
the converted input schema and the JSON Schema provider, so a Zod upgrade that changes
the converted schema cannot reuse an older replay. Faker's replay identity names the
loaded Faker release from alpha.4. ArkType exposes no runtime
version; its generation identity comes from the converted input schema instead.
