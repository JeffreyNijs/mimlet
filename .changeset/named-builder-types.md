---
'@mimlet/typebox': minor
'@mimlet/typebox-legacy': minor
'@mimlet/zod': minor
'@mimlet/effect': minor
---

Export named builder types for generic helpers that need an explicit return type,
for example under `@typescript-eslint/explicit-function-return-type`.
`TypeBoxBuilder<S>`, `TypeBoxFactoryBuilder<S, F>` and `TypeBoxVariantBuilder<S, I>`
(with an optional context type in `@mimlet/typebox`), `ZodBuilder<S>` and
`ZodFactoryBuilder<S, F>`, and `EffectBuilder<A, I>` and `EffectFactoryBuilder<A, I, F>`
are exactly what `fromTypeBox()`, `fromTypeBoxFactory()`, `fromTypeBoxVariant()`,
`fromZod()`, `fromZodFactory()`, `fromEffect()` and `fromEffectFactory()` return,
also for a schema type parameter. A factory builder still gets its sync or async
methods where the helper is called. This replaces the advice to leave such return
types inferred or to write `ReturnType<typeof fromTypeBoxFactory<...>>`.
