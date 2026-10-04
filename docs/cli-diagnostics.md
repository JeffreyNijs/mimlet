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
Unknown failures and malformed JSON do not print fixture/schema values by default.

## Report and exit contracts

Reports contain `format: "mimlet/diagnostics"`, `version: 1`, `command`, `ok` and
`diagnostics`. Entries contain a `code`, `severity`, `message` and `hint`, with
optional package/dependency/version or schema-path context. Consumers should check
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
| `SCHEMA_PREPARATION_FAILED`   | `inspect`  | error    | The schema could not be prepared for generation.                               |
| `GENERATED_FILES_OUTDATED`    | `generate` | error    | `--check` found generated output that differs from the declared configuration. |
| `CLI_USAGE_ERROR`             | any        | error    | Invalid arguments or input prevented the command from running (exit 2).        |
| `COMMAND_FAILED`              | any        | error    | The requested operation failed for another reason.                             |

`generate --check` never changes generated output. A Mimlet upgrade that changes
the emitted code is also reported as `GENERATED_FILES_OUTDATED`: run `generate` once
without `--check` to rewrite the owned files you have not edited. `diagnoseProject`,
`inspectSchema` and `reportStatus` are also exported from `@mimlet/codegen` for Node
tooling. `reportStatus(diagnostics)` returns `false` when any entry has severity
`error`: the rule that sets a report's `ok`, for diagnostics you filter or combine
yourself. The dependency-free core does not import the CLI or its
filesystem/versioning helpers.
