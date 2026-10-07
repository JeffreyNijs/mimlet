---
'@mimlet/zod': patch
---

The error for a throwing Zod transform or refinement now shows the callback's name
whatever it is. Before, only plain identifiers were shown, so a transform named
`LeadIndex.toModel` (a name set with `Object.defineProperty()`, for example) was
reported by location as `thrown by the Zod transform at (root)`. It now reads
`thrown by the Zod transform LeadIndex.toModel`. Names that are not an identifier or a
dotted path of identifiers are shown as a JSON string, such as
`thrown by the Zod transform "to model"`. Control, line-break and invisible formatting
characters are removed, names are cut to 100 characters, and a function without a
usable name is still named by its location. When the list of callbacks is longer than
the message keeps, it now ends in `...` and is never cut inside a character.
