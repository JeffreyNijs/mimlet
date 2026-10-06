---
'@mimlet/zod': minor
---

An error thrown inside a Zod `.transform()`, `.refine()` or other callback now makes
`buildValidated()` throw a `BuilderValidationError` with the original error as its
`cause`, instead of the bare error. A thrown `ZodError`, for example from `.parse()`
inside an application transformer, keeps its issues; any other error becomes one issue
at the root. Issues added with `ctx.addIssue({ path })` keep their path, so reporting
a rejected value that way names the field in the error message. Zod's own error for an
async callback in a synchronous build is still thrown unchanged.
