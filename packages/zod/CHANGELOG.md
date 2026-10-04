# @mimlet/zod

## 0.1.0-beta.2

### Minor Changes

- 1145c96: Export named builder types for generic helpers that need an explicit return type,
  for example under `@typescript-eslint/explicit-function-return-type`.
  `TypeBoxBuilder<S>`, `TypeBoxFactoryBuilder<S, F>` and `TypeBoxVariantBuilder<S, I>`
  (with an optional context type in `@mimlet/typebox`), `ZodBuilder<S>` and
  `ZodFactoryBuilder<S, F>`, and `EffectBuilder<A, I>` and `EffectFactoryBuilder<A, I, F>`
  are exactly what `fromTypeBox()`, `fromTypeBoxFactory()`, `fromTypeBoxVariant()`,
  `fromZod()`, `fromZodFactory()`, `fromEffect()` and `fromEffectFactory()` return,
  also for a schema type parameter. A factory builder still gets its sync or async
  methods where the helper is called. This replaces the advice to leave such return
  types inferred or to write `ReturnType<typeof fromTypeBoxFactory<...>>`.

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2
  - @mimlet/json-schema@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `zodFields(schema)`, which lists an object schema's top-level input keys for
  `fluent()` from `@mimlet/core`: `fluent(fromZod(schema), zodFields(schema))` has a
  `withX()` setter per field, also in a generic helper over `S extends z.ZodObject`. It
  follows `.transform()` and other pipes to the object that receives the input and works
  with the factory and async entry points. Non-object schemas throw a `TypeError`.

### Patch Changes

- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- 25de9f6: Type `zodAdapter().metadata.version` as `string`. It reports the loaded Zod release,
  but its type was narrowed to the compile-time `4.4.x`, which mistyped Zod 4.5 and 4.6
  consumers.
- Updated dependencies
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0
  - @mimlet/json-schema@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4
  - @mimlet/json-schema@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 5bf6cd2: Draw session-less list items from one default session instead of repeating the
  first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
  for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
  builders. A single session-less build keeps its seed-1 value, and explicit sessions,
  snapshots and replay are unchanged. Factory builders can opt in through the new
  type-checked `defaultSession` option.
- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3
  - @mimlet/json-schema@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- 332085a: Expand native peer ranges only across installed-tarball conformance targets. Record the actual Zod runtime version in provider metadata. Modern TypeBox stays pinned to 1.3.34 because earlier tested patches lose escaped validation paths.
- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2
  - @mimlet/json-schema@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- 4a915ee: Add dedicated Zod 4 (including Mini) and ArkType adapters with native input/output
  types, JSON Schema input generation, factory helpers and preserved native parsing.
  Zod's explicit async builders avoid the synchronous Standard Schema probe and
  retain native codec encoding. ArkType retains scoped Types and input checks that
  do not execute morphs.

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1
