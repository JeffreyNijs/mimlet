# Compatibility contract

This describes the published `0.1.0-beta.2` train and its tested source contracts. A supported interface, a native parser,
an automatic generator and a shrinker are different capabilities. Native package
versions below are the tested versions; each adapter's peer range, its supported
range, can be wider (see [supported and tested versions](#supported-and-tested-versions)).
Fixture manifests, lockfiles and `tests/vendor-versions.json` are the
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
| Effect               | 4.0.0–4.0.1 (3.22.2 through alpha.3)   | Native decoded arbitrary re-encoded as input; sync/async factory escape hatches.                              | Native input/output arbitraries, codecs and Effect 4's own arbitrary engine and shrinking (fast-check 3 through alpha.3). |
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

## Supported and tested versions

Each native adapter has two ranges for its library:

- The **supported range** is the adapter's `peerDependencies` entry. It starts at the
  oldest tested version and runs up to the next release that may break the library:
  the next major from 1.0, or the next minor for a 0.x library. npm accepts any
  version in it, so a compatible upstream patch or minor release does not make
  `npm install` fail with `ERESOLVE` before Mimlet publishes again.
- The **tested range** is the set of versions that `tests/vendor-versions.json`
  installs one by one and runs the adapter's full conformance suite against. Each
  adapter publishes it in its `package.json` as `mimlet.testedPeers`.

| Adapter                  | Library             | Supported (peer)  | Tested                |
| ------------------------ | ------------------- | ----------------- | --------------------- |
| `@mimlet/zod`            | `zod`               | `>=4.4.3 <5`      | `>=4.4.3 <=4.6.5`     |
| `@mimlet/valibot`        | `valibot`           | `>=1.5.0 <2`      | `1.5.0`               |
| `@mimlet/arktype`        | `arktype`           | `>=2.2.5 <3`      | `>=2.2.5 <=2.2.7`     |
| `@mimlet/effect`         | `effect`            | `>=4.0.0 <5`      | `>=4.0.0 <=4.0.1`     |
| `@mimlet/typebox`        | `typebox`           | `>=1.3.34 <2`     | `1.3.34`              |
| `@mimlet/typebox-legacy` | `@sinclair/typebox` | `>=0.34.48 <0.35` | `>=0.34.48 <=0.34.52` |
| `@mimlet/faker`          | `@faker-js/faker`   | `>=10.5.0 <11`    | `>=10.5.0 <=10.6.0`   |
| `@mimlet/fast-check`     | `fast-check`        | `>=4.10.2 <5`     | `4.10.2`              |

These ranges apply from the train after `0.1.0-beta.2`. The published
`0.1.0-beta.2` packages still declare their tested range as the peer range (Effect,
Valibot, TypeBox and fast-check exactly), so a newer library release makes their
installation fail until the next train is published.

`pnpm check:workspace`, which `pnpm install` also runs, fails when a peer range, a
`mimlet.testedPeers` entry or an adapter's pinned development version disagrees
with `tests/vendor-versions.json`. `pnpm test:vendors` (one CI job per adapter,
"Native version range") installs each recorded version by tarball integrity in an
isolated project and reuses the full native conformance, negative-type and
coverage suites, including a production dependency audit. ArkType brings its own
exact `@ark/*` and `arkregex` dependencies, and fast-check its `pure-rand`, so each
matrix entry pins that whole set by integrity. A newer release joins the tested
range only through a reviewed matrix entry.

`mimlet doctor` reports a library outside the supported range as the error
`PEER_VERSION_UNSUPPORTED`, and one inside it but outside the tested range as the
warning `PEER_VERSION_UNTESTED`; a warning does not make the report fail. Newer
versions usually work. If one does not, report it in the
[issue tracker](https://github.com/JeffreyNijs/mimlet/issues) and pin the library to
its tested range in the meantime. See [CLI diagnostics](cli-diagnostics.md).

A weekly canary workflow (`Native library canary`, Mondays and on demand) installs
the newest published release of each library from the registry, without integrity
pins, and runs the same adapter suites (`node scripts/test-vendor-versions.mjs <adapter> --latest`).
It also fails when the newest release is outside the supported range, which is the
signal that a new major needs a reviewed adapter release. It is an early warning,
not a release gate, and it never changes the tested range.

### History and per-library notes

Alpha.1 used exact peer pins. Alpha.2 widened Zod to `>=4.4.3 <=4.6.5` and legacy
TypeBox to `>=0.34.48 <=0.34.52`. Alpha.4 widened ArkType to `>=2.2.5 <=2.2.7` and
Faker to `>=10.5.0 <=10.6.0`; alpha.3 pinned them to 2.2.5 and 10.5.0. Until
`0.1.0-beta.2`, the peer range was the tested range.

Modern TypeBox starts at `1.3.34`. Probing 1.3.30–1.3.33 found that a property
named `a/b~c` is reported as `/a/b~c` rather than the unambiguous JSON Pointer
`/a~1b~0c`. The existing path-preservation regression fails on those versions; the
adapter does not guess a repair. TypeBox exposes no runtime version, so the creation
identity names the tested `1.3.34` creation behavior.

Effect marks its `effect/Arbitrary` module unstable and does not promise identical
samples across releases. The adapter's metadata names the loaded Effect release,
and a release that removes the Arbitrary API it uses makes the adapter throw a
`TypeError` when it loads. Include the Effect version in your session provider.

Zod adapter metadata records the loaded Zod version. Generation identity comes from
the converted input schema and the JSON Schema provider, so a Zod upgrade that changes
the converted schema cannot reuse an older replay. Faker's replay identity names the
loaded Faker release from alpha.4. ArkType and Valibot expose no runtime version;
their generation identity comes from the converted input schema instead.
