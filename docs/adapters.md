# Find your adapter

Start with the schema and behavior you already use. Mimlet keeps the core small;
generation and native library integrations are opt-in.

| Your input or job                              | Package                                                          | What to expect                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A factory or Standard Schema validator         | [@mimlet/core](../packages/core/README.md)                       | Immutable builders, input/output typing, async capabilities, sessions and scenarios; provide the factory. |
| Modern `typebox`                               | [@mimlet/typebox](../packages/typebox/README.md)                 | Native creation, checking and codecs; explicit factory escape hatch.                                      |
| `@sinclair/typebox`                            | [@mimlet/typebox-legacy](../packages/typebox-legacy/README.md)   | Native legacy TypeBox and Transform semantics.                                                            |
| JSON Schema or Standard JSON Schema conversion | [@mimlet/json-schema](../packages/json-schema/README.md)         | Supported draft validation, profiles and bounded generation; inspect unsupported capabilities.            |
| Zod 4 / Zod Mini                               | [@mimlet/zod](../packages/zod/README.md)                         | Native parsing/codecs, explicit async validation, input generation and factories.                         |
| ArkType                                        | [@mimlet/arktype](../packages/arktype/README.md)                 | Native morphs/scopes, input checks, input generation and factories.                                       |
| Valibot                                        | [@mimlet/valibot](../packages/valibot/README.md)                 | Input conversion plus native parsing; factories for unsupported refinements.                              |
| class-validator DTOs (NestJS)                  | [@mimlet/class-validator](../packages/class-validator/README.md) | Payloads for e2e tests and the DTO instances `ValidationPipe` produces; factories provide the values.     |
| Effect 4 (Effect 3 through alpha.3)            | [@mimlet/effect](../packages/effect/README.md)                   | Native schemas, codecs, arbitraries and shrinking.                                                        |
| Realistic values                               | [@mimlet/faker](../packages/faker/README.md)                     | Explicit session-scoped randomness, locale and reference date.                                            |
| Property tests                                 | [@mimlet/fast-check](../packages/fast-check/README.md)           | Native shrinking, scenario recomputation and checked replay.                                              |
| OpenAPI / AsyncAPI                             | [@mimlet/api](../packages/api/README.md)                         | Operation/message fixtures and explicit serialization with offline references.                            |
| GraphQL                                        | [@mimlet/graphql](../packages/graphql/README.md)                 | Native input fixtures and selection-aware response fixtures.                                              |
| Protobuf                                       | [@mimlet/protobuf](../packages/protobuf/README.md)               | Native values, offline imports and binary codecs.                                                         |
| Avro                                           | [@mimlet/avro](../packages/avro/README.md)                       | Native values, unions, 64-bit integers and binary codecs.                                                 |
| Generated fluent builders                      | [@mimlet/codegen](../packages/codegen/README.md)                 | Deterministic classes, CLI checks, optional self-contained runtime.                                       |
| A local schema editor                          | [@mimlet/playground](../packages/playground/README.md)           | Loopback-only playground with bounded, interruptible workers.                                             |
| Your own adapter                               | [@mimlet/adapter](../packages/adapter/README.md)                 | Capability inspection and reusable conformance checks.                                                    |
| UI previews, HTTP mocks, test persistence      | [@mimlet/consumers](../packages/consumers/README.md)             | Explicit loaders, response resolvers and caller-owned persistence.                                        |
| Hey API generation                             | [hey-api-builders](../packages/hey-api-builders/README.md)       | The established plugin, now backed by the neutral core.                                                   |

The dedicated Zod and ArkType adapters are included in `0.1.0-alpha.1`. Follow the
[tested recipes](zod-and-arktype.md), or retain the core and Standard JSON Schema path
when those interfaces already meet your needs. The class-validator adapter was first
published as `0.1.0-beta.4`; see the [NestJS DTO guide](class-validator.md).

## Validation, conversion and generation are different

Standard Schema describes validation and input/output types. It does not itself
provide a generator or make arbitrary callbacks reversible. Conversion to JSON
Schema can lose constraints that only the native validator understands.

Use `buildValidated()` or its async counterpart when decoded, validated output is
required. Supply a factory when generation cannot faithfully express a constraint.
Inspect the package's capabilities before claiming codec, generation or shrinking
support. Pin the tested native-library versions in the [compatibility matrix](compatibility.md).

## Realistic values for tests

Adapters that generate through JSON Schema (`@mimlet/json-schema`, `@mimlet/zod`,
`@mimlet/valibot`, `@mimlet/arktype`, `@mimlet/api` and the JSON targets of
`@mimlet/codegen`) default to the `minimal` profile: optional fields are left out and an
unconstrained number can be anywhere in its range. `profile: 'realistic'` fills optional
and nullable fields, keeps arrays at one to three items, draws unconstrained numbers from
1 to 100 within the schema's bounds and writes plain strings as readable words:

<!-- recipe:realistic -->

The profile is part of the replay identity, and every value still passes the schema.
See [realistic values](../packages/json-schema/README.md#realistic-values) for the exact
rules. Fix the values a test depends on with `.with()`.

## Keep the meaningful relationships

Faker supplies realistic primitives. Mimlet builders fix the fields that matter;
scenarios connect related records. For property tests, shrink independent inputs
and recompute the dependent values. See the [agent recipes](agents.md) for executable
examples of these combinations.
