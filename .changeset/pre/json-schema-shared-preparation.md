---
'@mimlet/json-schema': minor
'@mimlet/zod': patch
---

Prepared generators are now shared within a process by content. Two adapters whose
schema and reference map have the same JSON text, with the same dialect, profile,
limits and extension or format identities, reuse one compiled validator instead of
compiling it again. This covers different schema objects with equal content, such as
`zLead.transform(a)` and `zLead.transform(b)` in `@mimlet/zod`, and a schema module
that a test runner or dev server evaluates again in the same process. Generated values,
sessions, replay identities and validation issues are unchanged.

Ajv instances are also shared per dialect, limits, annotations and reference map, so
the JSON Schema meta-schema is compiled once per process instead of once per schema.
For five first builds of generated Hey API schemas in a new process this took about
145 ms before and 118 ms now. Loading the same generated schema module again in one
process and building five schemas took about 65 ms before and 12 ms now. Vitest's
default isolation runs each spec file in a new worker, which starts with an empty
cache, so there only the first improvement applies.

The store keeps the 256 most recently used generators, lives on `globalThis` under
`Symbol.for('mimlet.generators.v1')` with one store per package version, and never
shares adapters with custom `keywords` or `formats`. Set `MIMLET_GENERATOR_CACHE=off`
to turn it off, or a number to change the limit. `configureGeneratorCache({ maxEntries })`
and `clearGeneratorCache()` do the same at runtime.
