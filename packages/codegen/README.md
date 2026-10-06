# Standalone code generation

Emit deterministic named builder classes from typed factory modules, configured
builder modules, Standard Schema plus a factory, Standard JSON Schema, TypeBox
(both lines), Valibot, Effect, raw JSON Schema, or the component schemas of an
OpenAPI document. Application modules are not executed while emitting source. Their
declarations are resolved when the consumer compiles the generated TypeScript.

```ts
const files = emitBuilders([
  {
    name: 'UserBuilder',
    source: { kind: 'factory', module: '../models.js', export: 'makeUser' },
    fields: ['id', 'name'],
  },
]);
await writeGenerated('./generated', files);
```

`emitJsonSchemaBuilders` emits structural declarations from the same schema used
for fixture generation and validation. Runtime constraints such as patterns and
number bounds are still checked by the original validator, not represented as
fictional TypeScript guarantees. References are supplied explicitly in memory;
filesystem and network resolution are disabled. Module-based schemas retain
native inferred input/output types and factory arguments.

The CLI accepts only data-only JSON:

```sh
mimlet --config builders.json --out generated
mimlet --config builders.json --out generated --check
mimlet --config builders.json --out generated --self-contained --select UserBuilder
```

The configuration has `builders` and/or `schemas` arrays matching the public API,
and an optional `openapi` entry (see below). Module specifiers are relative to the
generated files, not the configuration. Selection defines the desired generated file
set. Native schema fields can be specified explicitly; existing typed `.with()` works
without property helpers. A JSON schema property that cannot be set (its schema is
`false`, such as a read-only property of a request) gets no `withX()` helper.

Each generated `withX()` helper accepts exactly what `.with()` accepts for that
property, like core `fluent()` setters. With `exactOptionalPropertyTypes`, an optional
property such as `couponCode?: string` rejects `withCouponCode(undefined)`: leave it
out or call `omit('couponCode')` instead. A property declared as
`note?: string | undefined` still accepts `undefined`. A generated file with helpers
declares one local, unexported `BuilderSetterValue` type for them.

Self-contained mode copies the installed canonical core's JavaScript,
declarations and attribution, not a second runtime implementation. It removes
the core dependency for factory-only output. Native adapters and external factory
imports retain their own dependencies; arbitrary closures are not serialized.

The output manifest stores content hashes. Regeneration skips identical files,
refuses handwritten/modified-file overwrites, and removes only previously owned
stale files. `--check` never creates or writes files. Writes are atomic per file,
not a multi-file filesystem transaction. Generation assumes exclusive access to
the output directory; concurrent writers and hostile filesystem races are not
supported. Paths are bounded, relative and checked for symlinks. Do not edit the
manifest to bypass ownership protection.

An upgrade of `@mimlet/codegen` can change the emitted code. `--check` then reports
`GENERATED_FILES_OUTDATED` until you run the same command once without `--check`. That
run rewrites the generated files it owns that you have not edited; commit the result.
It still refuses to overwrite a hand-edited generated file.

Individual package manifests are versioned with the coordinated release train; publication is a separate operation.

## OpenAPI documents

Builders for the component schemas (`#/components/schemas/<name>`) of an OpenAPI 3.0,
3.1 or 3.2 document use the projection of `@mimlet/api`: OpenAPI 3.0 `nullable` (also
NestJS's `{ nullable: true, allOf: [{ $ref }] }`) and exclusive bounds, 3.1 reference
siblings, references between components, and request or response handling of
`readOnly` and `writeOnly`. Raw OpenAPI component schemas are not JSON Schema, so
passing them to `emitJsonSchemaBuilders` fails on keywords such as `nullable`.

Add an `openapi` entry to the CLI configuration:

```json
{
  "openapi": {
    "document": "./openapi.json",
    "schemas": [
      "CreateDealCommand",
      { "schema": "DealDto", "name": "DealResponse", "direction": "response" }
    ],
    "direction": "request",
    "options": { "profile": "realistic" },
    "closedObjects": true
  }
}
```

| Field           | Meaning                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`      | A JSON OpenAPI document of at most 16 MB. The path is relative to the configuration file. Convert a YAML document to JSON first.                                                                   |
| `schemas`       | `"all"`, or a list of component names and `{ "schema", "name"?, "direction"? }` entries.                                                                                                           |
| `name`          | The builder class name. The default is the component name in PascalCase plus `Builder`: `create-deal.command` becomes `CreateDealCommandBuilder`, with input type `CreateDealCommandBuilderInput`. |
| `direction`     | `"response"` (the default) leaves out `writeOnly` properties, `"request"` leaves out `readOnly` ones. An entry's direction overrides the document's.                                               |
| `options`       | Data-only generation settings for every builder of the document: `profile`, `maxArrayLength`, `maxStringLength`, `maxValueDepth` and `maxAttempts`.                                                |
| `closedObjects` | `true` types object schemas that declare properties but not `additionalProperties` without an index signature. See [closed object types](#closed-object-types).                                    |

`openapi` can also be a list of such entries, one per document. Each generated file
contains the projected schema with the components it references as definitions, and
TypeScript declarations named after those components (`facade: FacadeDto | null`).
`--check`, `--select` and generated-file ownership work as for other builders: a changed
document is reported as `GENERATED_FILES_OUTDATED`. An unreadable document, an unknown
component or a component schema that cannot be prepared stops the command with exit
code 2 and a `CLI_USAGE_ERROR` that names the document and the component. For example,
`OpenAPI document "./openapi.json": OpenAPI component schema "Odd" (OddBuilder): Unknown format at /format`.

An entry of the wrong shape is shown with the entry it most likely means. `name` is the
builder class name and `schema` the component, so `{ "name": "DealDto", "direction": "request" }`
fails with
`schemas[0] is {"name":"DealDto","direction":"request"}. Did you mean {"schema":"DealDto","direction":"request"}?`.
An unknown component written as a reference (`#/components/schemas/DealDto`) or with other
letter case is reported with the component's name.

### Closed object types

In OpenAPI, an object schema without `additionalProperties` allows properties it does not
declare, so its generated type has an index signature:

```ts
export interface DealDto {
  id: string;
  title: string;
  [k: string]: unknown;
}
```

NestJS's Swagger module never writes `additionalProperties: false`, so every type from such
a document is open: it does not fit an application's own DTO and entity types, and a
misspelled key in `.with()` is not a type error. `"closedObjects": true` types each object
schema that declares at least one property and none of `additionalProperties`,
`patternProperties` and `unevaluatedProperties` as closed. An object schema without
properties (a free-form `{ "type": "object" }` or `"properties": {}`) and declared additional
properties keep their index signature.

Only the types change. The schema embedded in the generated file, which generation and
`buildValidated()` use, keeps the document's rules: validation still accepts undeclared
properties, as the API does. Generation never adds undeclared properties, so built values
fit the closed types. Closing the runtime schema as well would differ from the document,
and with `allOf` (each member would reject the properties of the others) it would reject
valid values. To validate closed objects, declare `additionalProperties: false` in the
document itself, for example by changing the NestJS document before writing it.

A setter patches a single property with `.with({ [property]: value })`. `.with()` takes a
`Partial` of a plain object type, so for a closed root object the setters have no type
assertion. For a type with an index signature, `.with()` takes a whole value, and for a
nullable or union root it takes none, so those setters keep an `as BuilderPatch<...>` cast.

### Branded ids

OpenAPI has no branded or nominal types: an id is `type: string`, maybe with
`format: uuid`, and the generated type is `string`. There is no type override map. Brand the
values where your code needs them, for example:

```ts
type DealId = string & { readonly __brand: 'DealId' };
const dealResponse = (builder = new DealDtoBuilder()) => {
  const deal = builder.buildValidated();
  return { ...deal, id: deal.id as DealId };
};
```

For an entity class with branded fields, build the entity with `createInstanceBuilder()`
from `@mimlet/core` and keep the generated builder for the HTTP payload.

From code, `emitOpenApiBuilders(document, selection, emitOptions?)` takes the parsed
document, or the object a framework builds in memory: properties whose value is
`undefined` are left out. The selection is the same as the `openapi` entry without
`document`. For example, in a NestJS script that already creates the application:

```ts
const document = SwaggerModule.createDocument(app, config);
const files = await emitOpenApiBuilders(document, {
  schemas: ['CreateDealCommand'],
  direction: 'request',
  options: { profile: 'realistic' },
  closedObjects: true,
});
await writeGenerated('./test/builders', files);
```

`openApiBuilderTargets(document, selection)` returns the JSON builder targets, with
their `component` and `direction`, for `emitJsonSchemaBuilders`. A JSON builder target
(also in the configuration's `schemas` list) takes `closedObjects: true` too.
`openApiBuilderName(component)` returns the default class name.

## Local diagnostics

Alpha.2 adds `mimlet doctor`, `mimlet inspect`, `--version` and
opt-in JSON reports. See [CLI diagnostics](https://jeffreynijs.github.io/mimlet/guide/cli-diagnostics.html) for
contracts, limitations and version-specific availability.

## Other exports

- `diagnoseProject(directory?)` (async) and `inspectSchema(schema, options?)` build the
  reports behind `mimlet doctor` and `mimlet inspect`. `reportStatus(diagnostics)`
  returns `false` when any diagnostic has severity `error`, the rule that sets a
  report's `ok`. Use it after filtering or combining diagnostics yourself.
- `selfContainedRuntime(prefix = 'builder-runtime')` (advanced) returns the files
  that `--self-contained` adds: the installed `@mimlet/core` JavaScript,
  declarations, `LICENSE` and `THIRD_PARTY_NOTICES.md` under `<prefix>/`. Write them
  with `writeGenerated` next to builders emitted with
  `{ runtimeModule: './builder-runtime/index.js' }`.
