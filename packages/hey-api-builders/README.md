# Hey API Builders

Hey API integration for the schema-independent Mimlet toolkit. The `3.x`
prerelease line is a major-version migration on the `next` channel.
The stable v2 line remains available separately.

The plugin discovers generated model, request and response factories from
`@hey-api/openapi-ts`, then emits named fluent classes backed by the shared
`@mimlet/core` runtime. Hey API and Faker are not dependencies of
the neutral runtime itself.

## Installation and generation

Use matching plugin and core versions. See [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html)
for current registry availability, or build and install the workspace tarballs.
The generated client requires the matching core runtime plus Faker.
The verified generation toolchain is Hey API 0.99.0, Faker 10.5.0 and TypeScript
6.0.3. Runtime Node support starts at 22.18.0. Generation needs TypeScript 6 as the
`typescript` package; a TypeScript 7 project can install it beside TypeScript 7
(see [TypeScript 7](#typescript-7)).

```ts
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as builders } from 'hey-api-builders';

export default defineConfig({
  input: './openapi.json',
  output: './generated',
  plugins: [
    '@hey-api/typescript',
    '@faker-js/faker',
    builders({
      definitions: true,
      requests: true,
      responses: true,
    }),
  ],
});
```

After generation, ordinary object models retain their familiar API:

```ts
const user = new UserBuilder().withEmail('ada@example.com').build();
```

Each `withX()` helper accepts exactly what `with()` accepts for that property. With
`exactOptionalPropertyTypes`, an optional property such as `nickname?: string | null`
accepts `null` but not `undefined`; leave it out or call `omit('nickname')` instead.

Category settings (`definitions`, `requests`, `responses`) accept booleans,
naming templates/functions, or `{ enabled, case, name }`. Category-specific
casing overrides the shared `case`. `includeInEntry` and the vendor's plugin
hooks remain available. `runtimeModule` changes the generated runtime import
specifier for controlled package layouts; it does not select a second runtime
implementation or fetch that module during emission.

`includeInEntry` defaults to `true`: the client's `index.ts` re-exports the builders,
so any import from the client entry also loads `@faker-js/faker` and `@mimlet/core`.
If application code imports the client entry in production, set
`includeInEntry: false` and import builders in tests from the generated
`hey-api-builders.gen.ts` file.

Builder names come from the schema name, or the operation name plus `Request` or
`Response<status>`. When two names collide, for example schema `CreateOrderRequest`
and the request of operation `createOrder`, Hey API gives the later builder a numeric
suffix (`CreateOrderRequestBuilder2`). A distinct naming template for one category,
such as `requests: '{{name}}Fixture'`, avoids the suffix.

## What generated builders do and don't do

Each generated class wraps a factory emitted by Hey API's Faker plugin. It has no
schema attached, so it builds the generated TypeScript type with no
`buildValidated()` and no native validation. Validate in your test with your own
schema (for example the Zod plugin's output) when that matters.

Hey API's Faker plugin does not always satisfy the spec's constraints. For example,
it passes anchored patterns such as `^[A-Z]{3}-[0-9]{4}$` to `fromRegExp`, which
keeps the `^` and `$` characters, and it generates decimals for integer fields named
`amount` or `price`. Validate fixtures against your schemas, and set fields that must
be valid with constructor patches, `with()` or `withFactory()`:

```ts
const request = new CreateOrderRequestBuilder({ sku: 'ABC-1234' }).build();
zCreateOrderRequest.parse(request); // the Zod plugin's schema
```

For named setters over a Zod schema without generation, use
[`fluent(fromZod(schema), fields)`](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html).

Generated factories use the global `faker` unless you pass a seeded instance, for
example `build({ faker })`; reproducibility comes from that Faker instance, not from a
Mimlet session or replay record.

The peer ranges (`@hey-api/openapi-ts ^0.99.0`, `@faker-js/faker ^10.0.0`,
`typescript ^6.0.0`) are wider than the verified toolchain above; other versions in
those ranges are not tested.

## TypeScript 7

Generation needs TypeScript 6 as the `typescript` package. `@hey-api/openapi-ts`
0.99.0 loads the TypeScript compiler API when it starts, and the `typescript@7`
package does not ship it. With only TypeScript 7 installed, `npm install` fails with
`ERESOLVE` because the peer range is `typescript ^6.0.0`, and after a forced install
generation fails with
`TypeError: Cannot read properties of undefined (reading 'AnyKeyword')`.

The generated builders compile with TypeScript 7. To use TypeScript 7 for your code,
install it beside TypeScript 6, as the TypeScript team recommends for tools that
still need the compiler API:

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@7.0.2",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  }
}
```

`typescript` then provides the TypeScript 6 API that Hey API loads (its compiler runs
as `tsc6`), and `tsc` runs TypeScript 7. CI generates a client this way and compiles
it with TypeScript 7. See [TypeScript versions](https://jeffreynijs.github.io/mimlet/guide/compatibility.html#typescript-versions).

## Migration from v2

Generated clients must install the matching `@mimlet/core` runtime.
Regenerate clients with the upgraded plugin and keep that generated diff in the
consumer migration. Do not silently release these changes as a v2 patch.

Builders retain constructor patches, `with`, `transform`, `build`, `buildList`
and generated property helpers for ordinary records. Fluent subclass types are
retained after configuration. Fresh per-build overrides, whole replacements,
optional omission, async transforms/builds, and operation inspection now share
the canonical runtime.

Object-union transitions require complete replacement rather than a partial
discriminant patch. Record/non-record transitions are explicit. Lists have the
core's default 10,000-item allocation budget. All patches run before transforms.
Async chains retain property helpers but do not expose synchronous build methods
in TypeScript. Native Date/Map values are not spread into plain objects.

The repository's [migration guide](https://jeffreynijs.github.io/mimlet/guide/hey-api-migration.html) explains these
contracts. The [archived v2 guide](https://jeffreynijs.github.io/mimlet/guide/hey-api-v2.html) is retained only as
historical configuration/reference documentation, not current installation advice.

## Verification

Real Swagger 2, OpenAPI 3.0 and OpenAPI 3.1 fixtures are generated, compiled and
executed. Negative declaration cases, compiled with `exactOptionalPropertyTypes`,
test incorrect properties, an explicit `undefined` for an optional property,
incomplete union transitions and async capability changes. A clean packed consumer installs the
actual core/plugin tarballs, runs the real generator, compiles the generated
NodeNext client, and imports its emitted ESM without source aliases.
