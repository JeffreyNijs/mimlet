# Legacy TypeBox builders

`@mimlet/typebox-legacy` is the native adapter for `@sinclair/typebox`. Releases, including betas, are published on npm's `latest` tag. The peer range accepts `@sinclair/typebox` `>=0.34.48 <0.35`, the 0.34 line, because a 0.x minor release can break; each release from 0.34.48 through 0.34.52 is tested, and `mimlet doctor` reports a newer, untested 0.34 release as `PEER_VERSION_UNTESTED`.

```ts
import { Type } from '@sinclair/typebox';
import { fromTypeBox } from '@mimlet/typebox-legacy';

const Timestamp = Type.Transform(Type.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const events = fromTypeBox(Type.Object({ timestamp: Timestamp }));

const input = events.with({ timestamp: 1000 }).build();
const output = events.with({ timestamp: 1000 }).buildValidated();
// input.timestamp is a number; output.timestamp is a Date.
```

## Contract

The exported functions are `fromTypeBox`, `fromTypeBoxFactory`, `fromTypeBoxVariant`, `typeBoxAdapter`, `typeBoxVariantAdapter` and `typeBoxFields`, as in the modern adapter, and the types `TypeBoxBuilder`, `TypeBoxFactoryBuilder` and `TypeBoxVariantBuilder` name the builders they return. All builders use the same core runtime, preserve factory argument tuples and encoded/decoded types, and restrict known-asynchronous factories to asynchronous build methods.

Automatic creation delegates to native `Value.Create`, clones its result, and checks it. This constructs native defaults/minimal examples, not random data. Before creating, the adapter applies the same deterministic fill as the modern adapter to a creation-only copy of the schema: format and pattern strings, unique arrays, union members and number bounds. See [Deterministic fill](https://jeffreynijs.github.io/mimlet/packages/typebox.html#deterministic-fill) in the modern adapter's README for the `fill` option and its limits. Checks use the original schema, so invalid overrides are never repaired.

In this package line the fill also creates `Type.Date()` at the session's reference time, `2000-01-01T00:00:00.000Z` by default, instead of reading the clock. A schema with `minimumTimestamp` keeps that native value. Other date bounds are respected. Legacy TypeBox ships no string formats, so a built-in format sample is only used after you register the format with `FormatRegistry` and the sample passes it. Elysia's `t.Date()` is a union led by `Type.Date()`, so it gets the same instant. Elysia's `t.Uint8Array()` is a union led by a custom `ArrayBuffer` kind whose `[1, 2, 3]` default the union rejects, so the union fallback uses its `Uint8Array` member.

### Nullable fields and Elysia's `t.Nullable()`

Elysia's `t.Nullable(x)` is `Type.Union([x, Type.Null()])`, with `Null` last. Union members are tried in order, so by default a nullable field is created as `x`'s value: `''`, `0`, the reference date or a whole object. A user with a nullable `verifiedAt` comes out verified. Prismabox schemas put `Null` first, so their nullable fields are already `null`. Set `fill.nullable` to `'null'` to create every union with a `Null` member as `null`, as if `Null` came first:

```ts
import { t } from 'elysia';

const User = t.Object({ name: t.String(), verifiedAt: t.Nullable(t.Date()) });
fromTypeBox(User).build(); // { name: '', verifiedAt: Date 2000-01-01T00:00:00.000Z }
fromTypeBox(User, { fill: { nullable: 'null' } }).build(); // { name: '', verifiedAt: null }
```

This applies at any depth: properties, array items, tuples, records with fixed keys, intersections, nested unions, `references`, modules and recursive schemas. A union with its own `default` keeps it; a `default` on `x` does not count. `t.Optional(t.Nullable(x))` properties stay absent, because native creation leaves out optional properties. `fromTypeBoxVariant(union, index)` still builds the member you select. The default, `'value'`, keeps the member order, and the setting is part of the replay identity. See [Nullable fields](https://jeffreynijs.github.io/mimlet/packages/typebox.html#nullable-fields) in the modern adapter's README.

When a value still cannot be created, `BuilderGenerationError` names its location and keeps the native error as its `cause`; `fromTypeBoxFactory(schema, factory, options)` supplies application-specific data instead. There is no unbounded retry loop and no assertion that every satisfiable schema can be generated. `fill: false` restores plain native creation.

## Sessions

`fromTypeBox()` and `fromTypeBoxVariant()` builders take an optional `GenerationSession`. Native creation does not draw from it, but patch factories and transforms do, and a session-less list shares one seed-1 session from `typeBoxAdapter(schema).session()`:

```ts
const users = fromTypeBox(Type.Object({ id: Type.Number() })).withFactory((session) => ({
  id: session.sequence('user', 1),
}));
users.buildValidatedList(3); // ids 1, 2 and 3, the same on every run
```

Patch factories and transforms always receive a session. Two builders over the same schema share the default stream; give them a `name`, as in `fromTypeBox(schema, { name: 'users' })`, for different session-less values, or pass one `createTestSession()` to every build in a test.

`typeBoxAdapter(schema).identity` fingerprints the schema and `references`, the creation provider and the fill configuration for replay. Transform callbacks cannot be fingerprinted.

The adapter's `check` uses native checking without coercion. Successful validation calls native `Value.Decode` on a clone. As a result, `build()` returns objects passed to `with()` or `replace()` as they are, while `buildValidated()` returns copies: compare validated output by value. In this package line, Decode checks the encoded value and executes Transform callbacks without the modern default/convert/clean pipeline. A codec executes once per validated build, although the legacy implementation may perform more than one native check. `encode` calls the native encoder, which checks the encoded result. Native callback failures are preserved.

## Generic helpers

`fromTypeBox()` and `fromTypeBoxVariant()` return a synchronous `SchemaBuilder<Input, Output, [session?: GenerationSession], [session: GenerationSession]>`, also for a schema type parameter; the last argument types what patch factories and transforms receive. A helper therefore keeps `build()`, `buildList()` and the validated methods after `with()` or `withFactory()`. A helper typed as `SchemaBuilder<Input, Output>` still compiles, because the session is optional. `@mimlet/core` exports `BuilderPatch` and the builder interfaces as types for naming patches and results.

A helper's return type can stay inferred. When a lint rule such as `@typescript-eslint/explicit-function-return-type` requires one, name the builder the helper returns. Each type is exactly what its function returns, also for a schema type parameter:

| Entry point                                    | Builder type                  |
| ---------------------------------------------- | ----------------------------- |
| `fromTypeBox(schema, options)`                 | `TypeBoxBuilder<S>`           |
| `fromTypeBoxFactory(schema, factory, options)` | `TypeBoxFactoryBuilder<S, F>` |
| `fromTypeBoxVariant(union, index, options)`    | `TypeBoxVariantBuilder<S, I>` |

`F` is the factory's type.

```ts
import type { BuilderPatch } from '@mimlet/core';
import type { StaticEncode, TObject, TSchema } from '@sinclair/typebox';
import { fromTypeBox, fromTypeBoxFactory } from '@mimlet/typebox-legacy';
import type { TypeBoxBuilder, TypeBoxFactoryBuilder } from '@mimlet/typebox-legacy';

function rows<S extends TObject>(
  schema: S,
  defaults: () => BuilderPatch<StaticEncode<S>>
): TypeBoxBuilder<S> {
  return fromTypeBox(schema).withFactory(defaults);
}
rows(User, () => ({ id: 'user-1' })).buildValidatedList(2);

function dtos<S extends TSchema>(
  schema: S,
  create: () => StaticEncode<S>
): TypeBoxFactoryBuilder<S, () => StaticEncode<S>> {
  return fromTypeBoxFactory(schema, create);
}
dtos(User, () => ({ id: 'user-2' }))
  .with({ id: 'user-3' })
  .buildValidated();
```

TypeScript cannot tell whether a factory typed `() => StaticEncode<S>` returns a promise while `S` is unresolved, so a factory builder gets its sync or async methods where the helper is called. There, `dtos(User, ...)` has `build()` and `buildValidated()`, and a helper typed `TypeBoxFactoryBuilder<S, () => Promise<StaticEncode<S>>>` has only the async methods. `F` also carries the factory's arguments: a builder typed `TypeBoxFactoryBuilder<S, (id: string) => StaticEncode<S>>` builds with `build(id)`. Inside the helper these methods are not known yet, so call `.with()` and `.withFactory()` on the helper's result, or put the defaults in the factory. `fluent()` also works inside the helper. `TypeBoxBuilder` does not describe a factory builder.

### Named setters for every field

`typeBoxFields(schema)` lists an object schema's top-level properties. Pass it to `fluent()` from `@mimlet/core` for a `withX()` setter per field, typed with the encoded input. It reads only `schema.properties`, so a helper shared by many row schemas needs no field lists and no casts:

```ts
import { fluent } from '@mimlet/core';
import type { TObject } from '@sinclair/typebox';
import { fromTypeBox, typeBoxFields } from '@mimlet/typebox-legacy';

function rows<S extends TObject>(schema: S) {
  return fluent(fromTypeBox(schema), typeBoxFields(schema));
}
rows(Order).withStatus('PAID').buildValidated();
```

With an explicit return type, that helper returns `FluentFieldsBuilder<TypeBoxBuilder<S>, Extract<keyof S['properties'], string>>`, using `FluentFieldsBuilder` from `@mimlet/core`. It also works with `fromTypeBoxFactory()` and, for a selected union branch, `typeBoxFields(Pet.anyOf[1])`. Schemas without `properties`, such as unions and references, throw a `TypeError`. Names that two fields share or that are builder methods (a field named `factory`) get no setter; see [named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field).

## References and native values

Legacy external references are supplied explicitly:

```ts
const User = Type.Object({ id: Type.String() }, { $id: 'User' });
const users = fromTypeBox(Type.Ref(User), { references: [User] });
```

The reference array is copied, but schemas remain caller-owned. Native recursive schemas, Date schemas, Transform callbacks, and registered formats are not serialized through JSON. The conformance suite exercises representative cases, including Date output, recursive trees with empty child arrays, and custom formats.

Neither the adapter nor the core downloads references or changes global format/type registries. Custom types still need appropriate native registration and may require an explicit factory. Native generation is intended for trusted schemas: the core's list budget does not isolate recursive generation, expensive regexes, or user code.

See the modern adapter README for the shared API details and the root `docs/acceptance.md` for the implementation and acceptance boundaries. Run `pnpm test:typebox` to test both package lines using real independently installed tarballs and strict declaration checks.

## Complete union variants

`fromTypeBoxVariant(union, index, options)` constructs an entire selected top-level
`anyOf` branch before applying patches. Input types are narrowed to that branch;
validation and output retain the original union and its root codecs.
`typeBoxVariantAdapter` exposes native checking, issues, creation, decoding and
encoding for that selection. Use `createSchemaBuilder(adapter.standard, factory)`
for a custom factory. See the repository's `docs/union-variants.md` for the full
contract and overlap/reference caveats.
