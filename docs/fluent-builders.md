# Named setters on direct builders

Available since `0.1.0-alpha.2`. Use [matching published packages](getting-started.md)
and declare a builder beside your test; no builder file or code generation is required.

Generated ordinary-record builders already have named methods such as
`withName()`. For direct builders, opt into the fields you want:

<!-- recipe:fluent -->

The setters use the schema's **input** types. Validation returns its native output
type, and async transformations remove synchronous build methods while preserving
the named setters. The wrapper uses the existing immutable class facade; choosing
fields does not execute the factory or inspect a native schema.

For a custom spelling, pass a literal method-to-field map:

```ts
const named = fluent(builder, { withUserName: 'user_name' });
```

Literal field tuples and alias maps are checked against finite, ordinary object
records. Runtime-length inventories, index signatures, atomic values, arrays,
nullable root objects and root object unions cannot acquire unsound partial setters.
Use `.replace()` for variant transitions. For typed nested updates, use
[`setPath` inside `.transform()`](generated-facades-and-paths.md#typed-nested-changes).
Names that collide with builder/prototype methods, `then` or `toJSON` are rejected.

Automatic names capitalize alphanumeric segments, matching standalone codegen.
Selections contain 1–1,000 fields. Automatic field names allow up to 64 characters;
explicit aliases allow a 1,024-character field and a 128-character method name.
Duplicate fields, colliding names, getters and sparse arrays are rejected before
factory execution.

## A setter for every schema field

Each schema adapter can list an object schema's top-level input fields. Pass that
list to `fluent()` in place of a tuple, and every field gets a setter. This works
inside generic helpers, so a helper shared by many schemas needs no field lists and
its callers need no casts. Schema field lists need `0.1.0-beta.1` or newer.

<!-- recipe:fluent-fields -->

| Adapter                  | Field list                         | Reads                                      |
| ------------------------ | ---------------------------------- | ------------------------------------------ |
| `@mimlet/typebox`        | `typeBoxFields(schema)`            | `schema.properties`                        |
| `@mimlet/typebox-legacy` | `typeBoxFields(schema)`            | `schema.properties`                        |
| `@mimlet/zod`            | `zodFields(schema)`                | the object's shape, through `.transform()` |
| `@mimlet/valibot`        | `valibotFields(schema)`            | `schema.entries`, also after `v.pipe()`    |
| `@mimlet/arktype`        | `arkTypeFields(schema)`            | `schema.in.props`, also for morphs         |
| `@mimlet/effect`         | `effectFields(schema)`             | the struct's encoded keys                  |
| `@mimlet/json-schema`    | `standardJsonSchemaFields(schema)` | the input JSON Schema's `properties`       |

In a generic helper, type the schema parameter as an object schema of that library:
`S extends TObject` (TypeBox), `S extends z.ZodObject` (Zod),
`S extends v.ObjectSchema<v.ObjectEntries, undefined>` (Valibot),
`S extends Type<object>` (ArkType), or `schema: Schema.Codec<A, I>` with
`I extends object` (Effect). The setter types resolve where the helper is called.

The functions read the schema only. They never run a factory or generate data, so
they also work with factory builders such as `fromZodFactory()` and
`fromTypeBoxVariant()` (pass the selected branch, for example
`typeBoxFields(Pet.anyOf[1])`). Builders take **input**, so the lists name input
keys: Effect keys renamed with `Schema.encodeKeys` are listed by their encoded name,
and a Zod or ArkType pipe lists the keys of the object it receives.

The setters follow the same rules as a tuple: input types, `.with()` semantics for
optional keys under `exactOptionalPropertyTypes`, validation, async transitions and
factory arguments. A schema list cannot take aliases, so `fluent()` skips the names
it could not add without guessing, and TypeScript leaves them out too:

- a name that two fields share, such as `first-name` and `first_name`
  (`withFirstName()`), is skipped for both;
- a name that is a builder method is skipped: a field named `factory` leaves
  `withFactory()` as the builder method;
- a field name longer than 64 characters gets no setter.

Set those fields with `.with()`, or give them an alias in an explicit map. A list
holds 1 to 1,000 fields, so an empty object schema is rejected.

Inputs that cannot be patched one field at a time get no setters, as with tuples:
index signatures (for example Zod `looseObject()` or Valibot `looseObject()`),
root unions, nullable roots and arrays. The field functions throw a `TypeError` for
schemas that have no object properties to list, such as unions, primitives and
references.

### Builders that cannot list their fields

`createBuilder()` factories, `createSchemaBuilder()` with a plain Standard Schema,
raw `fromJsonSchema()` (whose input type is `unknown`) and custom builders have no
schema to read. Pass an explicit tuple to them. Generated codegen and Hey API
classes already have setters. A plain array such as `Object.keys(schema.properties)`
is still rejected: its type cannot promise which fields exist at runtime.

Setters for every field can hide which fields a test cares about. For a builder that
many tests share, a short explicit tuple still documents intent better; schema lists
suit generic row helpers and builders with many interchangeable fields.

### Adapter authors

`schemaFields(names)` from `@mimlet/core` marks a list as a schema's complete
top-level input fields; `fluent()` accepts the result. Read the names from the
schema, never from a fixture, and list every field: a missing name would type a
setter that does not exist at runtime. Type the result with the schema's input keys,
for example `schemaFields(Object.keys(shape) as Extract<keyof Input, string>[])`.

## Nesting combines setters

`fluent()` keeps the methods of the builder it wraps, so calls can be nested. A
shared helper can give every model a setter per field, and a builder can add its
own tuple or aliases on top, as `payments` does in the recipe above:

```ts
const payments = fluent(rows(Order), { withReference: 'id' });
payments.withReference('pay-7').withStatus('PAID'); // withStatus() comes from rows()
```

`fluent(fluent(builder, a), b)` behaves like one builder with the setters of `a` and
`b`, in the types and at runtime. Both sets survive `.with()`, `.replace()`,
`.withFactory()`, `.omit()`, `.transform()`, async transitions, validation and every
build method, and each setter returns the outer builder. Methods of a generated or
hand-written class facade are kept the same way; its instance fields and getters
are not. Nested setters need `0.1.0-beta.2` or newer; earlier versions dropped the
inner setters.

A new name for a field that already has a setter is allowed, and both setters
exist. When the outer call names a method the wrapped builder already has:

| The name belongs to                           | Tuple or alias map              | Schema field list                  |
| --------------------------------------------- | ------------------------------- | ---------------------------------- |
| an inner `fluent()` setter for the same field | allowed, adds nothing           | skipped                            |
| an inner `fluent()` setter for another field  | throws a `TypeError`            | skipped, the inner setter keeps it |
| a method of a generated or hand-written class | replaces the method, as before  | skipped, the class method keeps it |
| a builder method such as `withFactory()`      | throws a `TypeError`, as before | skipped, as before                 |

So `fluent(rows(Order), ['id'])` is fine, and `fluent(new CartBuilder(), ['couponCode'])`
still replaces the generated `withCouponCode()` with a setter for `couponCode`, in
the types too. The replacing setter survives the same operations as any other.

Explicit tuples and alias maps need a concrete input type, nested or not, so a
generic helper cannot add one: add it where the helper is called. Nested schema
field lists work inside generic helpers.

## Checked-in classes

For classes that should be checked into a project, use
[generated facades](generated-facades-and-paths.md). Generic `.with()` remains the
smallest API when named methods do not make a test clearer.
