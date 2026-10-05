# Implementation and acceptance record

This records the alpha's implementation boundaries. It supplements the
original [product plan](product-roadmap.md); it does not redefine every schema or
vendor version as supported, claim a stable release, or substitute old CI evidence
for verification of a new commit. The authoritative result for a PR is the workflow
run at its exact head SHA.

| Planned workstream                       | Implemented entry points                                                                                                                                                       | Evidence and boundary                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared execution and sound types         | Core builders, class facades, typed paths, explicit cloning/promise-value wrappers, native union selection.                                                                    | Core runtime/property/type suites; generated and TypeBox packed consumers. Raw erased types are not reconstructed at runtime.                                                               |
| Reproducibility                          | Named session scopes, reference time, sequences, uniqueness budgets, snapshot/restore and fixture capture.                                                                     | Replay, isolation, graph round-trip and mismatch cases. Ambient user randomness and future provider versions are not covered by a seed alone.                                               |
| Native/standards interoperability        | Both TypeBox lines, native Zod/ArkType builders and codecs, Standard Schema, Valibot, native Effect and adapter SDK.                                                           | Locked real-library consumers and native codec/error cases. Explicit capability/version matrix, not a whitelist that blocks other conforming validators.                                    |
| Generation and profiles                  | JSON Schema drafts 07/2019/2020, independent validation, custom providers/formats/assertions, minimal/defaults/examples/random/boundary, Faker and checked negative mutations. | Independent constraint checks, budgets and unsupported-keyword cases. Bounded generation is not a complete solver or an exhaustive boundary enumerator.                                     |
| Scenarios                                | Dependency graphs, overrides, conflict-checked traits, uniqueness and fixture consumers.                                                                                       | Related data recomputation, sync/async lists, cancellation and transactional test-sink handoff. Real database transactions remain the supplied sink's responsibility.                       |
| Property testing                         | fast-check properties/replay and scenario mappings; native Effect arbitraries.                                                                                                 | Real shrinking, failure replay and correlated-parameter tests. Opaque factories do not acquire an invented shrinker.                                                                        |
| Codegen and protocols                    | Shared Hey API runtime, standalone CLI/classes/check/self-contained output, OpenAPI/AsyncAPI, GraphQL, Protobuf and Avro.                                                      | Emitted code compilation, installed ESM use, offline references and native codec tests. Each protocol has explicit unsupported transport/type semantics.                                    |
| Developer experience and release tooling | Local playground/inspector, SDK conformance, package/workspace checks, Changesets, artifact verification, CI, recipes and performance reports.                                 | Real browsers, portable core runtimes, minimum compiler and tarball diagnostics. Stable field randomness or full UI-framework/database matrices are not inferred from structural consumers. |

The [stable release contract](stability.md) adds real application trials and a new-version
trusted-publisher release candidate before promotion. Named setters and CLI diagnostics
are included in alpha.2.

## Checks that must pass on the final head

`pnpm validate` covers source and type correctness, core/adapter tests, independent
coverage gates, workspace/documentation checks and the installed Hey API consumer.
`pnpm pack:check` verifies every tarball's exports/declarations, package inventory,
release channel and exact internal dependency graph. Production audit and changed-
dependency review must pass without ignoring advisory failures.

Browser acceptance uses Chromium, Firefox and WebKit against installed tarballs.
Portable acceptance exercises the core in Node, Bun and Deno, the TypeScript 5.8.3
core/portable declarations, every packed package and the recipes as a TypeScript
7.0.2 consumer (including Hey API generation with TypeScript 6 beside it), the
executable shop recipe and performance measurements.
The complete workspace uses TypeScript 6.0.3 and Node 22.18.0/24 on Linux, macOS and
Windows. See [compatibility](compatibility.md) for the scope of each result.

The build/release scripts are checked with malformed inventories, mismatched
versions/digests, missing packages, bad release channels, prototype-looking names,
unsafe output paths and other boundary cases. Normal CI is non-mutating. No test
passes merely because a previous commit was green, and no failed first-run browser
case is hidden with automatic retries.

## Not performed by an implementation PR

Actual publication, npm name ownership/trusted-publisher configuration, release
environment approvals and migration of external production repositories are
separate reviewed operations. Clean representative consumers and the shop recipe
are verified here; they are not an assertion that every downstream production
application has been migrated. The root remains private and the existing published
Hey API v2 package remains unchanged. No packages are released by merging alone.

The alpha is deliberately not a universal-generation or zero-vulnerability claim.
Future vendor releases, arbitrary custom schema languages, universal
shrinking, exhaustive solver coverage, hardened OS isolation and every transport or
framework extension require additional implementation/evidence before advertising
support. These limits remain visible in the package guides rather than being
silently converted into broad compatibility promises.
