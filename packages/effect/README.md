# Native Effect fixtures

From `0.1.0-alpha.4`, this package targets exactly `effect@4.0.0`. Effect 4 replaced
the bundled fast-check with its own `effect/Arbitrary` engine, which Effect marks as
unstable, so the peer stays exact. Toolkit `0.1.0-alpha.3` and earlier target
`effect@3.22.2`; Effect 3 projects should stay on that train.

Pin exact versions when you need to reproduce fixtures; see
[Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
# Effect 4
npm install --save-dev @mimlet/core@next @mimlet/effect@next effect@4.0.0
# Effect 3
npm install --save-dev @mimlet/core@0.1.0-alpha.3 @mimlet/effect@0.1.0-alpha.3 effect@3.22.2
```

Loaded with Effect 3, this release throws a `TypeError` that names the required
version, and `mimlet doctor` reports `PEER_VERSION_UNSUPPORTED`. Effect 4's own type
declarations reference DOM types and `Disposable`. Without `skipLibCheck`, a project
needs the `DOM` lib plus either the `ESNext.Disposable` lib or `@types/node`; either of
those alone is not enough in a project without `DOM`.

```ts
import * as S from 'effect/Schema';
import { createSession } from '@mimlet/core';
import { fromEffect } from '@mimlet/effect';
const schema = S.Struct({ age: S.NumberFromString });
const session = createSession({ seed: 123, fingerprint: 'person/v1', provider: 'effect@4.0.0' });
const people = fromEffect(schema);
const input = people.with({ age: '42' }).build(session);
const output = people.with({ age: '42' }).buildValidated(session);
```

A native arbitrary generates a **decoded output** and the original encoder turns
it into fixture input. This retains native declarations and transformation rules
instead of forcing them through JSON. `fromEffectAsync` uses the native asynchronous
encoder; use it for codecs with asynchronous encoding. Synchronous builds over such a
codec raise a `TypeError` that points to `fromEffectAsync`. `fromEffectFactory` accepts an explicit input factory for one-way codecs,
unsupported arbitrary derivations and application-specific fixture logic.

Generated values come from Effect's arbitrary engine, which favors edge cases:
strings such as `__proto__`, `toString`, empty strings, lone surrogates and control
characters, and dates at the limits of the `Date` range. For presentable or
persisted data, set fields with `.with()` or use `fromEffectFactory`. Annotate the
factory's session parameter; unannotated, TypeScript infers it as `never`.

```ts
import type { GenerationSession } from '@mimlet/core';
import { fromEffectFactory } from '@mimlet/effect';
const adults = fromEffectFactory(schema, (session: GenerationSession) => ({
  age: String(session.integer(18, 99)),
}));
const adult = adults.buildValidated(session);
```

`effectFields(schema)` lists a struct's top-level keys as encoded, which is what
builders take: a key renamed with `Schema.encodeKeys` is listed by its encoded name.
Pass it to `fluent()` from `@mimlet/core` for a `withX()` setter per field. It reads
the schema's AST only, so it works with every entry point and in a generic helper:

```ts
import { fluent } from '@mimlet/core';
import type * as S from 'effect/Schema';
import { effectFields, fromEffect } from '@mimlet/effect';
function rows<A, I extends object>(schema: S.Codec<A, I>) {
  return fluent(fromEffect(schema), effectFields(schema));
}
const person = rows(schema).withAge('42').buildValidated(session);
```

Non-struct schemas such as unions throw a `TypeError`; symbol keys get no setter, and
structs with index signatures (records, `StructWithRest`) get no typed setters. See
[named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field).

`effectAdapter` exposes the original source, native Standard Schema validation,
input/output checks, sync/async encode/decode, and native Effect 4 input/output
arbitraries. Input checking checks the encoded shape, not the success of a subsequent
decode. Input-arbitrary shrinking re-encodes each native output shrink. Property tests
run through Effect's own `Arbitrary.checkEffect`, which shrinks and returns a replay
token; these arbitraries are not fast-check arbitraries and are not passed to
`@mimlet/fast-check`.

```ts
import * as A from 'effect/Arbitrary';
import * as E from 'effect/Effect';
import * as S from 'effect/Schema';
import { effectAdapter } from '@mimlet/effect';
const counts = effectAdapter(S.NumberFromString.pipe(S.decodeTo(S.Int)));
const report = E.runSync(
  A.checkEffect(counts.inputArbitrary(), (input) => Number(input) < 5, { seed: 1 })
);
// A failing report carries shrunkInput and a replay token for checkEffect({ replay }).
```

`inputArbitrary()` encodes each sample synchronously, so it cannot be used with
codecs that encode asynchronously. For those, check `outputArbitrary()` with an
effectful property that calls `adapter.encodeAsync`, and run it with `E.runPromise`.

Transformations and arbitrary annotations must remain pure and terminating for property testing.
Encoding failures propagate, not trigger hidden retries. Validation invokes the
native Standard Schema entry once per validated build, after builder overrides.
The original schema owns parsing behavior; excess object properties default to
errors and can be configured through `parseOptions`. Each adapter converts its own
Standard Schema wrapper, so two adapters over one schema keep their own parse
options and the caller's schema object is not modified.

Schemas requiring Effect services are not accepted by these constructors; provide
services in your own factory/validation wrapper. This restriction is type-tested.
Async schema execution is supported through async build methods, not detected by
inspecting private AST nodes. A schema whose native generation is asynchronous raises
a `TypeError` from synchronous builds that points to `fromEffectAsync`. Native failures and issues remain available and may
contain application values; no reports are logged or transmitted by this package.

Sessions are explicit and caller-versioned: include the schema, annotations,
codec behavior and native dependency versions in your replay identity. Unlike the
JSON Schema-based adapters, there is no default session. `fromEffect` and
`fromEffectAsync` require one for every build and list call; omitting it is a type
error and, from JavaScript, raises a `TypeError` before any generation. Every
native sampling option (count, size, discards and seed) is passed explicitly, so
`Arbitrary.configureGlobal` cannot change generated fixtures, and the adapter does
not modify native configuration. Effect does not promise identical samples across
releases; include `effect@4.0.0` in your session provider. Native schemas/annotations are
trusted code; this is not an interruptible worker or a guarantee of arbitrary
termination for opaque user filters.

Native peer declarations use Web platform types. Their compatibility consumers
include DOM types (and Node types for ArkType); this does not add DOM dependencies
to the schema-free core. The pinned Zod Standard Schema implementation probes
async refinements synchronously before retrying them asynchronously. The generic
standards path calls its validator entry once but does not override that native
behavior. Use an explicit `safeParseAsync` validation wrapper for effectful Zod
refinements that must not be probed twice.
