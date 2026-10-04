---
'@mimlet/codegen': patch
---

Export `reportStatus()` as a callable function. It was re-exported with `export type`,
so TypeScript showed it but rejected calls to it and the JavaScript entry point did not
export it. The diagnostic types are still exported. `reportStatus(diagnostics)` returns
`false` when any diagnostic has severity `error`, the rule that sets a report's `ok`.
