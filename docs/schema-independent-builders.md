# Architecture and migration

## Repository and package boundaries

The repository is a private pnpm workspace containing nineteen independently
packable packages. The published scoped train is `0.1.0-beta.1`; the unscoped
Hey API integration is `3.0.0-beta.1`. Both use npm's `next` channel. The train
includes the dedicated Zod and ArkType adapters. The existing Hey API `latest`
tag remains on v2. Later source versions require their own publication evidence.

The core has no runtime or peer dependencies. Native vendors, JSON Schema
providers, Faker, property testing, compiler tools, protocol codecs and the local
playground live behind optional package boundaries. Internal runtime dependencies
use exact coordinated versions. Clean tarball consumers test those boundaries
without relying on workspace module aliases.

## One execution runtime

The core separates public capability types from immutable construction state.
Factory argument tuples, distinct sync/async methods, encoded input, validated
output, explicit cloning, nested paths and class-facade types are tested together.
All configured patches, replacements and omissions run in registration order
before all transforms. Validation runs only for a validated build, after those
operations, through the selected Standard Schema entry point.

Builder configuration is immutable, not every object passed into it. The default
preserves caller-supplied references; `withFactory`, `replaceFactory`, clone policies
and capture-based cloning provide explicit isolation. Nullable objects and union
transitions require complete replacement. Native TypeBox adds complete branch
selection without discarding root union constraints or codec behavior.

Class facades and Hey API-generated classes delegate to this runtime. Generated
helpers retain subclass fluent types, including after asynchronous transitions.
The standalone generator's self-contained mode copies the canonical compiled core
and declarations. There is no separately maintained inlined runtime.

## Schemas preserve their own semantics

Standard Schema provides common validation and input/output typing. Standard JSON
Schema adds optional input metadata for generation. Canonical interfaces are
vendored with attribution, and the real Zod, Valibot and ArkType compatibility
suite exercises standards interoperability rather than a private approximation.
Native TypeBox and Effect adapters retain schema/codec handles where conversion
would be lossy. Vendor registries and callbacks remain caller-owned trusted code.

JSON Schema uses a replaceable generation provider and independent Ajv instances
for draft-07, 2019-09 and 2020-12. Candidate normalization affects only generation;
acceptance checks the original schema. Unknown unsupported assertions fail rather
than disappearing. Profiles, custom formats/assertions, explicit references and
negative mutations all have declared contracts and resource limits.

Protocol adapters retain protocol meaning: OpenAPI direction and HTTP groups,
AsyncAPI message envelopes, GraphQL input/response distinction, Protobuf 64-bit
values and oneofs, and Avro tagged unions and native binary codecs. A runtime
schema file does not prove an application TypeScript type. Standalone codegen can
emit structural declarations; application factories retain their own inferred types.

## Stateful execution is explicit

Generation sessions own seeded streams, reference dates, sequences, uniqueness
and work budgets. Named scopes isolate unrelated draws. Replay records carry
provider/schema/configuration identity and reject incompatible inputs. Arbitrary
user functions using ambient randomness do not inherit replay guarantees.

Scenarios are dependency graphs with explicit overrides and conflict-checked
presets. Recomputing dependent nodes preserves relationships. Fast-check mappings
shrink explicit parameters and recompute scenarios. Effect retains its native
arbitraries; an arbitrary factory is not advertised as a shrinker.

## Consumers and tooling

Preview loaders, response resolvers and persistence handoffs consume explicit
callbacks. They do not install global interceptors, connect to production systems,
or pretend that arbitrary callbacks are transactional. The playground is optional,
local-only and uses cancellable workers. The code generator reads bounded JSON
configuration, never evaluates application modules during emission, and tracks
which output files it owns before changing them.

## Trust and release boundaries

Raw schema data, native callbacks and generated application imports have different
trust levels. Offline resolution, strict data copying, allocation/work budgets,
path checks and explicit validation do not constitute arbitrary-code sandboxing.
The playground can interrupt worker execution but is not an OS security boundary.
See [security](../SECURITY.md) and [compatibility](compatibility.md).

The Hey API runtime migration is a breaking major version; consumers must install
the matching core and regenerate clients. See [migration](hey-api-migration.md).
The release process verifies complete tarball inventories, declarations, hashes,
internal dependencies, acceptance suites and prerelease channels before publication.
[Release operations](releases.md) separates implemented tooling from account setup
and actual publication. [Acceptance](acceptance.md) maps implemented work to the
original [product plan](product-roadmap.md) without claiming unlimited schema support.
