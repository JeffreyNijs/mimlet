---
'@mimlet/json-schema': patch
---

Preparing a generator in a new process is faster, which matters most when Vitest runs
each spec file in a new worker. A quick check now recognizes schemas that are valid
for the JSON Schema meta-schema, such as everything Zod converts, and for those Ajv no
longer compiles the meta-schema to check them again. Any schema the check cannot decide,
or that is invalid, gets Ajv's full check and fails with the same
`SchemaPreparationError` and message as before. Validators are also compiled without
Ajv's optional code tidying, which only shortened the generated code.

For five generated Hey API schemas in a new process, the first validated builds took
about 62 ms before and 42 ms now. In a Vitest project with 14 spec files that each
build five of 80 generated Zod schemas, the summed test time went from 1.9 s to 1.2 s.
Generated values, replay identities, validation issues and error codes are unchanged.
