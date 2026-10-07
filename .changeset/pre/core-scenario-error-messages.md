---
'@mimlet/core': patch
---

A failed scenario node now explains itself in the error message instead of only in `cause`.
The message names the node, the step that failed and the cause's message, on one line and cut
at 200 characters. Before, every failure read `ScenarioError: Scenario node failed`. Now, for
example:

```text
Scenario node "deal" failed in patch 1: A patch of deal returned a plain object in place of a Deal instance; pass the changed fields, as in patch('deal', { ... }), to keep the class, or return a Deal
```

The step is the node's factory (no step in the message), `in its override`,
`in trait "name"` or `in patch 2`. A failed dependency is named as the failed node, because
the nodes after it never run. `code` (`SCENARIO_EXECUTION`), `node` and `cause` are unchanged.
The message repeats the cause's message, so an error that your own factory or patcher throws
now appears in it as written; Mimlet's own errors keep fixture values out of their messages.
Definition and conflict errors now end with the node's name, as in
`Scenario dependency or replacement names an unknown node: "custmer"` and
`Trait conflicts with an existing node patch: "deal"`. Tests that compare a scenario error
message with `'Scenario node failed'` need updating; check `code` and `node` instead.
