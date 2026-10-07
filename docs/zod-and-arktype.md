# Zod and ArkType builders

<!-- github-only -->

[Read this guide with inline examples](https://jeffreynijs.github.io/mimlet/guide/zod-and-arktype.html),
or open the tested recipe source links below.
<!-- /github-only -->

The dedicated `@mimlet/zod` and `@mimlet/arktype` packages are published in
`0.1.0-beta.6` on npm's `latest` tag. Existing Standard Schema and Standard JSON
Schema entry points remain supported. Install the adapter you use, with its tested peer:

```sh
# Zod, including Zod Mini
npm install --save-dev @mimlet/zod@0.1.0-beta.6 zod@4.6.5

# ArkType
npm install --save-dev @mimlet/arktype@0.1.0-beta.6 arktype@2.2.7
```

## Zod: typed input, native output

<!-- recipe:zod -->

[View the tested native Zod recipe](../examples/recipes/zod.ts).

The encoded age is a string. Native validation produces a number. The original
schema keeps control over coercion, defaults, object stripping and codec behavior.
Zod Mini is supported through the same native Zod core API.

Keep the two build methods apart when a schema has a `.transform()` or `.pipe()`:
`.build()` returns the schema's input (`z.input<S>`) without running Zod, and
`.buildValidated()` returns its output (`z.output<S>`). For a generated API schema
piped into an application transformer, `.build()` is the API DTO and
`.buildValidated()` is the transformed domain object. Patches and setters always
take input values.

An error thrown inside a transform or refinement makes `.buildValidated()` throw a
`BuilderValidationError` whose `cause` is the original error and whose message names
the callback, for example `1 issue at (root); thrown by the Zod transform fromDto`. A
`ZodError` from a stricter parse of the whole DTO inside the transformer keeps its
paths, so the message names the field (`1 issue at source`). A parse of one value
has no path, and the issue stays at the root with Zod's message. When the schema has
a single callback at a fixed field, that field becomes the path. Report the problem
with `ctx.addIssue({ code: 'custom', path: ['source'], message })` instead to name the
field in every case. See [errors thrown inside transforms](../packages/zod/README.md#errors-thrown-inside-transforms).

For async refinements or codecs, choose `fromZodAsync` or
`fromZodFactoryAsync`. They go directly through native async parsing; the pinned
Standard Schema implementation's sync probe is not repeated. Their builders expose
async methods only. Ordinary async input factories with synchronous schemas can
also use `fromZodFactory`.

Use `zodAdapter(schema)` when you need direct decode/encode operations or access to
the generation engine. One-way transforms keep Zod's native encoding failure.
See the [Zod package contract](../packages/zod/README.md).

`fromZod()` does no conversion work when you create the builder. The first build
converts the schema and compiles its generator, and every builder of the same schema
object shares the result. A module that creates a builder for each generated schema
at load time therefore stays cheap, which matters in test runners that load modules
again for every spec file. Schemas with equal converted content also share the
compiled validator within a process, for example two transforms of one API schema.
Vitest's default isolation starts a new worker for each spec file, so each file still
compiles the schemas it builds; see
[start-up cost in test runners](../packages/zod/README.md#start-up-cost-in-test-runners).

Builders accept the schemas that Hey API's `zod` plugin generates. Empty responses
are emitted as `z.void()`; their builders return `undefined`. If the
`@hey-api/typescript` plugin uses `enums: 'typescript'`, transformers typed with the
generated DTO types do not accept the Zod output (`TS2345: '"draft"' is not
assignable to type 'Status'`), because the Zod schemas use string literals. Use
`enums: 'javascript'`, or type the transformer from the schema with
`z.output<typeof zSchema>`. See [generated Hey API schemas](../packages/zod/README.md#generated-hey-api-schemas).

## ArkType: preserve morphs and scopes

<!-- recipe:arktype -->

[View the tested native ArkType recipe](../examples/recipes/arktype.ts).

ArkType's original Type remains the validator. Its `allows()` input check does not
execute morphs; validated builds do. Scoped and recursive Types retain their input
and output types. Undeclared keys follow the schema's own ignore/reject/delete policy.

`fromArkTypeFactory` retains factory arguments and supports asynchronous input
production. It does not invent inverse morphs or a native asynchronous parser.
See the [ArkType package contract](../packages/arktype/README.md).

## Use factories for native values and domain constraints

Automatic generation is bounded sampling of converted input metadata. It can handle
the shared generator's supported profiles and constraints; it does not solve every
refinement. Native validation remains authoritative when a refinement cannot be
represented. Conversion and sampling failures stay visible.

A Zod input without a JSON form, such as `z.date()`, `z.bigint()`, `z.map()` or
`z.custom()`, makes the first build of `fromZod()` throw a `SchemaPreparationError`
(code `SCHEMA_PREPARATION_FAILED`). Its `schemaPath` points at that input in the
converted schema, for example `/properties/createdAt`, and the message suggests
`fromZodFactory`. `z.void()` and `z.undefined()` at the root are the exception: they
build `undefined`.

Factories do not require conversion, so schemas involving Date, bigint, custom
predicates or application-owned objects can retain their native behavior. Keep the
schema and supply meaningful input through `fromZodFactory`,
`fromZodFactoryAsync` or `fromArkTypeFactory`.

## Distinct values for identical schemas

A session-less build starts from seed 1, and generation draws from a stream chosen by
the converted schema. Zod's `brand()` only changes the TypeScript type, so
`fromZod(z.uuid().brand('LeadUuid'))` and `fromZod(z.uuid().brand('DealUuid'))`
return the same uuid, as do two object schemas with the same shape. Give such
builders a `name`, which works the same way for `fromArkType`:

```ts
const leads = fromZod(LeadUuid, { name: 'LeadUuid' });
const deals = fromZod(DealUuid, { name: 'DealUuid' });
```

Or pass one session to every build in a test, from `createTestSession()` in
`@mimlet/core`, so each build continues it. Patch factories and transforms always
receive that session, or the default one. Factory builders take a typed
`defaultSession` option, and their factory may then require the session:
`fromZodFactory(schema, (session: GenerationSession) => ..., { defaultSession })`.
See [sessions and replay](sessions-and-replay.md#omitted-sessions).

## Next: replay a generated fixture

The [session replay guide](sessions-and-replay.md) shows the complete
snapshot-before-build and restore flow, including a copyable core example.
For native Zod generation, `zodAdapter(schema, options).generation()` exposes the
prepared generator's `session(seed)` and `identity`. Pass that session to
`fromZod(schema, options).buildValidated(session)`; keep schema and options the same
for both. Restore with `restoreSession(snapshot, generator.identity)` from
`@mimlet/core`, and pass the restored session to the same builder.

For replay, preserve the generator identity and the application's schema/codec
version. The existing [scenario](correlated-scenarios.md),
[replay](sessions-and-replay.md) and [property-testing](../packages/fast-check/README.md)
contracts work with these builders.

The examples above are compiled and executed against isolated package tarballs by
`pnpm test:examples`; `pnpm test:optional` also runs native conformance, negative
type checks and coverage for both adapters.
