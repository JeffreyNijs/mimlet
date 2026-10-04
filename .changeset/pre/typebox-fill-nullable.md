---
'@mimlet/typebox': minor
'@mimlet/typebox-legacy': minor
---

Add a `fill.nullable` option for unions with a `Null` member. The fill creates a union
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
