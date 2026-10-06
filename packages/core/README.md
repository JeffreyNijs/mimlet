# Mimlet core

The heart of Mimlet: builders that make test data from a factory function or, through an adapter package, from your schema. Every change such as `.with()` returns a new builder and leaves the original untouched, so one test's variation never leaks into another's. Any Standard Schema validator (Zod, Valibot, ArkType and others) can check a built value and return its parsed output. Hey API, Faker, Zod and TypeBox are not dependencies of this package.

The package name is `@mimlet/core`. Releases, including betas, are published on npm's `latest` tag. See [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html) for current availability and installation. To build and pack from a checkout:

```sh
pnpm build:core
npm pack ./packages/core --ignore-scripts
```

The package emits ESM and TypeScript declarations. The core declarations are tested with TypeScript 5.8.3, 6.0.3 and 7.0.2; individual adapters can require newer compiler versions. Canonical Standard Typed, Standard Schema, and Standard JSON Schema v1 interfaces are vendored as type-only code with MIT attribution in `THIRD_PARTY_NOTICES.md`. There is no reduced private validation protocol.

## Existing factories

```ts
import { createBuilder } from '@mimlet/core';

interface User {
  id: string;
  role: 'reader' | 'admin';
  notes?: string[];
}

const users = createBuilder((id: string): User => ({ id, role: 'reader' }));
const admins = users.with({ role: 'admin' });
const ada = admins.build('user-1');
const baseline = users.build('user-2');
```

Arguments are forwarded unchanged, including optional, required, and multiple parameters. A factory may use Faker, existing generated code, deterministic data, or application logic. It is invoked once for every build, even when a replacement subsequently supplies the whole value.

Known or potentially asynchronous factory types return an async-only builder. JavaScript callers and erased types retain runtime guards rather than receiving a promise disguised as the fixture type.

```ts
const users = createBuilder(async (id: string) => ({ id }));
const user = await users.buildAsync('user-1');
// users.build('user-1') is a TypeScript error.
```

## Standard Schema input and output

```ts
import { z } from 'zod';
import { createSchemaBuilder } from '@mimlet/core';

const Age = z.object({ age: z.string() }).transform(({ age }) => ({
  age: Number(age),
}));
const people = createSchemaBuilder(Age, () => ({ age: '42' }));

const input = people.with({ age: '43' }).build();
const output = people.with({ age: '43' }).buildValidated();
// input.age: string; output.age: number
```

The pipeline is **factory input -> configured operations -> transforms -> optional validation -> schema output**. Patches and transforms are input-typed. Validation is invoked once per validated build, and its successful output is not validated as input again.

Ordinary builds do not validate. They allow schema-invalid but structurally typed fixtures, such as an email string that fails an email rule. A validator's own documented normalization or transformation still applies when validation is explicitly requested. The builder does not retry or silently repair overrides.

Synchronous validation methods detect a returned promise and direct callers to their asynchronous equivalents. Standard Schema itself does not statically guarantee whether a validator will return a promise for a particular input. Validator exceptions propagate unchanged. Validation failures raise `BuilderValidationError`, preserving native issues and paths; even an empty issues array is a failure.

Validation options never occupy factory argument positions:

```ts
const configured = people.usingValidation({
  libraryOptions: { customOption: true },
});
```

The options are passed to the selected validator, which decides their meaning. They can also be supplied as `createSchemaBuilder(schema, factory, { validationOptions })`. Configuration is shallow-copied; nested user configuration remains caller-owned.

## Operations, replacement, and optional fields

All methods return a new builder. All configured operations run in registration order before all transforms, even when fluent calls are interleaved. This preserves the original patch-before-transform contract.

For typing helpers, the package exports `BuilderPatch<T>` (what `with()` accepts and a `withFactory()` callback returns) and the `Builder`, `AsyncBuilder`, `SchemaBuilder` and `AsyncSchemaBuilder` interfaces as types. `BuilderFor<F>` and `SchemaBuilderFor<S, F>` are what `createBuilder(factory)` and `createSchemaBuilder(schema, factory)` return. When a lint rule requires explicit return types on generic helpers, the TypeBox, Zod and Effect adapters also export named builder types, such as `TypeBoxBuilder<S>` and `TypeBoxFactoryBuilder<S, F>`.

`with(patch)` shallow-merges plain records. Nested objects and arrays are replaced, not deep-merged. Atomic values such as Date, Map, Set, RegExp, and typed arrays are replaced without spreading away their prototypes. `replace(value)` explicitly replaces a complete value, including a whole plain record.

Object unions, including nullable objects, do not accept partial patches at the type level. Use complete replacement to select a new variant:

```ts
type Pet = { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean };
const pets = createBuilder((): Pet => ({ kind: 'cat', lives: 9 }));
const dog = pets.replace({ kind: 'dog', bark: true }).build();
// pets.with({ kind: 'dog' }) is rejected: it could omit required dog fields.
```

This generic path is deliberately conservative; native TypeBox adapters additionally offer `fromTypeBoxVariant()` for complete branch selection. There is no runtime introspection of erased TypeScript unions. JavaScript or unsafe casts can bypass compile-time rules; validated builds remain the source of runtime schema guarantees. Partial record patches onto null, undefined, scalars, or class instances are rejected at runtime. To build class instances, patch the record and create the instance last with `createInstanceBuilder()` (see [class instances](#class-instances-and-map)); `replace()` sets a complete value of any other kind.

`omit(...keys)` accepts optional keys only. It creates a new plain record without those own properties; it does not assign undefined or null. With `exactOptionalPropertyTypes`, those three states remain distinct. Required-field omission for negative tests needs an explicitly unsafe JavaScript/cast boundary, not an incorrect ordinary return type.

## Fresh nested values and derived values

Direct builders can opt into named setters with `fluent(builder, ['name'])`. To add a
setter for every field of an object schema, pass the adapter's field list instead, for
example `fluent(fromTypeBox(schema), typeBoxFields(schema))`; this also works in generic
helpers. `schemaFields(names)` creates such a list for adapter authors, and the
`FluentBuilder` and `FluentFieldsBuilder` types name the results. Nesting combines
setters: `fluent(fluent(builder, typeBoxFields(schema)), { withKey: 'id' })` keeps every
setter of the inner call and adds the outer ones. Repeating an inner setter for the same
field is allowed; an explicit name that the inner call uses for another field throws a
`TypeError`, and a field list skips it.
See [named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html) for input/output typing,
conflict rules and release availability. Generated ordinary-record facades already have
these methods, and `fluent()` keeps them too; an explicit name that matches one replaces it.

Builder configuration is immutable, but user data is not deep-cloned or frozen. A shared object supplied to `with()` or `replace()` stays shared in `build()` output. Validated builds return whatever the validator outputs, so identity depends on the adapter: the TypeBox adapters decode a deep clone, so `buildValidated()` output never shares objects with patches; Zod and Valibot rebuild the objects and arrays they parse; ArkType returns the input itself. Compare validated output by value, not identity. Use per-build factories when fixture isolation is needed:

```ts
const isolated = users.withFactory(() => ({ notes: [] }));
const first = isolated.build('first');
const second = isolated.build('second');
// first.notes and second.notes are different arrays.
```

`withFactory()` supplies a new patch; `replaceFactory()` supplies a new complete value. They receive the same argument tuple as the main factory and run once per build. These callbacks are synchronous; returning a promise is rejected. Use a main async factory or an explicit async transform for asynchronous work.

Transforms receive the current value and the factory arguments. They run in registration order and can derive correlated fields. `transform()` is synchronous. `transformAsync()` accepts asynchronous work and switches the resulting builder to async-only build capabilities. Validation is retained throughout every fluent operation.

## Class instances and map()

`map(mapper)` is a transform whose result may have another type. Patches keep applying to the input, builds return the mapped value, and transforms added later receive it. The builder type carries both: `Builder<T, Args, Output>`, where `Output` is `T` until a `map()`. Maps compose, run in order with the transforms, and appear as `'map'` in `describe().operations`. Schema builders have no `map()`, because their validator expects the unmapped input; a validator's own output is what `buildValidated()` returns.

```ts
const labels = createBuilder(() => ({ first: 'Ada', last: 'Lovelace' })).map(
  (name) => `${name.first} ${name.last}`
); // Builder<{ first: string; last: string }, [], string>
labels.with({ first: 'Grace' }).build(); // 'Grace Lovelace'
```

`createInstanceBuilder(Class, factory, config)` builds instances of a class, such as a TypeORM entity. The factory returns the class's plain record, `InstanceInput<InstanceType<Class>>`: its public data fields, without methods and without fields typed `never`, with readonly properties optional (TypeScript types a getter without a setter like a `readonly` field). Because the class comes first, the factory is checked against the record as TypeScript reads it, so it needs no annotation and literal fields keep their types. A key the class does not declare, such as a misspelled field, is a compile error in the factory too (`"isSystemAdmn is not a field of the class"`), although TypeScript does not report extra keys in returned object literals on its own. Patches apply to the record; each build creates a new instance:

```ts
const users = fluent(
  createInstanceBuilder(User, () => ({
    uuid: randomUUID(),
    email: `${randomUUID()}@example.com`,
    firstName: 'John',
    lastName: 'Doe',
    deletedAt: null,
  })),
  ['firstName', 'lastName']
);
users.withFirstName('Ada').build(); // a User; user.fullName is computed by the class
```

- **Construction.** `new Class()` runs without arguments, as TypeORM and class-transformer create entities, so field initializers and `#private` fields exist. `{ construct: 'prototype' }` uses `Object.create(Class.prototype)` and runs no constructor code; the types require it for a class whose constructor takes arguments.
- **Copying.** Each own enumerable field of the record is defined on the instance, or assigned through the class's setter. A value for a getter without a setter throws (`fullName is computed by User ...`). Copying is shallow: build related entities with their own builders. Unknown keys are checked at compile time only: a `declare` field, an uninitialized field compiled with `useDefineForClassFields: false`, or any field with `construct: 'prototype'` has no own property on a new instance, so the runtime cannot tell it from a misspelling.
- **Transforms after the mapping** receive the instance and must return an instance of the class (for example by changing it with `Object.assign`); a spread copy, which would silently be a plain object, throws. A later `map()` may change the type again.
- **Everything else stays.** Factory arguments, default sessions (also with a required session parameter), builder names, list tuples, async factories and `fluent()` setters work as for any builder. `map()` on a `fluent()` builder keeps its setters, in the runtime and in the types.

`intoClass(Class, options)` is the mapper itself, for `createBuilder(factory).map(intoClass(Class))`. `InstanceBuilder<typeof Class, Args>` names the builder type. See [entities and class instances](https://jeffreynijs.github.io/mimlet/guide/class-instances.html).

## Lists and limits

Synchronous builders expose `build`, `buildList`, `buildAsync`, and `buildListAsync`. Schema builders add `buildValidated`, `buildValidatedList`, `buildValidatedAsync`, and `buildValidatedListAsync`. Async-only builders expose only the async variants in their types.

Lists execute sequentially, preserving factory and random-state order. A literal count returns a tuple, so `const [first, second] = users.buildList(2)` types both items under `noUncheckedIndexedAccess`; a count typed as `number`, or above 64, returns an array. Counts must be non-negative safe integers within `maxListSize`, which defaults to 10,000. Checks occur before any generation or validation. A zero count does no work. Configure another budget explicitly:

```ts
const bounded = createBuilder(() => ({ id: 1 }), { maxListSize: 100 });
```

This budget limits list allocation, not arbitrary factory runtime, recursive schema processing, or total object size. It is not a sandbox.

### Default sessions

A factory whose first parameter takes a `GenerationSession` can declare the session used when a call omits it:

```ts
import { createBuilder, createSession, type GenerationSession } from '@mimlet/core';

const session = () =>
  createSession({ fingerprint: 'users/v1', provider: 'application-fixtures@1', seed: 1 });
const users = createBuilder(
  (execution: GenerationSession) => ({ age: execution.integer(18, 80) }),
  {
    defaultSession: session,
  }
);
const people = users.buildList(3); // equals users.buildList(3, session())
const older = users.withFactory((execution) => ({ age: execution.integer(60, 90) }));
```

Each build, validated build or list call that omits the leading session (or passes `undefined`) calls `defaultSession` once and passes the result to the factory, patch factories and transforms. List items therefore continue one session instead of restarting it, while repeated session-less calls stay deterministic. An explicit session is never replaced, and an empty list creates no session. The option is type-checked: the factory's other parameters must be optional, and a factory without a leading session parameter cannot declare it. With a default, the factory may declare its session as required, and patch factories and transforms are typed as always receiving one. Adapters with optional sessions use their own seed-1 `session()` as this default; see [Sessions and replay](https://jeffreynijs.github.io/mimlet/guide/sessions-and-replay.html#omitted-sessions).

The `name` option names a builder. `describe()` reports it, and a builder with a default session draws its session-less builds from `defaultSession().scope('builder', name)`, so two builders with different names produce different values even when their recipes are identical. A session passed to a build is used unchanged.

`createTestSession(seed = 1)` creates a session with a fixed generic identity (`testSessionIdentity`) for sharing across the builds of a test: consecutive builds continue it instead of repeating the first value. A session's values depend only on its seed and scope path; the fingerprint, provider and configuration are checked by `restoreSession()` and do not change the values.

## Scenarios

`createScenario()` builds related values as an immutable graph of nodes, each declaring the nodes it depends on. `override(name, factory)` replaces a node, `trait(name, replacements)` replaces several under a name, and `patch(name, patcher)` changes the value a node built while keeping its factory, so a variant does not repeat the node's derivation:

```ts
const lost = crm.patch('deal', (deal) => ({ ...deal, status: 'lost' }));
lost.build().summary.status; // 'lost': dependent nodes see the patched value
```

A patcher receives `(value, dependencies, session)` and returns a value of the node's type. Patches run in order after the node's factory, override or trait; a later override or trait replaces the node and its patches. See [correlated scenarios](https://jeffreynijs.github.io/mimlet/guide/correlated-scenarios.html).

## Inspection and adapters

`describe()` returns frozen operation names, the list budget, whether validation is attached and the builder's `name` if it has one. It deliberately excludes fixture values and callbacks. It is a small diagnostic surface. Schema inspection belongs to the adapter SDK; replay state is exposed separately by generation sessions.

Native TypeBox packages are available in this repository:

- `@mimlet/typebox` for `typebox`.
- `@mimlet/typebox-legacy` for `@sinclair/typebox`.

Their `fromTypeBox()` entry points can create native defaults without a handwritten factory, retain encoded/decoded types, and validate using native operations. Their READMEs document the precise version targets and generation limitations.

The Hey API emitter and standalone generated classes now use this runtime. Sessions, capture, scenarios, generation providers and property testing are implemented in the core or optional packages. Tested recipes show builders and scenarios [served from MSW handlers](https://jeffreynijs.github.io/mimlet/guide/mock-service-worker.html) and [seeded into a database](https://jeffreynijs.github.io/mimlet/guide/database-seeding.html). The root README and compatibility guide distinguish the packages and tested capabilities; publication and downstream production migration remain separate operations.

## Verification

Run `pnpm test:core` for compilation, negative type tests, runtime tests, and core-specific coverage thresholds. `pnpm validate` additionally runs formatting, lint, the real Zod and Hey API integration suites, TypeBox tarball consumer checks, and package checks.

### Validation diagnostics

`BuilderValidationError` has the stable code `VALIDATION_FAILED`. Its message names
the issue count and the first three distinct failing paths, so test-runner output
shows which fields were rejected:

```text
BuilderValidationError: Schema validation failed: 2 issues at owner.email, items[0].price
```

The same message appears when the error is the `cause` of a `BuilderGenerationError`,
for example when native TypeBox creation produces an invalid default. Long keys and
deep paths are shortened, so the message stays under a few hundred characters.
`(root)` stands for an empty path.

Native issue messages can repeat the rejected value (Valibot and ArkType do this for
most checks, and custom refinements can say anything), so they are not copied into
the error message, stack or enumerable fields. Paths contain schema keys and array
indexes, but a key of a data-keyed record or an unexpected property name comes from
the fixture itself and can appear in the message.

The original issue objects remain available through the non-enumerable
`error.issues` property. To print them, including native messages, call
`formatValidationIssues()` deliberately, for example in a test helper:

```ts
import { BuilderValidationError, formatValidationIssues } from '@mimlet/core';

try {
  users.with({ email: 'not-an-email' }).buildValidated();
} catch (error) {
  if (error instanceof BuilderValidationError) {
    console.log(formatValidationIssues(error, { messages: true, limit: 5 }));
    // email: Invalid email address
  }
  throw error;
}
```

It accepts the error or its `issues` array, lists up to `limit` issues (default 10)
one per line, and includes messages only with `messages: true`. Exceptions thrown
directly by trusted factories or validator callbacks retain their original behavior.

An adapter that turns a thrown error into a validation failure can say where it came
from: `new BuilderValidationError(issues, { cause, detail })` appends the detail after a
semicolon, for example
`Schema validation failed: 1 issue at (root); thrown by the Zod transform fromDto`.
The detail is written from schema structure such as callback names, never from the
rejected value, and is cut at 200 characters.
