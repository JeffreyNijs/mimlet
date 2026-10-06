---
'@mimlet/core': minor
---

Add `scenario.patch(name, patcher)` to change the value a scenario node built while keeping
its factory and dependencies: `crm.patch('deal', (deal) => ({ ...deal, status: 'lost' }))`
keeps the deal's lead key and generated values, and nodes that depend on the deal see the
patched value. The patcher receives `(value, dependencies, session)` and returns a value of
the node's type. Patches run in order after the node's factory, override or trait. A later
override replaces the node and its patches, and a trait that would replace a patched node
fails with `SCENARIO_CONFLICT` unless it passes `{ replaceConflicts: true }`. An async
patcher makes the scenario async-only. `describe()` reports each node's `patches` count.
