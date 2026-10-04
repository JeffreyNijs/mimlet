# Native GraphQL fixtures

`graphqlAdapter(schemaSDL, operationText, options)` prepares GraphQL variable and
response fixtures with the pinned `graphql@17.0.2` reference implementation. The
adapter accepts text, not a live schema carrying application resolvers. It performs
no HTTP, database, subscription-source, or other network operation.

```ts
const operation = graphqlAdapter(
  'type User { id: ID! name: String! } type Query { user(id: ID!): User! }',
  'query ($id: ID!) { user(id: $id) { id name } }',
  {
    fieldsIdentity: 'user-fixtures/v1',
    fields: { 'Query.user': ({ args }) => ({ id: args.id, name: 'Ada' }) },
  }
);
const variables = operation.variables.builder().build();
const response = operation.response(variables).builder().buildValidated();
```

`variables.create()` builds encoded input. Its Standard Schema wrapper returns
native coerced variables, including operation/input-field defaults, scalar parsing,
input-object validation and oneOf semantics. Required/optional input properties
are distinct. Runtime SDL does not establish a TypeScript application model: maps
remain `Record<string, unknown>`. Use generated application types explicitly at
an independently checked boundary, rather than an unchecked generic cast.

`response(encodedVariables)` takes the encoded variables returned by `build()` or
`create()`, not the coerced output of `buildValidated()`: coerced custom-scalar
values such as a `Date` are rejected with "Expected a variable or response object".
Use `variables.check()` to validate encoded variables, for example after `.with()`
overrides. The returned object offers `create`, `check`, `issues`, `standard`, and
`builder`. The native executor implements aliases, fragments, include/skip,
argument coercion, enum serialization and null propagation. Explicit field-factory
results retain supplied child values and relationships. Missing child values use
ordinary generation. Field factories use schema coordinates, receive already
coerced arguments and a named generation stream, and never receive a live resolver
context. `result()` returns a native-shaped data/errors result for deliberate
error-fixture work; `response().create()` rejects execution errors.

Response validation checks the **selected wire shape**, including absence of extra
fields and canonical scalar encodings. Abstract types use a supplied `__typename`,
a configured `abstractTypes` selection, or the first declared possible type. Select
`__typename` in the operation, or configure its concrete type, when validating a
non-default abstract variant that is not otherwise identified in the response.
Mutations and individual subscription-event responses are fixtures only: neither
application mutations nor subscription streams are executed.

Custom scalars require paired, versioned `input`, `output`, `parseInput`, `serialize`,
and `parseOutput` callbacks. Input generators return encoded variables; output
generators return internal resolver values. Response checks decode serialized
values through `parseOutput` before native output coercion, then require the same
wire representation. For example, an ISO timestamp can parse to a Date and
serialize back to an ISO string without treating the Date as wire JSON.

Profiles are minimal, random and boundary. Lists have an explicit bounded length.
Recursive inputs terminate at nullable/list boundaries within resource budgets;
non-null structures that cannot fit fail rather than being silently weakened.
Schemas and operations have character/token bounds, and execution has field/depth
and data-allocation bounds. These checks are not an interruptible sandbox for
hostile native callbacks or pathological parser workloads. Callbacks are trusted,
pure and synchronous; validation can invoke them more than once. Promise results
are rejected and their rejections observed.

Sessions reproduce generation with the same schema, operation, options, factory
identities and **original encoded variables**. Preserve those variables and callback
implementations alongside the replay record. Fixed field streams avoid unrelated
field-consumption coupling; cross-version output stability is not promised.

Introspection and custom/incremental executable directives are rejected in this
fixture path rather than partially emulated. Use explicit execution integrations
for their transport semantics. Schema and operation validation failures describe only
SDL and operation text, so their issues keep GraphQL's message (up to 300 characters)
and locations, and the error message repeats the first one, for example
`GraphQL operation validation failed: Cannot query field "nope" on type "Q".`.
Variable and response issues preserve locations/response paths without echoing
variable contents or custom exception messages. A schema with a custom scalar but no
`scalars` entry fails with a message that names each missing scalar. Parsing errors
retain their cause for deliberate diagnostics.

The compatibility suite installs built tarballs in an isolated consumer, checks
public declarations without DOM types, and tests the native runtime rather than a
mock. Individual packages are prepared for coordinated publication; no publication is implied by this source.

## Other exports

- `fromGraphQLVariables(schemaSDL, operationText, options?)` returns
  `graphqlAdapter(schemaSDL, operationText, options).variables.builder()`.
- `fromGraphQLResponse(schemaSDL, operationText, variables?, options?)` returns
  `graphqlAdapter(schemaSDL, operationText, options).response(variables).builder()`.
  The variables are the third positional argument and must be encoded, as for
  `response()`.
