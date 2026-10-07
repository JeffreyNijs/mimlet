# JSON Schema builders

Offline schema-to-fixture generation, with independent Ajv validation, reproducible
sessions, and the same immutable builder pipeline as the native adapters.

Install from npm's `latest` tag, which includes betas. Pin exact versions when you
need to reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/json-schema
```

```ts
import { jsonSchemaAdapter, fromJsonSchema } from '@mimlet/json-schema';

const schema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
  },
  required: ['id', 'name'],
  additionalProperties: false,
};
const provider = jsonSchemaAdapter(schema, { profile: 'random' });
const session = provider.session(42);
const users = fromJsonSchema(schema, { profile: 'random' });
const values = users.buildValidatedList(3, session);
```

Runtime-loaded JSON does not prove a TypeScript application type: raw builders
return `unknown`. `fromStandardJsonSchema(schema)` accepts an implementation of
both Standard Schema v1 and Standard JSON Schema v1, generates its **input**
representation, and retains the native input/output types. Native validation is
called once for each validated fixture, after overrides and transformations.
Opaque refinements can reject a fixture; they are not silently retried or repaired.

When you have a TypeScript type for a raw schema, state it with a cast. TypeScript
does not compare the type with the schema, but `buildValidated()` still validates
against the schema at runtime. `emitJsonSchemaBuilders` in `@mimlet/codegen` emits
the declarations from the schema instead.

```ts
import type { GenerationSession, SchemaBuilder } from '@mimlet/core';
interface User {
  id: number;
  name: string;
}
type UserBuilder = SchemaBuilder<User, User, [session?: GenerationSession]>;
const typedUsers = fromJsonSchema(schema) as UserBuilder;
const user = typedUsers.with({ name: 'Ada' }).buildValidated();
```

`standardJsonSchemaFields(schema, { dialect })` lists the top-level `properties` of a
Standard JSON Schema's input projection, converted with the same dialect as
`fromStandardJsonSchema()`. Pass it to `fluent()` from `@mimlet/core` for a `withX()`
setter per field, typed with the schema's input:
`fluent(fromStandardJsonSchema(schema), standardJsonSchemaFields(schema))`. Inputs
without top-level `properties` throw a `TypeError`. A raw schema has no typed input
to name setters after, so give a cast raw builder an explicit tuple such as
`fluent(typedUsers, ['id', 'name'])`. See
[named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field).

## Supported generation path

The pinned provider is `json-schema-faker@0.6.3`, independently checked by
`ajv@8.20.0` plus `ajv-formats@3.0.1`. Draft-07, 2019-09, and 2020-12 use separate Ajv
instances. Draft-07 tuples, dependencies, definitions, and reference-sibling
semantics are normalized only in the provider copy; validation retains draft-07 semantics, including ignored reference siblings.

Standard type constraints, compositions, conditionals, explicit references, and
collection/string/number constraints are accepted. Every returned candidate must
pass the original validator. This is bounded sampling, not a complete solver;
valid schemas can exhaust the sampling budget. The `$dynamicRef`/`$recursiveRef`
keywords, anchors, unknown vocabularies, extension keywords, and other unsupported
keywords fail preparation explicitly rather than being silently dropped. The provider-unsafe
`__proto__` schema-map key is also rejected explicitly; the schema-free core does
not have that provider restriction. Content metadata
is treated as annotations, not an encoding or content-validation guarantee.

Recursive schemas that use ordinary `$ref`, such as a tree node with a `children`
array of nodes, are supported. The default `minimal` profile leaves optional fields
out, so recursion stops at the first level; `random` varies the depth; `realistic`
fills optional fields except the ones that lead back into the recursion. Nesting is
capped by `maxValueDepth` (default 12, at most 64). A recursive field that is required
at every level has no finite value, so generation fails with `SCHEMA_GENERATION_FAILED`
after its attempts (default 20) instead of hanging; use a factory for it.

Profiles include `boundary` (valid candidates biased toward declared endpoints), `minimal` (required shape, not a proof of globally minimal values),
`random` (optional-field variation), `realistic` (plausible test values, below),
`defaults`, and `examples`. Defaults/examples
are candidate preferences, never validation guarantees; an invalid candidate can
fall back to ordinary sampling. Overrides are applied only after base generation
and never participate in automatic retry/repair.

### Realistic values

`minimal` is the default and its values are unchanged: optional fields are left out,
an unconstrained integer can be anywhere in the safe-integer range and a plain string
is random characters. `profile: 'realistic'` is an opt-in profile for values that read
like test data:

| Schema                                           | `realistic` value                                         |
| ------------------------------------------------ | --------------------------------------------------------- |
| Optional property                                | Included, unless it leads back into a `$ref` cycle        |
| Nullable field (`type`, `anyOf` or `oneOf` null) | A non-null value                                          |
| Array                                            | One to three items, when the schema allows it             |
| Number with no bounds, or bounds wider than 1000 | 1 to 100, kept inside the declared bounds                 |
| Number with bounds at most 1000 apart            | Anywhere within its bounds, as declared                   |
| Decimal number without `multipleOf`              | Rounded to two decimal places                             |
| String without `format`, `pattern` or `enum`     | One to three words, such as `Amber harbor`, within length |
| Value with `examples` (OpenAPI `example`)        | One of the examples                                       |

For example, `{ type: 'integer' }` gives 1 to 100, `minimum: 18` gives 18 to 100,
`minimum: 5000` gives 5000 to 5099 and `maximum: -5` gives -104 to -5. Formats such as
`email`, `uuid` and `date-time`, patterns, enums and constants are generated as in the
other profiles. A property that refers back to its own schema, directly or through other
references, is not added, so trees and two-way relations stay finite.

These are hints for the candidate copy only: every value is still checked against the
unmodified schema. The first half of the attempts uses the hints, and the first quarter
also prefers schema examples, so an invalid example is not repeated. The second half
samples like `minimal`. A schema that the hints cannot satisfy, such as a `oneOf` that
requires exactly one of two optional properties, still gets a valid value, without the
realistic changes.

The profile and the version of these rules are part of `identity.configuration`. A
replay recorded with another profile, or with a later version of the rules, is rejected
instead of silently producing different values. A custom `provider` receives
`profile: 'realistic'` and decides what it means. The Zod, Valibot and ArkType adapters,
`@mimlet/api` and the JSON targets of `@mimlet/codegen` accept the same option. For
values that depend on the field's meaning, such as names or email addresses without a
`format`, use `.with()`, a factory or `@mimlet/faker`.

Generated `format: date-time` values are UTC instants within a year of the session's
reference time, so they don't depend on the machine's time zone. Fields are generated
independently: use `.with()` or a factory when one date must follow another, such as
an end after a start.

Use `jsonSchemaAdapter` to prepare and compile once. `create(session)` supplies
fixtures; `standard` exposes the JSON validation contract; `check` and `issues`
inspect candidates. `identity` includes schema/reference/configuration identities
and exact provider versions. With no session, each call starts from seed 1.
Builders share that default across a session-less list, so `buildList(3)` equals
`buildList(3, adapter.session())` instead of repeating one value. The stream is chosen
by `identity`, so two builders over the same schema return the same session-less
values; a `name` option, as in `fromJsonSchema(schema, { name: 'orders' })`, draws
them from `adapter.session().scope('builder', name)` instead. Patch factories and
transforms always receive a session.
Caller-supplied sessions advance deterministically and preserve named isolation.
The entire schema has one stream; field-stability across schema changes is not
claimed. Snapshots contain generation state, not user callback implementations.

## Shared preparation

Preparing an adapter copies and checks the schema, compiles its Ajv validator and
computes the replay identity. Compiling is most of the cost of a first build, so a
process keeps prepared generators and reuses one for equal content:

- **Key.** The exact JSON text of the schema and of the `references` map, property
  order included, plus the dialect, profile, limits, `annotations`, `extensionIdentity`,
  `formatsIdentity` and provider id. Anything that differs prepares its own generator,
  so two reference maps or two profiles never mix.
- **Not shared.** Custom `keywords` and `formats` hold callbacks that the validator
  calls, so an adapter with either always prepares its own. Schema data with a
  negative zero is not shared either, because its JSON text reads `0`.
- **Validators.** Ajv instances are shared per dialect, limits, annotations and
  reference map, so the JSON Schema meta-schema, when it is needed (see
  [preparation cost](#preparation-cost)), is compiled once instead of once per schema.
  Ajv keeps every schema an instance compiled, so an instance is replaced after
  32 schemas. A schema that declares an `$id` gets an instance of its own.
- **Bound.** The 256 most recently used prepared generators are kept. One holds the
  compiled validator and copies of the schema, typically 40 to 100 KB for a generated
  API response schema, so the default keeps a few tens of MB at most.
- **Scope and versions.** The store is on `globalThis` under
  `Symbol.for('mimlet.generators.v1')`, with one store per package version, so two
  versions in one process never share entries. It survives a module that is
  evaluated again in the same realm, such as Vitest with `isolate: false` and
  `vi.resetModules()`, or a dev server reloading a mock module. A worker thread,
  child process, browser frame or `vm` context has its own `globalThis` and starts
  empty; Vitest's default isolation runs each spec file in a new worker.
- **Off switch.** `MIMLET_GENERATOR_CACHE=off` (or `0`) turns sharing off, and a number
  sets the limit; the variable is read when the store is first used.
  `configureGeneratorCache({ maxEntries })` does the same at runtime, also in a
  browser, and returns `{ maxEntries, entries }`; `clearGeneratorCache()` drops
  everything kept. With sharing off, every adapter prepares its own validator.

Generated values, sessions, replay identities and validation issues are the same with
sharing on or off.

## Preparation cost

A new process, such as a Vitest worker for each spec file, prepares every schema it
uses again. Two steps keep that short without changing any result:

- **Meta-schema check.** Ajv checks each schema against the JSON Schema meta-schema
  before compiling it, and compiling the meta-schema itself took several milliseconds
  in every new process. A quick check now accepts a schema when every keyword has a
  value of the kind the meta-schema requires, and then Ajv's check is skipped. A
  schema it cannot decide (an `$id`, anchors, an extension keyword, an unusual value)
  or that is invalid gets Ajv's full check, at the same point and with the same error
  (`SchemaPreparationError` with code `SCHEMA_PREPARATION_FAILED` and Ajv's
  `schema is invalid: ...` message as its `cause`). Adapters with custom `keywords` or
  `formats` always get the full check.
- **No code tidying.** Validators are compiled with Ajv's `code.optimize` pass turned
  off. That pass only tidies the generated code: the validator accepts and reports
  the same, runs as fast once warm, and compiling took about a third less time.

For five generated API response schemas in a new process, the first validated builds
went from about 62 ms to 42 ms on an Apple M5.

Compiled validators are not cached on disk. Such a cache could skip most of the
remaining compile time in a new worker, but it would run code read back from the
file system, and it needs a safe location, invalidation by content and version,
concurrent writers and a way to stay out of browsers. That is not done for now.

## References and trust boundary

`references` is an explicit URI-to-schema dictionary. No remote resolver, network
request, filesystem reader, or schema-derived executable configuration is installed.
The dictionary can hold more schemas than the root uses, such as a whole OpenAPI
component set: only the references the schema reaches, directly or through other
references, are compiled. A reference that cannot be prepared fails the adapter only
when the schema reaches it. Then `SchemaPreparationError.reference` names that
reference, the message ends with `in reference <uri>`, and `schemaPath` is relative to
the reference. A `$ref` that resolves to nothing fails with
`Unresolved reference <uri> at <schemaPath>`, where `schemaPath` points at the `$ref`
and `missingReference` holds the resolved URI. The replay fingerprint still covers
every supplied reference.
JSON data is copied before compilation and checked for cycles, accessors, symbols,
non-JSON values, depth, size, and allocation limits. Supplied schemas are snapshots;
mutating the original does not change an already prepared adapter. A schema property
whose value is `undefined` is left out, as `JSON.stringify` does. Any other non-JSON
value fails preparation with its location and kind, for example
`Expected JSON data, found a function at /default` or
`Expected a plain JSON record, found an instance of Date at /default`. Generated and
overridden values keep rejecting `undefined` properties.

Format extensions require paired pure synchronous `validate` and `generate`
callbacks, plus an explicit `formatsIdentity` so callers can version replay inputs.
They remain trusted executable code and may run repeatedly during generation.
There is no promise to interrupt arbitrary callbacks or pathological regexes in
this synchronous API. Use process isolation for hostile schema execution.

Limits bound preparation, attempts, native provider depth, output arrays/strings,
and final output size. They do not constitute an OS sandbox or an exact memory
bound inside a third-party provider. Exhaustion is not a proof of unsatisfiability.
No schema rules are widened to make a candidate pass. Public declarations do not
require DOM types even though the private provider's declarations reference them.

Individual package manifests are versioned with the coordinated release train; publication is a separate operation.

## Custom providers and negative cases

`provider: { id, generate(request) }` accepts a versioned synchronous generation
backend. It receives copied schema/reference data, the selected dialect/profile,
a scoped session, and the attempt index. Every candidate still passes the
original validator. Paired custom assertions use `keywords` and a versioned
`extensionIdentity`; explicit `annotations` cannot replace built-in assertions.

`adapter.negative(session, mutation, target)` creates a valid base, invokes the
mutation once, and reports the observed validation issues. Optional `keyword`,
`instancePath`, and `requireSingleIssue` targets are checked rather than assumed.
An accepted mutation is an error, not a negative fixture. Both positive and
negative paths retain JSON/output budgets and reject asynchronous callbacks.

The reconciliation retains the existing input-conversion metadata rules and
original-schema validation tests. Boundary hints narrow only a candidate copy;
failed candidates may fall back to ordinary bounded sampling, so the boundary
profile is not an exhaustive boundary-coverage certificate.
