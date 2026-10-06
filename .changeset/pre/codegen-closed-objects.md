---
'@mimlet/codegen': minor
---

Add `closedObjects: true` to an OpenAPI selection (and to JSON builder targets). It types each
object schema that declares properties but not `additionalProperties` without the
`[k: string]: unknown` index signature, so builders generated from a NestJS document, which
never closes its objects, fit the application's own types, and a misspelled key in `.with()`
is a type error. Only the types change: generation and `buildValidated()` keep the
document's rules. Generated setters no longer cast their patch when the input type is a
plain object without an index signature.

An OpenAPI `schemas` entry of the wrong shape is now reported with its position and the entry
it most likely means, for example `schemas[0] is {"name":"DealDto","direction":"request"}.
Did you mean {"schema":"DealDto","direction":"request"}?`. An unknown component written as a
`#/components/schemas/...` reference or with other letter case names the component.
