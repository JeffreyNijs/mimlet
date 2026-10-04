# Native TypeBox builders

`@mimlet/typebox` accepts native `typebox` schemas. Prereleases use npm's `next` tag. Its current compatibility target is exactly `typebox@1.3.34`; broader ranges require additional matrix testing.

Install from npm's `next` tag. Pin exact versions when you need to
reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/typebox@next typebox@1.3.34
```

```ts
import Type from 'typebox';
import { fromTypeBox } from '@mimlet/typebox';

const Timestamp = Type.Codec(Type.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const Event = Type.Object({
  id: Type.String({ default: 'event-1' }),
  timestamp: Timestamp,
});

const events = fromTypeBox(Event);
const input = events.with({ timestamp: 1000 }).build();
const output = events.with({ timestamp: 1000 }).buildValidated();
// input.timestamp is a number; output.timestamp is a Date.
```

## Native creation is not random sampling

`fromTypeBox(schema)` uses TypeBox's native `Value.Create` to construct defaults/minimal examples, clones the result, and checks it against the native schema. Every build creates a fresh value, and repeated builds return equal values. This is not a Faker backend, a complete JSON Schema solver, or a promise to generate every refinement or recursive structure.

### Deterministic fill

`Value.Create` cannot create strings with a `format` or `pattern`, arrays with `uniqueItems`, or a union whose first member creates a value the union rejects. The adapter fills these cases on a copy of the schema that it uses only for creation. Checks and `buildValidated()` use your original schema, so overrides are never repaired, and parts that native creation already handles keep their native values.

- **Formats.** `date-time`, `date` and `time` strings use the reference time: the session's `referenceDate()`, which is `2000-01-01T00:00:00.000Z` by default. `email`, `uri`, `url`, `uuid`, `ipv4`, `ipv6` and `hostname` use fixed samples such as `user@example.com` and `192.0.2.1`. `fill.formats` adds samples or replaces built-in ones.
- **Patterns.** There is no regular expression solver. `fill.patterns` lists candidate strings, and a pattern string uses the first one that passes its own check (pattern, format and length).
- **Unique arrays.** One item is always unique. For more, the items must be literals, an enum or booleans, and the array takes the first `minItems` distinct values.
- **Unions.** Members are tried in order, once each. The first created value that passes the whole union is used.
- **Nullable unions.** By default a union with a `Null` member follows the same order: `Type.Union([Type.String(), Type.Null()])` is created as `''` and `Type.Union([Type.Null(), Type.String()])` as `null`. `fill.nullable: 'null'` creates every union with a `Null` member as `null`, as if `Null` came first. See [Nullable fields](#nullable-fields).
- **Bounds.** A number whose native value is outside its `exclusiveMinimum`, `exclusiveMaximum` or `maximum` gets a value inside them, such as `0.5` for `exclusiveMinimum: 0` and `exclusiveMaximum: 1`.

Schemas in `context` are filled too. An unfillable one fails only when creation reaches it.

```ts
const Order = Type.Object({
  id: Type.String({ format: 'uuid' }),
  placedAt: Type.String({ format: 'date-time' }),
  sku: Type.String({ format: 'x-sku' }),
  code: Type.String({ pattern: '^APP-[0-9]+$' }),
});
const orders = fromTypeBox(Order, {
  fill: { formats: { 'x-sku': 'SKU-0001' }, patterns: ['APP-1'] },
});
orders.buildValidated();
// { id: '00000000-0000-4000-8000-000000000000', placedAt: '2000-01-01T00:00:00.000Z',
//   sku: 'SKU-0001', code: 'APP-1' }
```

`fill.now` sets a fixed instant instead of the session's reference time. `fill: false` turns the fill off and uses plain `Value.Create`.

#### Nullable fields

A nullable field written as `Type.Union([x, Type.Null()])` puts `Null` last, so it is created as `x`'s value: `''`, `0`, a date or a whole object. (Elysia's `t.Nullable(x)` builds the same shape with `@sinclair/typebox`; use `@mimlet/typebox-legacy` for it.) When fixtures should leave nullable fields empty, set `fill.nullable` to `'null'`:

```ts
const Profile = Type.Object({
  name: Type.String(),
  verifiedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
fromTypeBox(Profile).build();
// { name: '', verifiedAt: '2000-01-01T00:00:00.000Z' }
fromTypeBox(Profile, { fill: { nullable: 'null' } }).build();
// { name: '', verifiedAt: null }
```

With `'null'`, every union with a `Null` member is created as `null`: in properties, array items, tuples, records with fixed keys, intersections, schemas in `context` and cyclic definitions. A member that is itself a nullable union counts too, so `Type.Union([Type.String(), Type.Union([Type.Number(), Type.Null()])])` is `null`. Some cases keep their value:

- A union with its own `default` keeps it. A `default` on the other member does not count.
- Optional properties stay absent, because native creation leaves them out.
- `fromTypeBoxVariant(union, index)` still builds the member you select.

The default, `'value'`, keeps the member order described above. The setting is part of the adapter's replay identity, so a session recorded with one setting does not replay with the other.

When a value still cannot be created, `BuilderGenerationError` names its location, such as `/lines/*/code` (`*` stands for any array item), keeps the native error as its `cause`, and recommends a fill option or a custom factory. The message never contains fixture values. This happens for a format without a sample, a pattern without a fitting candidate, and a unique array that needs more distinct values than its literals provide. A failure to create a value is not a proof that the schema is unsatisfiable.

```ts
import { fromTypeBoxFactory } from '@mimlet/typebox';

const Code = Type.String({ pattern: '^APP-[0-9]+$' });
const codes = fromTypeBoxFactory(Code, (index: number) => `APP-${index}`);
const code = codes.buildValidated(42);
```

Custom factory arguments are preserved, including required and multiple arguments. An asynchronous factory returns an async-only builder. Both native and custom-factory builders share the core runtime.

## Sessions and distinct rows

`fromTypeBox()` and `fromTypeBoxVariant()` builders take an optional `GenerationSession`, like the Zod, Valibot, ArkType and JSON Schema builders. Native creation does not draw from it, so `buildList(3)` without patches still returns three equal rows. Patch factories and transforms receive the session, and a session-less build or list uses one seed-1 session from `typeBoxAdapter(schema).session()`, so list items can differ:

```ts
import type { GenerationSession } from '@mimlet/core';

const User = Type.Object({ id: Type.String(), name: Type.String({ default: 'Ada' }) });
const users = fromTypeBox(User).withFactory((session?: GenerationSession) => ({
  id: `user-${session?.sequence('user', 1)}`,
}));
users.buildValidatedList(3); // ids user-1, user-2 and user-3, the same on every run
```

TypeScript types the callback's session as optional, but the builder always passes one. Pass an explicit session to continue a sequence across builds or to replay one. `typeBoxAdapter(schema).identity` is the replay identity: a fingerprint of the schema and `context`, the creation provider and version, and the fill configuration. Codec callbacks cannot be fingerprinted, so two schemas that differ only in a callback share a fingerprint.

## Generic helpers

`fromTypeBox()` and `fromTypeBoxVariant()` return a synchronous `SchemaBuilder<Input, Output, [session?: GenerationSession]>`, also for a schema type parameter. A helper therefore keeps `build()`, `buildList()` and the validated methods after `with()` or `withFactory()`. A helper typed as `SchemaBuilder<Input, Output>` still compiles, because the session is optional. `@mimlet/core` exports `BuilderPatch` and the builder interfaces as types for naming patches and results:

```ts
import type { BuilderPatch } from '@mimlet/core';
import type { StaticEncode, TObject } from 'typebox';
import { fromTypeBox } from '@mimlet/typebox';

function rows<S extends TObject>(schema: S, defaults: () => BuilderPatch<StaticEncode<S>>) {
  return fromTypeBox(schema).withFactory(defaults);
}
const events = rows(Event, () => ({ id: 'event-2' }));
events.buildValidatedList(2);
```

TypeScript cannot tell whether a custom factory typed `() => StaticEncode<S>` returns a promise while `S` is unresolved, so `fromTypeBoxFactory()` resolves its sync or async methods at the call site. Leave such a helper's return type inferred; the `fromTypeBox()` type does not describe a custom-factory builder.

### Named setters for every field

`typeBoxFields(schema)` lists an object schema's top-level properties. Pass it to `fluent()` from `@mimlet/core` for a `withX()` setter per field, typed with the encoded input. It reads only `schema.properties`, so it also works in a generic helper and with `fromTypeBoxFactory()`:

```ts
import { fluent } from '@mimlet/core';
import type { TObject } from 'typebox';
import { fromTypeBox, typeBoxFields } from '@mimlet/typebox';

function rows<S extends TObject>(schema: S) {
  return fluent(fromTypeBox(schema), typeBoxFields(schema));
}
rows(Order).withStatus('PAID').buildValidated();
```

For a selected union branch, pass that branch: `fluent(fromTypeBoxVariant(Pet, 1), typeBoxFields(Pet.anyOf[1]))`. Schemas without `properties`, such as unions and references, throw a `TypeError`. Names that two fields share or that are builder methods (a field named `factory`) get no setter; see [named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field).

## Strict checking, codecs and references

`typeBoxAdapter(schema, options)` exposes the original `source`, a Standard Schema `standard` wrapper, and `check`, `issues`, `create`, `decode`, and `encode` operations. `check` does not coerce or decode. The Standard Schema wrapper first checks the encoded input and then executes decode callbacks on a clone. It deliberately does not invoke the modern `Value.Decode` default/convert/clean pipeline.

`build()` produces encoded input without applying codecs. `buildValidated()` returns decoded output. Patches remain encoded-input typed. Because decoding runs on a clone, `build()` returns objects passed to `with()` or `replace()` as they are, while `buildValidated()` returns copies: compare validated output by value. Codec callbacks execute once per successful validated build; exceptions propagate and are not treated as permission to regenerate the fixture. Encoding executes the native encode callbacks and checks the resulting encoded value. An absent or invalid inverse codec is not synthesized.

Native named references use `context`:

```ts
const User = Type.Object({ id: Type.String() });
const users = fromTypeBox(Type.Ref('User'), { context: { User } });
```

The top-level context is copied. Schemas, native registries, and nested configuration remain caller-owned; do not mutate them during a build. No reference is downloaded automatically. Native error JSON pointers become Standard Schema paths, including escaped property names.

The adapter does not install formats or change global TypeBox settings. Configure formats through the native library. A fill sample is only used when it passes the format's native check.

## Limits and verification

These adapters are for trusted native schemas and callbacks. The core's `maxListSize` limits list allocation, not recursive native generation time, regex complexity, or arbitrary callback execution. The optional playground offers bounded worker execution for JSON schema data, not arbitrary native callbacks or an OS sandbox.

`pnpm test:typebox` builds real core/adapter tarballs, installs them into an isolated consumer outside the repository, compiles their public declarations, and executes the conformance fixtures against the pinned native packages. The compatibility fixture has its own committed npm lockfile. The core itself does not depend on TypeBox.

For the maintained `@sinclair/typebox` package line, use `@mimlet/typebox-legacy` instead. No schema conversion between the two package lines is performed.

## Complete union variants

`fromTypeBoxVariant(union, index, options)` constructs an entire selected top-level
`anyOf` branch before applying patches. Input types are narrowed to that branch;
validation and output retain the original union and its root codecs.
`typeBoxVariantAdapter` exposes native checking, issues, creation, decoding and
encoding for that selection. Use `createSchemaBuilder(adapter.standard, factory)`
for a custom factory. See the repository's `docs/union-variants.md` for the full
contract and overlap/reference caveats.
