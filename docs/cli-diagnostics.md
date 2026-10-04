# Diagnostics for people and coding agents

Available in `@mimlet/codegen@0.1.0-alpha.2` and later. The earlier alpha.1
executable only provides generation commands.

```sh
mimlet doctor --project . --json
mimlet inspect --schema ./schema.json --json
mimlet generate --config ./builders.json --out ./generated --check --json
mimlet --version
```

The original `mimlet --config ... --out ...` syntax is retained. `--json` selects
a machine-readable report; ordinary commands keep concise human-readable output.

## Check installed dependencies

`doctor` reads project and installed package manifests without importing app code,
running lifecycle scripts or contacting the registry. It checks installed Mimlet
packages, dependency/peer ranges, Node engine ranges and matching release trains.
Workspace symlinks and ordinary Node-style ancestor resolution are supported.
Missing optional dependencies are allowed; installed optional peers must match.

This is a dependency metadata check, not a proof that every export works, the
application compiles or its tests pass. npm tags and workspace selectors are not
resolved over the network. Unsupported or malformed manifests fail with actionable
diagnostics rather than exposing their contents.

## Inspect a JSON schema without sampling

`inspect` prepares the supported JSON Schema dialect and reports its fingerprint
and capabilities. It does not sample data, execute a native schema module, fetch
references or prove that a schema is satisfiable. Reports explicitly include
`sampled: false`. Even a boolean `false` schema can be prepared successfully while
accepting no values.

Use `--references refs.json` for an explicit offline reference map, and
`--dialect draft-07`, `draft-2019-09` or `draft-2020-12` when needed. CLI JSON input
files are capped at 2 MB. Unsupported assertions report their schema location.

The reference map can hold a whole component set, for example every schema extracted
from an OpenAPI document. Only the references the schema reaches, directly or through
other references, are prepared. An unrelated reference that uses an unsupported
keyword, such as OpenAPI's `discriminator`, does not fail the inspected schema. When a
reference the schema uses fails, the diagnostic's `reference` field names it and
`schemaPath` is relative to that reference. A `$ref` that was not supplied is named in
the message and in `missingReference`, and `schemaPath` points at the `$ref`:

```json
{
  "code": "SCHEMA_PREPARATION_FAILED",
  "message": "Unresolved reference https://schemas.shop.example/Customer.json at /properties/customer/$ref",
  "schemaPath": "/properties/customer/$ref",
  "missingReference": "https://schemas.shop.example/Customer.json"
}
```

Unknown failures and malformed JSON do not print fixture/schema values by default.
The only schema values a diagnostic repeats are keyword names, reference URIs and
property names that form a schema location.

## Report and exit contracts

Reports contain `format: "mimlet/diagnostics"`, `version: 1`, `command`, `ok` and
`diagnostics`. Entries contain a `code`, `severity`, `message` and `hint`, with
optional package/dependency/version or schema-path context. `inspect` entries can
also carry `reference` (the supplied reference that `schemaPath` points into) and
`missingReference` (a `$ref` target that was not supplied). Consumers should check
the format and version, branch on codes, and tolerate added fields/codes.

| Exit | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | The requested check succeeded; warnings may still be present.         |
| 1    | Dependency/schema diagnostics or generated-file drift need attention. |
| 2    | Invalid invocation or input prevented the command from running.       |

### Diagnostic codes

Branch on these codes, not on message text. New codes may be added. Errors thrown by the packages themselves are listed in [error codes](error-codes.md).

| Code                          | Command    | Severity | Meaning                                                                        |
| ----------------------------- | ---------- | -------- | ------------------------------------------------------------------------------ |
| `PROJECT_NOT_FOUND`           | `doctor`   | error    | No `package.json` in the selected project.                                     |
| `NO_MIMLET_PACKAGES`          | `doctor`   | warning  | The project declares no Mimlet packages.                                       |
| `PACKAGE_NOT_INSTALLED`       | `doctor`   | error    | A declared Mimlet package is not installed.                                    |
| `DECLARED_VERSION_MISMATCH`   | `doctor`   | error    | The installed package does not satisfy `package.json`.                         |
| `NODE_VERSION_UNSUPPORTED`    | `doctor`   | error    | The running Node version does not satisfy a package's engines.                 |
| `PEER_NOT_INSTALLED`          | `doctor`   | error    | A required peer dependency of a Mimlet package is missing.                     |
| `PEER_VERSION_UNSUPPORTED`    | `doctor`   | error    | An installed peer is outside the adapter's supported range.                    |
| `TOOLKIT_DEPENDENCY_MISMATCH` | `doctor`   | error    | An internal toolkit dependency is missing or incompatible.                     |
| `MIXED_TOOLKIT_RELEASES`      | `doctor`   | warning  | More than one scoped Mimlet release version is installed.                      |
| `PROJECT_INSPECTION_FAILED`   | `doctor`   | error    | Package metadata could not be inspected safely; no project code was executed.  |
| `SCHEMA_PREPARATION_FAILED`   | `inspect`  | error    | The schema, or a reference it uses, could not be prepared for generation.      |
| `GENERATED_FILES_OUTDATED`    | `generate` | error    | `--check` found generated output that differs from the declared configuration. |
| `CLI_USAGE_ERROR`             | any        | error    | Invalid arguments or input prevented the command from running (exit 2).        |
| `COMMAND_FAILED`              | any        | error    | The requested operation failed for another reason.                             |

`generate --check` never changes generated output. `diagnoseProject` and
`inspectSchema` are also exported from `@mimlet/codegen` for Node tooling. The
dependency-free core does not import the CLI or its filesystem/versioning helpers.
