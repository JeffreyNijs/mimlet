---
'@mimlet/core': minor
---

`BuilderValidationError` now names the failing fields in its message, so test-runner
output shows which values were rejected without catching the error:
`Schema validation failed: 2 issues at owner.email, items[0].price`. The message lists
the issue count and up to three distinct paths, shortens long keys and deep paths,
and also appears when the error is the `cause` of a `BuilderGenerationError`. Native
issue messages are still left out, because Valibot, ArkType and custom refinements
can repeat the rejected value. A key of a data-keyed record or an unexpected property
name can appear in a path.

The new `formatValidationIssues(errorOrIssues, { messages, limit })` prints one line
per issue for deliberate inspection, including native messages only when
`messages: true` is passed.
