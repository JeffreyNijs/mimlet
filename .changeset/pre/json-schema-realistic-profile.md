---
'@mimlet/json-schema': minor
---

Add the opt-in `realistic` generation profile for values that read like test data.
It includes optional properties, gives nullable fields a value, keeps arrays at one to
three items, draws numbers with no bounds or bounds wider than 1000 from 1 to 100 inside
the declared bounds, rounds decimals to two places, writes plain strings as one to three
readable words and prefers schema `examples`. Properties that lead back into a `$ref`
cycle are not added, so recursive schemas stay finite. Every value is still checked
against the original schema, and when the hints cannot be satisfied the remaining
attempts sample as `minimal` does.

The profile and the version of its rules are part of the replay identity. The default
`minimal` profile and the other profiles produce the same values and identities as
before. The Zod, Valibot and ArkType adapters accept the same `profile` option.
