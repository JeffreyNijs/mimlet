# Native Valibot generation

`fromValibot(schema, options)` adds automatic input generation to `valibot@1.5.0`
through the pinned `@valibot/to-json-schema@1.8.0` converter. The original native
parser retains its output transformations and is invoked once per validated build.
Conversion failures are not suppressed or downgraded to warnings.

Install from npm's `next` tag. Pin exact versions when you need to
reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/valibot@next valibot@1.5.0
```

```ts
import * as v from 'valibot';
import { fromValibot } from '@mimlet/valibot';
const age = v.pipe(v.string(), v.digits(), v.transform(Number));
const people = fromValibot(v.object({ age }));
const input = people.with({ age: '42' }).build();
const output = people.with({ age: '42' }).buildValidated();
```

`valibotAdapter(schema, options)` retains the original source and exposes a combined
Standard Schema/Standard JSON Schema handle. Its `generation()` is the JSON Schema
generator that session-less `fromValibot` builds use, with `session()` and `identity`
for replay, so `buildList(n)` equals `buildList(n, valibotAdapter(schema).generation().session())`.
Generation profiles, explicit references, budgets, and seeded sessions use the JSON
Schema package contract.
Native parsing may strip properties or normalize data as specified by the supplied
schema; this adapter does not add repair behavior of its own.

Automatic conversion currently accepts synchronous Valibot schema definitions.
Asynchronous schemas, Date/Map/Set, opaque refinements such as `v.check()`, and
actions with no JSON Schema equivalent such as `v.trim()`, `v.toLowerCase()`,
`v.brand()` and `v.readonly()` are fully usable with
`createSchemaBuilder(schema, factory)` in the core, including async factories and
validation, but do not acquire a JSON-generation capability merely by being valid
Standard Schema implementations. For Date/Map/Set, refinements and those actions,
`fromValibot` throws the converter's "cannot be converted" error instead of dropping
the rule. No inverse transform or shrinker is invented.

`valibotFields(schema)` lists an object schema's top-level entries. Pass it to
`fluent()` from `@mimlet/core` for a `withX()` setter per field, typed with the
schema's input. It reads only `schema.entries` (a `v.pipe()` that starts with an
object keeps them) and does not convert the schema, so it also works with
`createSchemaBuilder(valibotAdapter(schema).standard, factory)` and in a generic
helper such as `<S extends v.ObjectSchema<v.ObjectEntries, undefined>>(schema: S) =>
fluent(fromValibot(schema), valibotFields(schema))`. Non-object schemas throw a
`TypeError`; `looseObject()` and `objectWithRest()` inputs get no typed setters. See
[named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field).

`v.isoDateTime()` and `v.isoTime()` convert to JSON Schema `date-time` and `time`,
which require seconds and a UTC offset. Valibot's formats (`2026-01-02T03:04`,
`03:04`) allow neither, so generated values fail `buildValidated()`. Set those
fields with `.with()`, or build the object with `createSchemaBuilder(schema, factory)`.

Zod 4.4.3 and ArkType 2.2.5 also support `fromStandardJsonSchema`. Dedicated
[Zod and ArkType builders](https://jeffreynijs.github.io/mimlet/guide/zod-and-arktype.html) add native operation
handles, typed factory helpers and an explicit Zod async validation path.
The compatibility suite executes all three real libraries with built package
artifacts rather than relying only on structural mock schemas.

Native peer declarations use Web platform types. Their compatibility consumers
include DOM types (and Node types for ArkType); this does not add DOM dependencies
to the schema-free core. The pinned Zod Standard Schema implementation probes
async refinements synchronously before retrying them asynchronously. The generic
standards path calls its validator entry once but does not override that native
behavior. Use an explicit `safeParseAsync` validation wrapper for effectful Zod
refinements that must not be probed twice.
