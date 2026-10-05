# @mimlet/zod

## 0.1.0-beta.3

### Patch Changes

- 6d167f1: Installs no longer fail when a native library ships a compatible release. Each
  adapter's peer range now runs from its oldest tested version up to the library's next
  major release, or the next minor for the 0.x `@sinclair/typebox`: `zod >=4.4.3 <5`,
  `valibot >=1.5.0 <2`, `arktype >=2.2.5 <3`, `effect >=4.0.0 <5`, `typebox >=1.3.34 <2`,
  `@sinclair/typebox >=0.34.48 <0.35`, `@faker-js/faker >=10.5.0 <11` and
  `fast-check >=4.10.2 <5`. Before, the peer range ended at the newest tested version,
  so `npm install effect@4.0.1 @mimlet/effect` failed with `ERESOLVE` as soon as Effect
  4.0.1 was published.

  The versions each release was tested with stay recorded, now in the package's
  `mimlet.testedPeers` field, and `mimlet doctor` warns when an installed version is newer
  than that. Effect 4.0.1 is now tested. `effectAdapter().metadata.version` names the
  loaded Effect release instead of always `4.0.0`, and
  `arkTypeAdapter().metadata.supportedVersions` is the new peer range.

- @mimlet/core@0.1.0-beta.3
  - @mimlet/json-schema@0.1.0-beta.3

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
