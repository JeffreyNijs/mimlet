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

`fromTypeBox(schema)` uses TypeBox's native `Value.Create` to construct defaults/minimal examples, clones the result, and checks it against the native schema. Every build creates a fresh value. This is not a Faker backend, a complete JSON Schema solver, or a promise to generate every refinement or recursive structure.

When native creation fails or yields an invalid candidate, `BuilderGenerationError` preserves the cause and recommends a custom factory. No retries or automatic repairs are performed. A failure to create a value is not a proof that the schema is unsatisfiable.

```ts
import { fromTypeBoxFactory } from '@mimlet/typebox';

const Code = Type.String({ pattern: '^APP-[0-9]+$' });
const codes = fromTypeBoxFactory(Code, (index: number) => `APP-${index}`);
const code = codes.buildValidated(42);
```

Custom factory arguments are preserved, including required and multiple arguments. An asynchronous factory returns an async-only builder. Both native and custom-factory builders share the core runtime.

## Generic helpers

`fromTypeBox()` and `fromTypeBoxVariant()` return a synchronous `SchemaBuilder`, also for a schema type parameter. A helper therefore keeps `build()`, `buildList()` and the validated methods after `with()` or `withFactory()`. `@mimlet/core` exports `BuilderPatch` and the builder interfaces as types for naming patches and results:

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

## Strict checking, codecs and references

`typeBoxAdapter(schema, options)` exposes the original `source`, a Standard Schema `standard` wrapper, and `check`, `issues`, `create`, `decode`, and `encode` operations. `check` does not coerce or decode. The Standard Schema wrapper first checks the encoded input and then executes decode callbacks on a clone. It deliberately does not invoke the modern `Value.Decode` default/convert/clean pipeline.

`build()` produces encoded input without applying codecs. `buildValidated()` returns decoded output. Patches remain encoded-input typed. Because decoding runs on a clone, `build()` returns objects passed to `with()` or `replace()` as they are, while `buildValidated()` returns copies: compare validated output by value. Codec callbacks execute once per successful validated build; exceptions propagate and are not treated as permission to regenerate the fixture. Encoding executes the native encode callbacks and checks the resulting encoded value. An absent or invalid inverse codec is not synthesized.

Native named references use `context`:

```ts
const User = Type.Object({ id: Type.String() });
const users = fromTypeBox(Type.Ref('User'), { context: { User } });
```

The top-level context is copied. Schemas, native registries, and nested configuration remain caller-owned; do not mutate them during a build. No reference is downloaded automatically. Native error JSON pointers become Standard Schema paths, including escaped property names.

The adapter does not install formats or change global TypeBox settings. Configure formats through the native library, and supply suitable factories when native creation cannot satisfy them.

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
