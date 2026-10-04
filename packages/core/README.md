# Mimlet core

The heart of Mimlet: builders that make test data from a factory function or, through an adapter package, from your schema. Every change such as `.with()` returns a new builder and leaves the original untouched, so one test's variation never leaks into another's. Any Standard Schema validator (Zod, Valibot, ArkType and others) can check a built value and return its parsed output. Hey API, Faker, Zod and TypeBox are not dependencies of this package.

The package name is `@mimlet/core`. Prereleases use npm's `next` tag. See [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html) for current availability and installation. To build and pack from a checkout:

```sh
pnpm build:core
npm pack ./packages/core --ignore-scripts
```

The package emits ESM and TypeScript declarations. The core declarations are tested with TypeScript 5.8.3 and 6.0.3; individual adapters can require newer compiler versions. Canonical Standard Typed, Standard Schema, and Standard JSON Schema v1 interfaces are vendored as type-only code with MIT attribution in `THIRD_PARTY_NOTICES.md`. There is no reduced private validation protocol.

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

For typing helpers, the package exports `BuilderPatch<T>` (what `with()` accepts and a `withFactory()` callback returns) and the `Builder`, `AsyncBuilder`, `SchemaBuilder` and `AsyncSchemaBuilder` interfaces as types.

`with(patch)` shallow-merges plain records. Nested objects and arrays are replaced, not deep-merged. Atomic values such as Date, Map, Set, RegExp, and typed arrays are replaced without spreading away their prototypes. `replace(value)` explicitly replaces a complete value, including a whole plain record.

Object unions, including nullable objects, do not accept partial patches at the type level. Use complete replacement to select a new variant:

```ts
type Pet = { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean };
const pets = createBuilder((): Pet => ({ kind: 'cat', lives: 9 }));
const dog = pets.replace({ kind: 'dog', bark: true }).build();
// pets.with({ kind: 'dog' }) is rejected: it could omit required dog fields.
```

This generic path is deliberately conservative; native TypeBox adapters additionally offer `fromTypeBoxVariant()` for complete branch selection. There is no runtime introspection of erased TypeScript unions. JavaScript or unsafe casts can bypass compile-time rules; validated builds remain the source of runtime schema guarantees. Partial record patches onto null, undefined, scalars, or class instances are rejected at runtime. Use `replace()` for custom classes.

`omit(...keys)` accepts optional keys only. It creates a new plain record without those own properties; it does not assign undefined or null. With `exactOptionalPropertyTypes`, those three states remain distinct. Required-field omission for negative tests needs an explicitly unsafe JavaScript/cast boundary, not an incorrect ordinary return type.

## Fresh nested values and derived values

Direct builders can opt into named setters with `fluent(builder, ['name'])`.
See [named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html) for input/output typing and
release availability. Generated ordinary-record facades already have these methods.

Builder configuration is immutable, but user data is not deep-cloned or frozen. A shared object supplied to `with()` or `replace()` stays shared in `build()` output. Validated builds return whatever the validator outputs, so identity depends on the adapter: the TypeBox adapters decode a deep clone, so `buildValidated()` output never shares objects with patches; Zod and Valibot rebuild the objects and arrays they parse; ArkType returns the input itself. Compare validated output by value, not identity. Use per-build factories when fixture isolation is needed:

```ts
const isolated = users.withFactory(() => ({ notes: [] }));
const first = isolated.build('first');
const second = isolated.build('second');
// first.notes and second.notes are different arrays.
```

`withFactory()` supplies a new patch; `replaceFactory()` supplies a new complete value. They receive the same argument tuple as the main factory and run once per build. These callbacks are synchronous; returning a promise is rejected. Use a main async factory or an explicit async transform for asynchronous work.

Transforms receive the current value and the factory arguments. They run in registration order and can derive correlated fields. `transform()` is synchronous. `transformAsync()` accepts asynchronous work and switches the resulting builder to async-only build capabilities. Validation is retained throughout every fluent operation.

## Lists and limits

Synchronous builders expose `build`, `buildList`, `buildAsync`, and `buildListAsync`. Schema builders add `buildValidated`, `buildValidatedList`, `buildValidatedAsync`, and `buildValidatedListAsync`. Async-only builders expose only the async variants in their types.

Lists execute sequentially, preserving factory and random-state order. Counts must be non-negative safe integers within `maxListSize`, which defaults to 10,000. Checks occur before any generation or validation. A zero count does no work. Configure another budget explicitly:

```ts
const bounded = createBuilder(() => ({ id: 1 }), { maxListSize: 100 });
```

This budget limits list allocation, not arbitrary factory runtime, recursive schema processing, or total object size. It is not a sandbox.

### Default sessions

A factory whose first parameter is an optional `GenerationSession` can declare the session used when a call omits it:

```ts
import { createBuilder, createSession, type GenerationSession } from '@mimlet/core';

const session = () =>
  createSession({ fingerprint: 'users/v1', provider: 'application-fixtures@1', seed: 1 });
const users = createBuilder(
  (execution: GenerationSession = session()) => ({ age: execution.integer(18, 80) }),
  { defaultSession: session }
);
const people = users.buildList(3); // equals users.buildList(3, session())
```

Each build, validated build or list call that omits the leading session (or passes `undefined`) calls `defaultSession` once and passes the result to the factory, patch factories and transforms. List items therefore continue one session instead of restarting it, while repeated session-less calls stay deterministic. An explicit session is never replaced, and an empty list creates no session. The option is type-checked: factories without an optional leading session parameter cannot declare it. Adapters with optional sessions use their own seed-1 `session()` as this default; see [Sessions and replay](https://jeffreynijs.github.io/mimlet/guide/sessions-and-replay.html#omitted-sessions).

## Inspection and adapters

`describe()` returns frozen operation names, the list budget, and whether validation is attached. It deliberately excludes fixture values and callbacks. It is a small diagnostic surface. Schema inspection belongs to the adapter SDK; replay state is exposed separately by generation sessions.

Native TypeBox packages are available in this repository:

- `@mimlet/typebox` for `typebox`.
- `@mimlet/typebox-legacy` for `@sinclair/typebox`.

Their `fromTypeBox()` entry points can create native defaults without a handwritten factory, retain encoded/decoded types, and validate using native operations. Their READMEs document the precise version targets and generation limitations.

The Hey API emitter and standalone generated classes now use this runtime. Sessions, capture, scenarios, generation providers and property testing are implemented in the core or optional packages. The root README and compatibility guide distinguish the packages and tested capabilities; publication and downstream production migration remain separate operations.

## Verification

Run `pnpm test:core` for compilation, negative type tests, runtime tests, and core-specific coverage thresholds. `pnpm validate` additionally runs formatting, lint, the real Zod and Hey API integration suites, TypeBox tarball consumer checks, and package checks.

### Validation diagnostics

`BuilderValidationError` has the stable code `VALIDATION_FAILED` and the generic
message `Schema validation failed`. Native messages may include private fixture
values, so they are not copied into the error message, stack or enumerable fields.
The original issue objects and paths remain available through the non-enumerable
`error.issues` property for deliberate inspection. Applications displaying native
diagnostics should use that property explicitly. Exceptions thrown directly by
trusted factories or validator callbacks retain their original behavior.
