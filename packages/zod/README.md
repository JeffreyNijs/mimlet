# Mimlet's Zod adapter

Introduced in the coordinated toolkit `0.1.0-alpha.1` train.

Native builders for **Zod 4**, including Zod Mini. Alpha.1 pinned 4.4.3;
alpha.2 supports the tested range 4.4.3 through 4.6.5. Input and output types come
from the original schema. Automatic generation uses its input JSON Schema;
validation, transforms, defaults and codecs remain native Zod operations.
The dependency-free core remains separate.

See the [executable Zod and ArkType guide](https://jeffreynijs.github.io/mimlet/guide/zod-and-arktype.html) for tested
recipes and the [compatibility matrix](https://jeffreynijs.github.io/mimlet/guide/compatibility.html) for version bounds.

## Install

Releases, including betas, are published on npm's `latest` tag. Pin exact versions
when you need to reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/zod zod@4.6.5
```

Zod 4.6.5 is the newest tested version; the supported range is 4.4.3 through 4.6.5.

## Builders

| Entry point                                     | Contract                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fromZod(schema, options)`                      | Synchronous input generation and native synchronous validation.                                                                 |
| `fromZodAsync(schema, options)`                 | Async-only builder; validation goes directly through `safeParseAsync`.                                                          |
| `fromZodFactory(schema, factory, options)`      | Caller-provided input; factory tuples and known async capabilities are retained. Validation uses the synchronous native parser. |
| `fromZodFactoryAsync(schema, factory, options)` | Async-only builder with native async validation; accepts sync or async input factories.                                         |

Use an explicit async entry point for schemas with async refinements or codecs.
Calling an async build method on a synchronous adapter does not select a different
native parsing mode. The dedicated async path avoids the pinned Zod Standard
entry's sync probe/retry. A callback exception propagates without another parse.

`.build()` produces input, while `.buildValidated()` returns native parsed output.
Async variants expose `.buildAsync()` and `.buildValidatedAsync()`. All ordinary
Mimlet patches, replacement, list budgets, cloning and transforms remain available.
Switch object-union variants with a complete `.replace()` value.

## Named setters for every field

`zodFields(schema)` lists an object schema's top-level input keys. Pass it to
`fluent()` from `@mimlet/core` for a `withX()` setter per field, typed with the
schema's input. It follows `.transform()` and other pipes to the object that
receives the input, reads only the shape's keys and does not convert the schema, so
it also works with the factory and async entry points:

```ts
import { fluent } from '@mimlet/core';
import { z } from 'zod';
import { fromZod, zodFields } from '@mimlet/zod';

function rows<S extends z.ZodObject>(schema: S) {
  return fluent(fromZod(schema), zodFields(schema));
}
rows(User).withAge('42').buildValidated();
```

Non-object schemas such as unions throw a `TypeError`. `looseObject()` and
`catchall()` inputs have an index signature and get no typed setters. See
[named setters](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#a-setter-for-every-schema-field)
for the names that are skipped.

## Native operations and generation

`zodAdapter(schema, options)` retains `source` and exposes `standard`,
`standardAsync`, `decode`, `decodeAsync`, `encode` and `encodeAsync`. Encoding
delegates to Zod: codecs can reverse a value, while one-way transforms throw the
native encoding error. No inverse or shrinker is synthesized. Native parse options
can be supplied through `parseOptions`; validation failures retain Zod issue paths
inside the core's `BuilderValidationError`.

`generation()` prepares and caches the JSON Schema generator on demand. It exposes
the existing profiles, budgets, references, versioned providers and session/replay
identity. `create(session?)` generates schema input. Automatic builders prepare
generation immediately, so unsupported conversion fails before use.

Conversion supports Draft 7 and Draft 2020-12. It throws for unrepresentable native
values rather than converting them to an unconstrained schema. Date, Map, Set,
bigint, custom predicates and application data can use factories without requiring
JSON conversion. Opaque refinements can reject generated candidates when native
validation runs; bounded generation is not a solver for arbitrary callbacks.

The generation identity covers the converted input and generator configuration.
Keep application schema/codec versions in your replay identity when output depends
on opaque functions. Native conversion and callbacks are trusted application code;
generation budgets do not sandbox them. DOM types are needed by Zod's declarations.
