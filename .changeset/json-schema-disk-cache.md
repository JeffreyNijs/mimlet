---
'@mimlet/json-schema': minor
'@mimlet/zod': minor
---

Compiled validators can now be kept on disk between processes. This is off by default
and works in Node only. Set `MIMLET_GENERATOR_CACHE=disk` to use
`node_modules/.cache/mimlet` in the nearest directory with a `package.json`, set
`MIMLET_GENERATOR_CACHE_DIR` to choose the directory, or call
`configureGeneratorCache({ disk: true })` or `{ disk: { directory, maxEntries, maxBytes } }`.
`@mimlet/zod` now exports `configureGeneratorCache` and `clearGeneratorCache` too, so a
Zod test setup can turn the cache on without installing `@mimlet/json-schema` itself.

A new Vitest worker then loads a validator that an earlier run compiled instead of
compiling it again. Entries are keyed by the schema and reference text, every option
that changes the compiled code, and the versions of `@mimlet/json-schema`, Ajv,
ajv-formats and the Node major. They are written atomically, so concurrent workers are
safe, and kept within 2000 entries and 128 MiB by default, least recently used removed
first. Generated values, replay identities and validation issues are the same with the
cache on or off.

A cache hit runs code read from the directory. Only entries signed with the random key
in the directory's `key` file (mode 600) are run, and anything missing, corrupt or
unsigned is compiled again and rewritten. Anyone who can write the directory as you can
still run code in your tests, as with `node_modules`, so keep it inside the project.

The gain is modest: Zod's conversion and the first generation still run in each worker.
In a Vitest project with 14 spec files that each build five of 80 generated Zod schemas,
a warm cache cut the summed test time by about a third but the wall time by only 5%
(7% with 56 such spec files).
