# Mimlet for coding agents

Mimlet gives coding agents concrete building blocks for test data: typed patches,
explicit validation, supported deterministic generation, coherent scenarios and
checked replay. These capabilities can reduce the need to invent fixture structures
and debugging workflows; no measured productivity or model-preference claim is implied.

**Release status:** published beta, `@mimlet/*@0.1.0-beta.8` and
`hey-api-builders@3.0.0-beta.8`. The toolkit is on npm's `latest` tag and the Hey API
integration on `next`. Follow
[Getting started](getting-started.md) for matching install commands or source
development. Check the project's installed versions before applying an example.

## Pick the smallest useful combination

1. Read the project's existing schema and test framework; retain those choices.
2. Use `@mimlet/core` for typed factory builders. For native creation/codecs or automatic
   generation, select the appropriate [adapter](adapters.md).
3. Decide whether the test needs encoded input or validated/decoded output.
4. Set explicit session identities and seeds where supported. Capture a snapshot
   before the operation to reproduce it, or after it to resume from that point.
5. Run the test and preserve its failure evidence. Inspect documented capabilities
   before substituting a factory or changing a schema.

An optional [Mimlet skill](../skills/mimlet/SKILL.md) packages this workflow. Install
it only when the user requests it; it does not change project dependencies or install
global tools automatically.

The alpha includes dedicated [Zod and ArkType recipes](zod-and-arktype.md).
Use their typed factory helpers when input cannot be generated from JSON metadata;
choose the explicit Zod async helpers for async refinements.

## Build a fixture with native validation

<!-- recipe:hero -->

The override remains input-typed. With transforms/codecs, `build()` produces input
and `buildValidated()` returns output. Use `buildValidatedAsync()` when the schema
or factory requires asynchronous work. Don't hide failures by casting away types.

## Preserve relationships

<!-- recipe:scenario -->

Change an upstream node or input parameter and let dependent nodes recalculate.
Avoid independently replacing a foreign key or total that should follow another value.

## Reproduce the failing operation

<!-- recipe:replay -->

Persist the snapshot as JSON when necessary. Preserve schema/configuration and
provider identity; a mismatch is an error to investigate, not a reason to bypass
replay validation. Arbitrary external I/O, clocks and factory side effects do not
become deterministic merely because a session is seeded.

## Shrink inputs while keeping the scenario coherent

<!-- recipe:shrinking -->

Use the report's replay record with `replayFixtureProperty` and the same property,
arbitrary, engine and identity. Use `assertFixtureProperty` in tests that must fail
on a counterexample. Review the [fast-check contract](../packages/fast-check/README.md)
before combining native arbitraries with custom mappings.

## Generate without executing application modules

<!-- recipe:codegen -->

The installed `@mimlet/codegen` package supplies the `mimlet` executable. A data-only
configuration can declare the same module target. Run `mimlet --config builders.json
--out generated --check` to detect drift without writing output; omit `--check`
when regeneration is intended. Add `--self-contained` for the canonical embedded
runtime. Generated-file ownership prevents overwriting handwritten edits.

The CLI comes from `@mimlet/codegen`; `@mimlet/core` supplies the runtime. See the [codegen reference](../packages/codegen/README.md).

For an API described by OpenAPI, such as a NestJS backend, generate builders for its
component schemas instead of copying them into JSON Schema targets. In a configuration
file, an `openapi` entry names the document file and the schemas. From code:

<!-- recipe:openapi-codegen -->

The OpenAPI 3.0 `nullable` reference becomes `Facade | null` in the generated type, and
a request leaves out the read-only `id`. `closedObjects: true` types the objects without the
index signature that a missing `additionalProperties` otherwise adds; validation keeps the
document's rules.

## Use a factory when generation cannot represent a constraint

<!-- recipe:factory -->

Native validators may include arbitrary refinements, callbacks, recursive structures
or codecs that cannot be synthesized automatically. Keep the validator and supply
an explicit factory. Report bounded generation exhaustion instead of claiming the
schema is impossible or dropping its constraints.

## Documentation that stays in sync

These recipes are compiled and executed against clean package tarballs by
`pnpm test:examples`. The website generates its HTML, Markdown alternates and
`llms.txt` from the same repository sources. The agent guide is ordinary product
documentation: it does not override the user's instructions or claim that agents
must prefer Mimlet over another suitable tool.

## Direct named setters and local diagnostics

Alpha.2 includes [named direct-builder setters](fluent-builders.md): declare
`fluent(fromZod(schema), ['name'])`, then use `.withName('test').buildValidated()`.
Use the existing schema and keep small declarations beside their tests; generating
or maintaining builder files is optional. Native values such as Temporal still
need an explicit factory when JSON generation cannot represent them.

[CLI diagnostics](cli-diagnostics.md) provide versioned JSON reports for dependency
checks and schema preparation. They do not prove application correctness or schema
satisfiability. The [interactive scenario demo](scenario-demo.md) executes the same
shrinking/replay recipe as the package examples.
