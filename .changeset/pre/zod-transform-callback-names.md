---
'@mimlet/zod': minor
'@mimlet/core': minor
---

When a Zod `.transform()`, refinement or other callback throws during
`buildValidated()`, the `BuilderValidationError` message now says which callback threw:
`Schema validation failed: 1 issue at (root); thrown by the Zod transform fromDto`.
The callback is named by its function name, or by its location when it is anonymous.

A `ZodError` thrown by a stricter parse of the whole DTO inside an application
transformer keeps its paths, as before, so the message names the field
(`1 issue at source`). A parse of a single value, such as
`z.literal('teamleader').parse(dto.source)`, has no path in Zod; the issue stays at the
root with Zod's message, and the field is not guessed from the rejected value.

When the schema has exactly one callback at a fixed location, such as
`z.object({ createdAt: z.string().transform(parseDate) })`, an error thrown there now
gets that location as its path (`createdAt`), and a `ZodError` from a transform on
`deal` gets it as a prefix (`deal.source`). With several callbacks the one that threw is
unknown, so nothing is prefixed and the message lists them. The original error is still
the `cause`.

`BuilderValidationError` accepts a second argument, `{ cause, detail }`. The detail is
appended to the message after a semicolon and is cut at 200 characters.

The builder `name` option no longer gives a Zod builder a generator of its own, so
`fromZod(schema, { name })` builders of one schema share it. Values are unchanged.
