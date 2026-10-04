# Error codes

Mimlet errors that callers may need to handle carry a stable `code`. Branch on the
error class or its `code`, never on the message: message wording, stack traces and
`cause` chains can change. The [stability contract](stability.md) treats these codes
as machine-readable API. New codes may be added; existing codes keep their meaning.
CLI reports use a separate set of [diagnostic codes](cli-diagnostics.md#diagnostic-codes).

Some guards are plain `TypeError`s without a code, for example a missing session for
Effect or Faker builders, or loading `@mimlet/effect` with Effect 3. Treat those as
programming errors, not states to branch on.

## Core (`@mimlet/core`)

| Class                    | Code                       | When                                                                                                                  |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `BuilderValidationError` | `VALIDATION_FAILED`        | A validated build was rejected by its schema. The validator's issues are on the non-enumerable `issues` property.     |
| `BuilderGenerationError` | `GENERATION_FAILED`        | Generation could not produce a value, for example a selected union variant that does not satisfy the enclosing union. |
| `BuilderPathError`       | `INVALID_BUILDER_PATH`     | A typed path operation received a path that does not exist on the value. Extends `TypeError`.                         |
| `FixtureCaptureError`    | `UNSUPPORTED_FIXTURE`      | Capture met a value it cannot record, such as a class instance, function, accessor, promise or weak collection.       |
|                          | `CAPTURE_LIMIT`            | Capture exceeded its size or depth budget.                                                                            |
|                          | `INVALID_CAPTURE`          | A capture record being restored is malformed or uses an unsupported format.                                           |
| `ScenarioError`          | `SCENARIO_DEFINITION`      | A scenario definition is invalid. The error names the node.                                                           |
|                          | `SCENARIO_CONFLICT`        | A trait was applied twice, or conflicts with an existing node override.                                               |
|                          | `SCENARIO_EXECUTION`       | A scenario node failed while building; the original error is the `cause`.                                             |
| `SessionBudgetError`     | `SESSION_BUDGET_EXHAUSTED` | A generation session ran out of its operation, tracked-key, unique-value or uniqueness-attempt budget.                |
| `SessionReplayError`     | `INVALID_SESSION_REPLAY`   | A session replay is malformed, or its fingerprint, provider/version or configuration does not match.                  |

A `BuilderValidationError` message names the issue count and up to three failing
paths, for example `Schema validation failed: 2 issues at owner.email, items[0].price`.
It never includes native issue messages, which can repeat the rejected value. Read
the non-enumerable `issues` property, or call `formatValidationIssues(error, { messages: true })`,
to see them. See [validation diagnostics](../packages/core/README.md#validation-diagnostics).

## Adapters and schema packages

| Package               | Class                      | Code                            | When                                                                                       |
| --------------------- | -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `@mimlet/adapter`     | `AdapterDefinitionError`   | `INVALID_ADAPTER_DEFINITION`    | `defineAdapter` received invalid metadata or operations. Extends `TypeError`.              |
| `@mimlet/json-schema` | `SchemaPreparationError`   | `SCHEMA_PREPARATION_FAILED`     | A schema or a reference it uses could not be prepared for generation.                      |
|                       | `SchemaGenerationError`    | `SCHEMA_GENERATION_FAILED`      | Bounded generation could not produce a valid value. This does not prove none exists.       |
|                       | `NegativeCaseError`        | `NEGATIVE_CASE_MISMATCH`        | A negative case did not fail validation with the expected number of issues.                |
| `@mimlet/faker`       | `FakerSessionError`        | `FAKER_SESSION_RECONFIGURATION` | Code tried to reseed a session-scoped Faker instance; create or restore a session instead. |
| `@mimlet/fast-check`  | `PropertyIntegrationError` | `PROPERTY_CONFIGURATION`        | A property check is misconfigured, for example without a fingerprint and provider/version. |
|                       |                            | `PROPERTY_REPLAY`               | A property replay's version, engine, identity or path does not match.                      |
|                       | `FixturePropertyError`     | `PROPERTY_FAILED`               | A fixture property failed; its `report` getter holds the counterexample and replay record. |

`SchemaPreparationError.schemaPath` locates the problem. When it is inside a supplied
reference, `reference` names that reference and the path is relative to it. When a
`$ref` resolves to nothing, `missingReference` names the target and `schemaPath`
points at the `$ref`. References the schema does not reach are not prepared.

## Protocol packages

| Package            | Class                  | Code                      | When                                                                                     |
| ------------------ | ---------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `@mimlet/api`      | `ApiContractError`     | `API_CONTRACT_FAILED`     | An OpenAPI or AsyncAPI document, operation or message cannot be used.                    |
| `@mimlet/graphql`  | `GraphQLFixtureError`  | `GRAPHQL_FIXTURE_FAILED`  | A GraphQL schema, operation or output type cannot be generated.                          |
| `@mimlet/protobuf` | `ProtobufFixtureError` | `PROTOBUF_FIXTURE_FAILED` | A Protobuf schema could not be prepared, or a message failed to decode.                  |
| `@mimlet/avro`     | `AvroFixtureError`     | `AVRO_FIXTURE_FAILED`     | An Avro schema failed to compile or a value does not fit it; the error carries the path. |

## Tooling

| Package              | Class             | Code                 | When                                                                               |
| -------------------- | ----------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `@mimlet/codegen`    | `CodegenError`    | `CODEGEN_FAILED`     | Generation arguments or configuration are invalid, or output could not be emitted. |
| `@mimlet/playground` | `PlaygroundError` | `INVALID_REQUEST`    | The playground received a malformed generation request.                            |
|                      |                   | `GENERATION_TIMEOUT` | Generation exceeded its time budget.                                               |
|                      |                   | `GENERATION_ABORTED` | Generation was cancelled.                                                          |
|                      |                   | `GENERATION_FAILED`  | Generation failed in the playground's child process.                               |
