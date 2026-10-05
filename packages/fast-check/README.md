# Shrink-aware property fixtures

This optional package accepts `fast-check` `>=4.10.2 <5` with the accompanying
version-matched Mimlet core; `fast-check@4.10.2` is the tested version, and
`mimlet doctor` reports a newer, untested fast-check 4 release as
`PEER_VERSION_UNTESTED`. Replays name the loaded fast-check version, so they never
cross fast-check releases. Releases, including betas, are published on npm's
`latest` tag. The core itself does not depend on fast-check.

## Native arbitraries and ordinary builders

`fromArbitrary(arbitrary)` returns a builder whose factory takes an explicit
`GenerationSession`. It samples the native arbitrary using a session-derived
32-bit seed. `fromSchemaArbitrary(schema, arbitrary)` also retains Standard Schema
input/output typing and explicit validated builds. Ordinary builder sampling is
not a new shrinker; use the mapping functions for property-based testing.

```ts
import * as fc from 'fast-check';
import { createBuilder } from '@mimlet/core';
import { mapFixtureArbitrary, assertFixtureProperty } from '@mimlet/fast-check';

const users = fc.record({ age: fc.integer({ min: 18, max: 100 }), role: fc.string() });
const admins = mapFixtureArbitrary(users, (input) =>
  createBuilder(() => input)
    .with({ role: 'admin' })
    .build()
);
assertFixtureProperty(admins, (user) => user.age >= 18 && user.role === 'admin', {
  seed: 12345,
  identity: { fingerprint: 'admin-fixtures/v1', provider: 'application@1' },
});
```

`mapFixtureArbitrary` retains fast-check's original shrink context. It clones
supported input graphs before every mapping, protecting that context from mapper
mutation. Fixed overrides and derivations are reapplied to every shrunk input.
Mappings must be pure and synchronous. Supply `clone` for native values outside
`cloneFixture`'s support, and an `unmapper` to support shrinking manually supplied
examples. No inverse transformation is guessed.

`schemaFixtureArbitrary(schema, source)` validates each candidate exactly once and
returns parsed output. The source must already generate compatible input. Invalid
candidates throw rather than silently dropping constraints or retrying effectful
validation. Async validation belongs inside an async property over the original
input arbitrary, for example through `createSchemaBuilder(...).buildValidatedAsync()`.

## Scenarios that shrink coherently

```ts
import * as fc from 'fast-check';
import { createScenario } from '@mimlet/core';
import { scenarioArbitrary } from '@mimlet/fast-check';

const cart = createScenario()
  .node('lines', [], (): number[] => [])
  .node('total', ['lines'], ({ lines }) => lines.reduce((sum, price) => sum + price, 0));

const carts = scenarioArbitrary(
  fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
  (lines) => cart.override('lines', () => lines),
  { seed: 'cart-context', fingerprint: 'cart/v1', provider: 'application@1' }
);
```

The explicit parameter arbitrary supplies meaningful structural shrinking. Each
shrink reconstructs the scenario using the same session configuration, recomputing
dependents such as totals. Native arbitrary constraints, fixed overrides, and the
scenario's declared relationships are retained. Opaque random factories do not
acquire a semantic shrinker by having their seed reduced.

## Reports, assertions, and replay

`checkFixtureProperty` and `checkFixturePropertyAsync` return native run details
and, for an ordinary counterexample, a JSON-compatible `replay` record. Always
inspect `details.failed`, or use `assertFixtureProperty`/`assertFixturePropertyAsync`
to fail a test automatically. `FixturePropertyError.report` exposes details
explicitly; counterexamples are not enumerable default error properties.

`replayFixtureProperty` and its async counterpart require the original arbitrary,
predicate, replay record, and matching consumer identity. They verify the recorded
fast-check version, fingerprint, provider/version, configuration, seed, and shrink
path, then replay the counterexample without restarting shrink exploration.
Changes to native arbitraries, mapping code, or application behavior must update
the consumer identity. Replay records are not cryptographically authenticated.

These wrappers use ordinary fast-check seed/path replay. Advanced model-based
commands and `gen` have additional replay requirements; use their native replay
APIs rather than assuming that a generic seed/path record captures them. See the
[fast-check replay documentation](https://fast-check.dev/docs/advanced/model-based-testing/).

Deterministic sampling/check/replay wrappers reject modified process-global
fast-check configuration instead of silently inheriting hidden randomness or
runner settings. Mapped arbitraries remain ordinary arbitraries and can be used
with native `fc.assert`/`fc.check` and arbitrary custom configuration. No global
fast-check settings are changed by this library.

Seeds are explicit signed 32-bit integers. Run count defaults to 100, and skips
per run to 100. Counts have finite configuration limits, but arbitrary callbacks
and custom arbitraries are trusted code: these wrappers are not an interruptible
sandbox. No fixtures, seeds, or reports are transmitted or logged automatically.

## Verification

The compatibility fixture pins fast-check and its resolved dependency in a
committed npm lockfile. `node scripts/test-optional.mjs fast-check` builds actual
package tarballs, installs them outside the repository, compiles their declarations,
and checks shrinking, replay, async predicates, isolation, and generated invariants.
The optional package has its own runtime coverage gates. Local offline development
can supply already installed, version-checked dependencies; CI uses `npm ci` and
registry integrity verification.
