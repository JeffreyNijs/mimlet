# Changelog

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
- a998d86: Add a `fill.nullable` option for unions with a `Null` member. The fill creates a union
  from the first member whose value passes it, so `Type.Union([x, Type.Null()])` and
  Elysia's `t.Nullable(x)`, which put `Null` last, are created as `x`'s value: `''`, `0`, a
  date or a whole object. Prismabox schemas put `Null` first and get `null`. With
  `fill: { nullable: 'null' }`, every union with a `Null` member is created as `null`, as if
  `Null` came first: in properties, array items, tuples, records with fixed keys,
  intersections, nested unions and referenced, cyclic or recursive schemas. A union's own
  `default` still wins, optional properties stay absent, and `fromTypeBoxVariant()` still
  builds the selected member. Validation uses the original schema.

  The default, `'value'`, keeps the current values and replay identities. `'null'` is part
  of the adapter's replay identity, so a session recorded with one setting does not replay
  with the other.

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `typeBoxFields(schema)`, which lists an object schema's top-level properties for
  `fluent()` from `@mimlet/core`: `fluent(fromTypeBox(schema), typeBoxFields(schema))` has
  a `withX()` setter per field, typed with the encoded input. It reads only
  `schema.properties`, so a generic helper over `S extends TObject` gets setters for every
  schema it is called with. Schemas without properties, such as unions, throw a `TypeError`.
- 4783161: Give `fromTypeBox()` and `fromTypeBoxVariant()` builders an optional generation
  session, and fill what native creation cannot create.

  - Builders now take `[session?: GenerationSession]`, like the Zod, Valibot, ArkType and
    JSON Schema builders. A session-less build or list uses one seed-1 session from the
    new `typeBoxAdapter(schema).session()`, so `withFactory()` and transforms can give list
    items distinct values with `session.sequence()` instead of a `.with({ id })` per item.
    Native creation itself ignores the session. The adapters gain `identity` and
    `session()` for replay, and `create()` accepts a session. Code that names the builder
    as `SchemaBuilder<Input, Output>` still compiles.
  - `Value.Create` cannot create strings with a `format` or `pattern`, unique arrays, or a
    union whose first member creates a value the union rejects. Creation now fills these on
    a creation-only copy of the schema: built-in samples for common formats (dates come
    from the session's reference time), candidates from the new `fill.formats` and
    `fill.patterns` options, distinct literals for unique arrays, the first union member
    whose value passes the union, and numbers inside exclusive or one-sided bounds.
    Validation still uses the original schema. Schemas that built before keep their
    values; schemas that failed with `BuilderGenerationError` now build. A value that
    still cannot be created fails with a `BuilderGenerationError` that names its location.
    Pass `fill: false` for plain native creation.

### Patch Changes

- 7a0a273: Type `fromTypeBox()` and `fromTypeBoxVariant()` as a synchronous `SchemaBuilder`, as
  the Zod, ArkType and JSON Schema entry points already are. Native creation is always
  synchronous, but the previous conditional type could not be resolved for a schema
  type parameter, so a generic helper such as
  `<S extends TObject>(schema: S) => fromTypeBox(schema).withFactory(...)` lost `build()`
  and `buildValidated()`, even at concrete call sites. A helper that typed a
  `fromTypeBoxFactory()` result as `ReturnType<typeof fromTypeBox<S>>` should leave its
  return type inferred instead.
- Updated dependencies [536ca1e]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- Updated dependencies
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/typebox.

Native typebox fixtures, strict validation and codecs for test-builders.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
