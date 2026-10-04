# Changelog

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

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `effectFields(schema)`, which lists a struct's top-level encoded keys for `fluent()`
  from `@mimlet/core`: `fluent(fromEffect(schema), effectFields(schema))` has a `withX()`
  setter per field, also in a generic helper. Keys renamed with `Schema.encodeKeys` are
  listed by their encoded name, because builders take encoded input. Non-struct schemas
  throw a `TypeError`.

### Patch Changes

- Updated dependencies [536ca1e]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- eba145d: Raise a `TypeError` that points to `fromEffectAsync` when a synchronous build or
  `inputArbitrary()` meets an asynchronous encoder, instead of Effect's internal
  "Sync adapter can only throw schema errors". Ordinary schema failures still surface as
  Effect's `SchemaError`. Exhausted sampling now suggests `fromEffectFactory`.
- Updated dependencies
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- f38ccc6: Target exactly `effect@4.0.0`, which npm now installs by default. Effect 4 removed
  the bundled fast-check, so generation samples Effect's own `effect/Arbitrary` engine
  from the explicit session with every sampling option fixed, and property tests use
  Effect's `Arbitrary.checkEffect` shrinking and replay. Each adapter converts its own
  Standard Schema wrapper, so parse options never leak between adapters or modify the
  caller's schema. Loading this release with Effect 3 throws a `TypeError` naming the
  required version; Effect 3 projects stay on the `0.1.0-alpha.3` train.
- @mimlet/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 5bf6cd2: Raise a descriptive `TypeError` when `fromEffect` or `fromEffectAsync` builds without
  the required explicit session, instead of failing inside native sampling. Effect
  builders still have no default session; the types continue to require one.
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

Initial prerelease source for @mimlet/effect.

Native schema fixtures preserving input/output semantics and builder capabilities.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
