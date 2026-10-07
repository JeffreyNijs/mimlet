# Class facades and explicit paths

`createBuilderClass(factory, options)` creates a base class backed by the same
immutable runtime as `createBuilder`. `createSchemaBuilderClass(schema, factory,
options)` retains separate input/output types. `builderClass(() => builder)` also
wraps a prepared native adapter or an already configured builder.

```ts
class UserBuilder extends createBuilderClass((id: number) => ({ id, name: '' })) {
  withName(name: string) {
    return this.with({ name });
  }
}
const users = new UserBuilder().withName('Ada').with({ id: 1 });
const user = users.build(2);
const asynchronous = users.transformAsync(async (value) => value).withName('Grace');
const other = await asynchronous.buildAsync(3);
```

Ordinary and schema methods retain subclass fluent methods; asynchronous
transitions remove synchronous build methods in the type system, including after
custom fluent methods. Factories are not invoked when configuring a branch.
Required, optional, and multiple factory arguments remain unchanged. Construction
accepts an optional initial patch, where omitted/undefined means no initial patch.

Facades are for generated or method-only subclasses. Branches preserve the
prototype and copy own property descriptors, without rerunning constructors.
They do not clone subclass private fields or bind instance arrow functions to a
new instance. Keep application state in the fixture/factory, not private subclass
fields. The runtime state itself is held in a private WeakMap.

## Generated named setters

`mimlet generate` (and `emitBuilders`, `emitJsonSchemaBuilders` or `emitOpenApiBuilders`
in [`@mimlet/codegen`](../packages/codegen/README.md)) writes one such facade per builder,
with a `withX()` helper for each selected field. For an OpenAPI document, an `openapi`
entry in the configuration emits one builder per component schema; see
[OpenAPI documents](../packages/codegen/README.md#openapi-documents). Each helper accepts exactly what
`with()` accepts for that property, like [`fluent()` setters](fluent-builders.md). For a
factory that returns `{ customerId: string; couponCode?: string }`:

```ts
new CartBuilder().withCouponCode('WELCOME10');
new CartBuilder().omit('couponCode'); // leaves the key out
// With exactOptionalPropertyTypes, both of these are type errors:
new CartBuilder().withCouponCode(undefined);
new CartBuilder().with({ couponCode: undefined });
```

A property that includes `undefined` in its type, such as `note?: string | undefined`,
still accepts it. Root object unions and nullable root objects get no usable helpers;
use `replace()` with a complete value. When an upgrade changes the emitted code,
`mimlet generate --check` reports drift until you run `mimlet generate` once and commit
the regenerated files.

## Typed nested changes

Use `setPath(value, path, replacement)` and `omitPath(value, path)` inside an
explicit transform. Only the containers along the path are copied. Arrays are
indexed numerically, tuples retain index bounds, and array omission is forbidden.
Optional-property omission is distinct from null or undefined. An absent
intermediate is an error: replace its complete parent instead. Unions and native
values are atomic; a path cannot change only a discriminant and invent a complete
variant. Paths are limited to eight segments, and type checking validates the
supplied path without enumerating the entire application type graph.

```ts
const users = createBuilder(() => ({ profile: { name: 'Ada' }, roles: ['reader'] }));
const admins = users.transform((value) => setPath(value, ['roles', 0], 'admin'));
```

Only own data properties of arrays and plain records are traversed. Inherited
properties and accessors are rejected. Null-prototype records, symbol keys, and
prototype-looking own keys are handled without invoking prototype setters.
Unchanged nested values retain their identity; use the existing clone policy
when complete fixture isolation is desired.

A transform runs after every patch. For a named setter that changes one nested
value in call order with the other patches, use a `fluent()` path alias such as
`fluent(users, { withName: ['profile', 'name'] })`; it follows the same copying
rules. See [setters for nested fields](fluent-builders.md#setters-for-nested-fields).
