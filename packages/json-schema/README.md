# JSON Schema builders

Offline schema-to-fixture generation, with independent Ajv validation, reproducible
sessions, and the same immutable builder pipeline as the native adapters.

Install from npm's `next` tag. Pin exact versions when you need to
reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/json-schema@next
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
out, so recursion stops at the first level; `random` varies the depth. Nesting is
capped by `maxValueDepth` (default 12, at most 64). A recursive field that is required
at every level has no finite value, so generation fails with `SCHEMA_GENERATION_FAILED`
after its attempts (default 20) instead of hanging; use a factory for it.

Profiles include `boundary` (valid candidates biased toward declared endpoints), `minimal` (required shape, not a proof of globally minimal values),
`random` (optional-field variation), `defaults`, and `examples`. Defaults/examples
are candidate preferences, never validation guarantees; an invalid candidate can
fall back to ordinary sampling. Overrides are applied only after base generation
and never participate in automatic retry/repair.

Generated `format: date-time` values are UTC instants within a year of the session's
reference time, so they don't depend on the machine's time zone. Fields are generated
independently: use `.with()` or a factory when one date must follow another, such as
an end after a start.

Use `jsonSchemaAdapter` to prepare and compile once. `create(session)` supplies
fixtures; `standard` exposes the JSON validation contract; `check` and `issues`
inspect candidates. `identity` includes schema/reference/configuration identities
and exact provider versions. With no session, each call starts from seed 1.
Builders share that default across a session-less list, so `buildList(3)` equals
`buildList(3, adapter.session())` instead of repeating one value.
Caller-supplied sessions advance deterministically and preserve named isolation.
The entire schema has one stream; field-stability across schema changes is not
claimed. Snapshots contain generation state, not user callback implementations.

## References and trust boundary

`references` is an explicit URI-to-schema dictionary. No remote resolver, network
request, filesystem reader, or schema-derived executable configuration is installed.
JSON data is copied before compilation and checked for cycles, accessors, symbols,
non-JSON values, depth, size, and allocation limits. Supplied schemas are snapshots;
mutating the original does not change an already prepared adapter.

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
