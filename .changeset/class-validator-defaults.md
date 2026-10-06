---
'@mimlet/class-validator': minor
---

Add `withClassValidatorDefaults(options)`, which binds options once and returns
`fromClassValidator`, `fromClassValidatorAsync` and `classValidatorSchema` with them applied:
`const query = withClassValidatorDefaults({ ...validationPipeOptions, wire: qs })`, then
`query.fromClassValidator(ViewOrdersQuery, () => ({}))`. A call's own options override the
defaults key by key. The builders have the same types as the unbound functions return, and
`transform: false` in the defaults types `buildValidated()` as the payload. `async`, `name` and
`defaultSession` stay per call and throw as defaults.

The builder option `name` now reaches the builder (`describe().name`). Before, it was passed to
class-validator as a validator option, which also made `transform: false` return
`classToPlain()` output instead of the payload.
