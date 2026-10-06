# Mimlet's Zod adapter

Introduced in the coordinated toolkit `0.1.0-alpha.1` train.

Native builders for **Zod 4**, including Zod Mini. The peer range accepts Zod
`>=4.3.0 <5`; each release from 4.3.0 through 4.6.5 is tested. Input and output types come
from the original schema. Automatic generation uses its input JSON Schema;
validation, transforms, defaults and codecs remain native Zod operations.
The dependency-free core remains separate.

See the [executable Zod and ArkType guide](https://jeffreynijs.github.io/mimlet/guide/zod-and-arktype.html) for tested
recipes and the [compatibility matrix](https://jeffreynijs.github.io/mimlet/guide/compatibility.html) for version bounds.

## Install

Releases, including betas, are published on npm's `latest` tag. Pin exact versions
when you need to reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/zod zod@4.6.5
```

Zod 4.6.5 is the newest tested version. The supported range is `>=4.3.0 <5`, so a
newer Zod 4 release installs; `mimlet doctor` reports it as `PEER_VERSION_UNTESTED`
until it is tested. Newer versions usually work; pin `zod@4.6.5` when you need a
tested setup.

## Builders

| Entry point                                     | Contract                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fromZod(schema, options)`                      | Synchronous input generation and native synchronous validation.                                                                 |
| `fromZodAsync(schema, options)`                 | Async-only builder; validation goes directly through `safeParseAsync`.                                                          |
| `fromZodFactory(schema, factory, options)`      | Caller-provided input; factory tuples and known async capabilities are retained. Validation uses the synchronous native parser. |
| `fromZodFactoryAsync(schema, factory, options)` | Async-only builder with native async validation; accepts sync or async input factories.                                         |

Use an explicit async entry point for schemas with async refinements or codecs.
Calling an async build method on a synchronous adapter does not select a different
native parsing mode. The dedicated async path avoids the pinned Zod Standard
entry's sync probe/retry, so a callback runs once per validated build.

All ordinary Mimlet patches, replacement, list budgets, cloning and transforms
remain available. Switch object-union variants with a complete `.replace()` value.

## `build()` returns input, `buildValidated()` returns output

A Zod schema has an input type (`z.input<S>`) and an output type (`z.output<S>`).
They differ as soon as the schema has a `.transform()`, `.pipe()`, codec, coercion
or default. The two build methods return different ones:

| Method                                       | Returns                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.build()`, `.buildList()`                   | The input: the generated value with your patches. Zod does not run.                       |
| `.buildValidated()`, `.buildValidatedList()` | The output: the input parsed by Zod, with transforms, pipes, defaults and codecs applied. |

So for a generated API schema piped into an application transformer, `.build()` is
the API response as it arrives over the wire, and `.buildValidated()` is the domain
object your code works with. Patches and setters such as `.with()` and `withX()`
always take input values. The async methods behave the same way:

```ts
const Lead = zLeadResponse.transform(LeadTransformer.fromDto);
const leads = fromZod(Lead);

leads.build(); // z.input<typeof Lead>: the API DTO, untransformed
leads.buildValidated(); // z.output<typeof Lead>: what LeadTransformer.fromDto returns
```

## Errors thrown inside transforms

Zod lets an error thrown by a `.transform()`, `.refine()` or other callback escape the
parse with no path. The validated build methods report it as a
`BuilderValidationError` with the original error as its `cause`. A thrown `ZodError`
(for example from `.parse()` inside the transform) keeps its issues, with paths
relative to that inner parse; any other error becomes one issue at the root. Zod's
own async error, thrown when a synchronous build meets an async refinement, still
passes through unchanged.

To have the error name the field, report it through Zod instead of throwing. Issues
added with `ctx.addIssue()` keep their path:

```ts
const Lead = zLeadIndexResponse.transform((dto, ctx) => {
  if (dto.source !== 'teamleader') {
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'Unsupported lead source' });
    return z.NEVER;
  }
  return LeadTransformer.fromDto(dto);
});
// BuilderValidationError: Schema validation failed: 1 issue at source
fluent(fromZod(Lead), zodFields(Lead)).withSource('hubspot').buildValidated();
```

## Sessions and names

A session-less `fromZod()` or `fromZodAsync()` build starts from the generator's seed-1
session, and generation draws from a stream chosen by the converted input schema.
`brand()` only changes the TypeScript type, so two builders over `z.uuid().brand('A')`
and `z.uuid().brand('B')`, or over two object schemas with the same shape, return the
same values. Separate them with a name, or share one session across a test:

```ts
import { createTestSession } from '@mimlet/core';

const leads = fromZod(LeadUuid, { name: 'LeadUuid' });
const deals = fromZod(DealUuid, { name: 'DealUuid' });
leads.build() !== deals.build(); // true

const session = createTestSession();
fromZod(LeadUuid).build(session) !== fromZod(DealUuid).build(session); // true
```

Patch factories and transforms always receive a session, so
`fromZod(User).withFactory((session) => ({ age: session.integer(18, 90) }))` needs no
`session?.`. The factory entry points take a typed `defaultSession` option; with it,
the factory may declare its session as required:

```ts
const rows = fromZodFactory(
  Row,
  (session: GenerationSession) => ({ uuid: zodAdapter(z.uuid()).create(session) }),
  { defaultSession: () => createTestSession() }
);
const [first, second] = rows.buildValidatedList(2); // different uuids
```

A literal list count returns a tuple, so both items are typed without `| undefined`.
See [sessions and replay](https://jeffreynijs.github.io/mimlet/guide/sessions-and-replay.html#omitted-sessions).

## Generic helpers

A helper's return type can stay inferred. When a lint rule such as
`@typescript-eslint/explicit-function-return-type` requires one, name the builder:
`fromZod(schema)` returns `ZodBuilder<S>` and `fromZodFactory(schema, factory)`
returns `ZodFactoryBuilder<S, F>`, where `F` is the factory's type, or
`ZodFactoryBuilder<S, F, true>` with a `defaultSession`. `fromZodAsync()` and
`fromZodFactoryAsync()` return `AsyncSchemaBuilder<z.input<S>, z.output<S>, Args>`
from `@mimlet/core`, with the factory's parameters as `Args`; for `fromZodAsync()`
they are `[session?: GenerationSession]`, followed by `[session: GenerationSession]`
for what callbacks receive. Each type is exactly what its function returns, also for a
schema type parameter:

```ts
import type { BuilderPatch } from '@mimlet/core';
import { z } from 'zod';
import { fromZod, fromZodFactory } from '@mimlet/zod';
import type { ZodBuilder, ZodFactoryBuilder } from '@mimlet/zod';

function rows<S extends z.ZodObject>(
  schema: S,
  defaults: () => BuilderPatch<z.input<S>>
): ZodBuilder<S> {
  return fromZod(schema).withFactory(defaults);
}

function dtos<S extends z.ZodType>(
  schema: S,
  create: () => z.input<S>
): ZodFactoryBuilder<S, () => z.input<S>> {
  return fromZodFactory(schema, create);
}
dtos(User, () => ({ age: '42' })).buildValidated();
```

While `S` is unresolved, TypeScript cannot tell whether a factory typed
`() => z.input<S>` returns a promise, so a factory builder gets its sync or async
methods where the helper is called. Call `.with()` and `.withFactory()` on the
helper's result rather than inside the helper; `fluent()` works in both places.

## Named setters for every field

`zodFields(schema)` lists an object schema's top-level input keys. Pass it to
`fluent()` from `@mimlet/core` for a `withX()` setter per field, typed with the
schema's input. It follows `.transform()` and other pipes to the object that
receives the input, reads only the shape's keys and does not convert the schema, so
it also works with the factory and async entry points:

```ts
import { fluent } from '@mimlet/core';
import { z } from 'zod';
import { fromZod, zodFields } from '@mimlet/zod';

function rows<S extends z.ZodObject>(schema: S) {
  return fluent(fromZod(schema), zodFields(schema));
}
rows(User).withAge('42').buildValidated();
```

Non-object schemas such as unions throw a `TypeError`. `looseObject()` and
`catchall()` inputs have an index signature and get no typed setters. See
[named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field)
for the names that are skipped.

## Native operations and generation

`zodAdapter(schema, options)` retains `source` and exposes `standard`,
`standardAsync`, `decode`, `decodeAsync`, `encode` and `encodeAsync`. Encoding
delegates to Zod: codecs can reverse a value, while one-way transforms throw the
native encoding error. No inverse or shrinker is synthesized. Native parse options
can be supplied through `parseOptions`; validation failures retain Zod issue paths
inside the core's `BuilderValidationError`.

`generation()` prepares and caches the JSON Schema generator on demand. It exposes
the existing profiles, budgets, references, versioned providers and session/replay
identity. `create(session?)` generates schema input.

Creating an automatic builder does no conversion work: `fromZod()` and
`fromZodAsync()` check only the dialect. The first build converts the schema to its
input JSON Schema and compiles the generator. That generator is cached per schema
object and generation options, so every adapter and builder of the same schema
shares it; Hey API's per-operation aliases of a component schema are the same object.
Options that only configure the builder (`maxListSize`, `cloneInput`,
`validationOptions`, `parseOptions`) do not prevent sharing; options holding
functions or schemas (`provider`, `keywords`, `formats`, `references`) give the
builder its own generator. A module that creates many builders at load time stays
cheap, and you pay for conversion only for the schemas you build. Values, sessions
and replay identities are the same as when generation was prepared up front.

Conversion supports Draft 7 and Draft 2020-12. It throws for unrepresentable native
values rather than converting them to an unconstrained schema. Because conversion
waits for the first build, so does that error. It is a `SchemaPreparationError`
(code `SCHEMA_PREPARATION_FAILED`) whose `schemaPath` points at the input in the
converted schema, with Zod's error as its `cause`:

```text
SchemaPreparationError: Date cannot be represented in JSON Schema; use fromZodFactory(schema, factory) to supply this input at /properties/createdAt
```

Date, Map, Set, bigint, symbol, function, NaN, custom predicates and application data
can use factories without requiring JSON conversion. For a single field you can also
describe the wire format instead, for example `z.iso.datetime()` rather than `z.date()`.
Opaque refinements can reject generated candidates when native validation runs;
bounded generation is not a solver for arbitrary callbacks.

`z.void()`, `z.undefined()` and `z.literal(undefined)` accept only `undefined`, so
their builders return `undefined` without a generator. Hey API emits `z.void()` for
empty responses such as `204 No Content`. Nested inside an object they still need a
factory, since JSON has no `undefined` value.

The generation identity covers the converted input and generator configuration.
Keep application schema/codec versions in your replay identity when output depends
on opaque functions. Native conversion and callbacks are trusted application code;
generation budgets do not sandbox them. DOM types are needed by Zod's declarations.

## Generated Hey API schemas

Builders work directly on the Zod schemas that `@hey-api/openapi-ts` generates with
its `zod` plugin, including the `z.void()` schemas of empty responses.

With `enums: 'typescript'`, the `@hey-api/typescript` plugin emits TypeScript enums
for the DTO types, while the `zod` plugin emits `z.enum([...])` string literals. A
string literal is not assignable to a TypeScript enum type, so a transformer typed
with the generated DTO type fails to type-check:

```ts
// error TS2345: ... Type '"draft"' is not assignable to type 'LeadStatus'.
zLeadDealResponse.transform(LeadDealTransformer.fromDto);
```

This is an interaction between the two Hey API plugins; Mimlet is not involved. Use
`enums: 'javascript'`: it emits a `const` object for the values (`LeadStatus.DRAFT`
still works) and a string literal union type, which matches the Zod output:

```ts
// openapi-ts.config.ts
export default {
  input: './openapi.json',
  output: './src/client',
  plugins: [{ name: '@hey-api/typescript', enums: 'javascript' }, 'zod'],
};
```

Alternatively, type the transformer's parameter from the schema,
`(dto: z.output<typeof zLeadDealResponse>) => ...`, which works with any enum setting.
