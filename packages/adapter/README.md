# Adapter SDK and conformance

Declare an integration's actual operations while retaining its native schema and
Standard Schema input/output types. The core and this SDK do not import or
whitelist any schema vendor.

```ts
import { defineAdapter, fromAdapter } from '@mimlet/adapter';

const adapter = defineAdapter({
  id: 'my-domain',
  version: '1.0.0',
  standard: MySchema,
  source: MySchema,
  operations: {
    create: (id: string) => ({ id }),
    checkInput: (input: unknown) => isValidDomainInput(input),
    fields: [{ name: 'id', required: true }],
  },
  limitations: ['External identifiers require an application factory'],
});
const value = fromAdapter(adapter).buildValidated('customer-1');
```

`defineAdapter` snapshots the capability map and descriptive metadata. It retains
native schema/function handles, does not clone executable objects, and does not
execute operations to guess capabilities. Operation callbacks are trusted code
and should use closures or explicit binding. Do not mutate a native schema or its
registries while builders use it. `fromFactory` supplies an explicit typed escape
hatch; `fromAdapter` requires an actual `create` capability at compile time.
Asynchronous factories remain async-only in the resulting builder types. Both accept a
typed `defaultSession` option for a `create` or factory whose first parameter is a
`GenerationSession`; builds may then omit the session, and `create`, patch factories
and transforms always receive one. A `name` option scopes that default session per
builder.

`adapter.inspect()` describes generation, encoding, pure input checking, cloning,
field metadata, native arbitrary identity, and explicit limitations. Missing
field inspection is `null`, not an empty object schema. Native arbitrary handles
remain opaque: a native Effect arbitrary is not relabelled as a fast-check arbitrary, and a
random function is not advertised as a shrinker. Inspection contains no schema,
fixture, or executable callback. It is suitable for a local inspector; rendering
code must still escape user-controlled labels.

## Shared conformance suite

```ts
import { assertAdapterConformance } from '@mimlet/adapter/testing';
await assertAdapterConformance(adapter, [
  { name: 'valid id', input: () => ({ id: 'one' }), valid: true },
  { name: 'missing id', input: () => ({}), valid: false },
]);
```

Cases supply fresh inputs and can supply an output assertion for transformations.
The suite compares pure native checks with Standard Schema and validated builder
results, verifies unchecked builds do not validate, and counts one Standard
Schema call per validated build. It intentionally runs each case through the
native and builder paths separately; do not use effectful production validators
with a suite intended for tests. Failures identify case names and contract
mismatches without printing fixture values or native exception text.

These tests are reusable evidence, not a compatibility certificate. An adapter
still needs vendor/version-specific tests for references, codecs, unsupported
constructs, recursion, generation, encoding and shrink semantics. Report tested
versions and limitations separately rather than publishing a universal badge.

## Other exports

- `checkAdapterConformance(adapter, cases)` from `@mimlet/adapter/testing` runs the
  same suite without throwing on failed cases and resolves to
  `{ adapter, passed, cases: [{ name, passed, reason? }] }`, where `adapter` is the
  inspected adapter id. Reasons are fixed descriptions and never contain fixture
  values or native exception text.
