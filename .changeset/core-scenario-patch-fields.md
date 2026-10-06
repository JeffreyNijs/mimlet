---
'@mimlet/core': minor
---

`scenario.patch(name, fields)` sets fields of a node's value: `crm.patch('deal', { status: 'sent' })`.
The fields are checked against the node's data fields, so `{ stauts: 'sent' }` is a compile
error. Each build copies the value with the same prototype and own properties and sets the
fields the way `createInstanceBuilder()` sets a record's fields (a setter on the class runs, a
getter without a setter fails the node), so a class instance stays an instance of its class and
the factory's value is never changed. No constructor runs for the copy, so `#private` fields do
not exist on it. The form works for plain records too and keeps a synchronous scenario
synchronous.

A patcher function that returns a plain object for a class instance, such as
`(deal) => ({ ...deal, status })`, now fails the node with
`A patch of deal returned a plain object in place of a Deal instance`. TypeScript accepts that
spread for a class without methods, and the node silently stopped being a `Deal`. Changing the
instance or returning another instance of the class still works.
