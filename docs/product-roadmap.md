# Product roadmap and acceptance gates

This is the accepted direction for a modular schema-independent test-data toolkit, not a claim that every capability below is implemented. The scope intentionally extends beyond an extracted Hey API builder plugin.

## Product contract

The toolkit should combine readable immutable builders, schema-driven input generation, native validation and codecs, realistic correlated scenarios, deliberate edge cases, replayable failures, and shrink-aware property testing. The core must remain usable without any schema library or generation backend.

Native capabilities take precedence over lossy normalization. Standard Schema is the shared validation contract; Standard JSON Schema is one optional metadata/conversion path. Native adapters retain original schemas and may expose generation, inspection, encoded/decoded representations, and shrinking without first reducing everything to JSON.

Public support has separate dimensions: accepted interface, inspected fields, generated inputs, validated outputs, encoding, shrinking, version ranges, and execution environments. A single library-name badge is not sufficient evidence for all of them.

## Current implementation

The accepted workstreams below now map to implemented packages and their conformance
suites. The repository is a private twenty-package workspace, not the original
three-package prototype. It includes sessions/capture/scenarios, native and standards
adapters, generation profiles, Faker, shrink-aware property testing, shared Hey API
and standalone code generation, protocol adapters, fixture consumers, a local
playground, package-aware release tooling and cross-runtime acceptance.

Complete TypeBox union selection now constructs a branch before applying patches
while retaining the original union's codecs and validation. The original emitter
has been migrated to the shared runtime. Neither change alters already-published
Hey API v2 packages. The first coordinated alpha is published on npm’s `next` channel.

The [acceptance record](acceptance.md) maps each workstream to implementation and
evidence. [Compatibility](compatibility.md) states exact version/capability boundaries;
[release operations](releases.md) separates source readiness from external account
setup, actual publication and downstream production migration. Sections below retain
the accepted design criteria, not a claim of universal solver or vendor support.

The current stabilization gates and proposed compatibility promises are tracked
in the [stable release contract](stability.md). The stages below retain the
accepted product requirements; see [implementation evidence](acceptance.md) for
what is already present.

## Stage 1: strengthen the behavioral model

The current runtime is the starting point, not an API freeze. Finish these requirements before stable release:

- A schema-aware variant operation that constructs a complete selected variant, while keeping generic object-union replacement conservative.
- Typed nested-path updates with explicit semantics, not implicit blanket deep merging.
- Distinct input checking, parsing/decoding, and encoding where adapters support them; no invented inverse transformations.
- An explicit representation for a promise/thenable intended as fixture data rather than asynchronous factory execution.
- Clone policies and adapter hooks for native values, with intentional sharing distinguishable from fresh per-build data.
- Safe operation origins and structured error codes without printing private fixture values by default.
- Property-based tests for builder branching, ordering, isolation, replacement, and validation cardinality.

Gate: runtime tests and negative type tests agree on the contract. Coverage includes the actual runtime. Known async operations cannot advertise guaranteed-failing sync calls.

## Stage 2: reproducible execution sessions

Separate immutable builder definitions from mutable session execution state. Sessions own randomness, reference time, sequences, uniqueness sets, and related entity identities. They are explicitly scoped to tests/scenarios, never process-global singletons.

Design a versioned replay record including seed, builder/schema fingerprint, provider/version, configuration, reference time, and execution keys. Stable named substreams should make unrelated entity/field generation independent where the provider can uphold that promise. Unknown third-party factories using global randomness cannot acquire this guarantee automatically.

Support actual fixture capture for important failures. Reject incompatible replay metadata rather than silently returning different data. Establish ordering rules before introducing parallel async generation. A seed is not a cross-version guarantee.

Gate: repeated execution with the same supported inputs reproduces results; adding independent generation does not perturb named substreams; incompatible replays fail explicitly.

## Stage 3: native and standards adapters

TypeBox is first-class in both its modern and maintained legacy package lines. Expand tests for native references, recursion, custom types, formats, extended values, and codec failures before extending the tested ranges. Keep compiler requirements local to adapters.

Add first-party interoperability for Zod, Valibot, ArkType, and Effect. Prefer Standard interfaces where sufficient; preserve native metadata, encoded/decoded shapes, and native arbitrary/shrinker capabilities where they materially improve support. Isolate unstable vendor APIs behind narrowly versioned packages.

Provide a public adapter SDK and a reusable conformance suite. Other Standard Schema validators remain accepted without a hard-coded library whitelist, but automatic generation and native features need their own evidence.

Gate: each supported adapter/version runs the common suite plus native-specific cases from installed package artifacts. Unsupported capabilities are explicit and actionable.

## Stage 4: generation providers and profiles

Evaluate existing generation backends against a checked-in conformance corpus rather than feature-list claims. Reuse reliable infrastructure, contribute upstream or add necessary missing generation logic, and keep providers replaceable.

Architectural JSON Schema acceptance targets include draft-07 and 2020-12. Other dialects require explicit normalization and tests. Preserve reference resolution, composition semantics, conditionals, formats, and custom vocabulary requirements. Never silently drop unknown assertions or rewrite a dialect label as a conversion.

Profiles should include minimal valid, examples/defaults, realistic seeded, boundary-focused, exploratory, and deliberately invalid generation. Validate examples/defaults before trusting them. A profile changes sampling strategy, not schema meaning.

Generation budgets limit attempts, recursion, output size, reference expansion, and work where controllable. Distinguish a provable contradiction from exhausting a search budget. Retry policies must not overwrite explicit overrides, repeat effectful validation invisibly, or run indefinitely.

Negative generation targets a documented violation and reports observed violations. Exactly-one-constraint failure is a checked objective, not a universal promise when constraints interact.

Gate: generated fixtures satisfy independently configured validators where applicable, boundary cases are exercised, unsupported features fail clearly, and custom factories remain an escape hatch.

## Stage 5: correlated scenarios

Add traits/presets, nested builders, derived values, dependency ordering, entity relationships, and session-scoped uniqueness. An order's owner, line items, and total should be generated as a coherent scenario rather than unrelated valid fields.

Detect conflicting traits and dependency cycles. Distinguish finite recursive schemas from deliberately cyclic in-memory object graphs. Uniqueness has finite domain/budget failure behavior. Persistence is an optional consumer of scenarios, not mandatory core behavior.

Gate: realistic scenarios remain coherent under overrides, replay, list generation, and supported shrinking. Isolation across tests is explicit and verified.

## Stage 6: genuine property-based testing

Provide a fast-check integration and preserve native arbitraries/shrinkers where available. A random factory alone is not a meaningful shrinker.

Shrinking must respect supported schema constraints, fixed overrides, and scenario relationships. Derived values should be recomputed after structural reductions. Opaque factories may supply custom shrinkers; unsupported shrinking must not be silently advertised.

Gate: failing scenarios can be replayed and reduced while preserving the selected fixture contract; minimal examples do not become invalid through broken relationships.

## Stage 7: shared code generation and protocol integrations

Make the Hey API integration a thin consumer of the shared runtime while retaining its established model/request/response naming and generated convenience methods. Fluent wrapper types must not lose generated methods after `with` or other operations.

Add a standalone generator/CLI with deterministic output, non-mutating `--check`, selective generation, configurable naming, source locations, and incremental regeneration. Use a small builder emission description, not a second schema language. Runtime-loaded JSON cannot infer application types through unchecked generic assertions; use literal inference, generated declarations, or an explicit verified relationship.

Imported runtime is the default. Optional self-contained output must be built from the same implementation and declare which callbacks/native capabilities need imports. Materialized fixtures are another output mode, not a substitute for falsely serializing arbitrary closures.

Independent OpenAPI support should retain operation direction, request groups, statuses, media types, and serialization. Additional adapters for GraphQL, AsyncAPI, Protobuf, and Avro must preserve their own semantics. Request mocking, component previews, and persistence integrations remain optional packages rather than a mandatory server/framework.

Gate: direct builders and all generated wrappers pass one shared behavioral suite. Existing Hey API consumer migrations are explicit, compiled, and tested.

## Stage 8: developer experience, packaging, and releases

Turn the repository into an intentional private-root workspace. Give packages independent dependency boundaries, compiler/platform matrices, exports, declarations, and release metadata. Choose stable neutral names only after verifying availability; keep the existing published integration name for compatibility.

Add coordinated changelogs/versioning, prerelease channels, trusted publication, provenance, immutable tested artifacts, and rollback guidance. Install every release tarball into clean consumer projects with no undeclared monorepo dependencies. Test the oldest and newest claimed compiler versions and relevant Node/browser/Bun/Deno/module-resolution environments. Do not claim CommonJS support merely because one consumer happens to bundle ESM.

Deliver executable documentation, migration guides, realistic sample projects, an adapter-author guide, an inspector, and a local-first playground. Inspection should explain selected adapter/provider, unsupported capabilities, operation origins, branch choice, and validation failures without leaking schema or fixture data to a remote service by default.

Gate: representative real projects can migrate through prereleases; all advertised compatibility claims have evidence; no unresolved correctness, packaging, or security gaps remain within the declared contract.

## Cross-cutting security and performance

Treat raw schemas, native schemas, executable configuration, callbacks, and remote references as distinct trust levels. Default to offline resolution, explicit local roots, and no automatic code execution from schema documents. Bound inputs and outputs. Use workers or stronger isolation for workloads that require interruption; an async timeout cannot interrupt blocking native work by itself.

Validate prototype-related keys, paths, reference traversal, recursion, regex expense, and malformed inputs. Avoid arbitrary shell commands or network access derived from untrusted schema metadata. Native callbacks remain trusted unless explicitly isolated.

Measure schema preparation, cache lifecycle, individual builds, long chains, large lists, recursive scenarios, generated code size, and TypeScript/editor performance. Do not cache mutable schema state without an explicit lifecycle rule.

The official JSON Schema validation corpus is useful evidence, not a generator completeness certificate. Supplement coverage with fuzzing, mutation-sensitive tests, distribution checks, termination tests, independent validation, and consumer packaging tests.

## Release discipline

Broad scope does not justify weak guarantees. Implement and review work in vertical slices with the gates above. Keep roadmap items visibly distinct from released capabilities. Do not freeze the prototype because it already passes its initial tests, and do not publish an incomplete support matrix under a universal-generation claim.
