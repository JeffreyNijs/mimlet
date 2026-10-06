# Hey API migration to the shared runtime

This is the `3.0.0-beta.5` major-version migration, published on npm's `next`
channel. Existing v2 packages and the `latest` tag are unchanged. Newly generated
builders import `@mimlet/core`; install `@mimlet/core@0.1.0-beta.5` alongside
`hey-api-builders@3.0.0-beta.5` and regenerate clients together.

The plugin still discovers Hey API model/request/response factories, applies
existing naming settings, resolves symbol collisions, and exposes the same named
builder classes and with-property helpers. It no longer emits an independent
merge implementation. Every class delegates to the core class facade/runtime.
Factory options and generated model names remain unchanged.

## Behavioral changes

Object-union transitions require a complete `replace()` rather than a partial
patch of a discriminant. Record/non-record transitions also require explicit
replacement. Dates, maps and similar native values are never object-spread.
Lists have the core's default allocation budget of 10,000 values. Split very
large fixture collections into explicitly bounded batches or use a separately
configured core builder.

The familiar `with`, `transform`, constructor patches, `build` and `buildList`
remain available for ordinary object models. Generated methods now retain the
polymorphic subclass type. Core `withFactory`, `replaceFactory`, `omit`, async
transforms/builds and operation descriptions are also available. All patches run
before transforms. Async chains retain generated helpers but not sync build
capabilities in TypeScript.

`runtimeModule` overrides the import specifier for controlled packaging or a
self-contained runtime module produced from the canonical core. It is not a
switch back to the legacy implementation. No file is fetched or executed from
this configuration during emission.

## Verification

The original real-generator fixtures still compile and execute for Swagger 2,
OpenAPI 3.0, and OpenAPI 3.1. Additional generated declaration checks, compiled
with `exactOptionalPropertyTypes`, reject incorrect field types, an explicit
`undefined` for an optional property, incomplete union changes, and synchronous
calls after an async transition. The packed consumer acceptance test installs actual plugin and
core tarballs, generates a client, compiles it in NodeNext mode, and imports the
emitted ESM without the integration test's module loader.

Generation still needs TypeScript 6 as the `typescript` package, because Hey API
0.99.0 loads the TypeScript compiler API. A project on TypeScript 7 can install
TypeScript 6 beside it and compile the generated builders with TypeScript 7; the
packed consumer job tests that setup. See
[TypeScript 7 with Hey API](compatibility.md#typescript-7-with-hey-api).

Keep the generated-code diff in a migration PR and regenerate all clients when
upgrading the runtime/plugin together. These behavior changes must not be
silently released under the existing v2 version.
