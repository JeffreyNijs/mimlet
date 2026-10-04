# Changelog

## 0.1.0-beta.1

### Patch Changes

- c7bd391: Type serialized bytes as `Uint8Array<ArrayBuffer>`, so `SerializedRequest` and
  `SerializedResponse` bodies, `SerializedMessage` payloads and `encodeContent()` results
  can be passed to `new Request()`, `new Response()` and `new Blob()` with the DOM
  library. TypeScript 6 rejected the previous `Uint8Array<ArrayBufferLike>` as
  `BodyInit`. A custom codec may still return any `Uint8Array`; bytes backed by a
  `SharedArrayBuffer`, which Fetch rejects at runtime, are now copied. If you build one
  of these serialized objects yourself, its bytes must own an ordinary `ArrayBuffer`
  (copy them with `new Uint8Array(bytes)` when they may not).
- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- eba145d: Honour `readOnly` and `writeOnly` written beside `$ref` in OpenAPI 3.1, as other `$ref`
  siblings already were. Request fixtures and checks no longer require server-assigned
  fields declared as `{ $ref, readOnly: true }`, and response checks drop `writeOnly` ones.
  OpenAPI 3.0 still ignores `$ref` siblings, as its specification requires.
- Updated dependencies
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0
  - @mimlet/json-schema@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4
  - @mimlet/json-schema@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 5bf6cd2: Draw session-less list items from one default session instead of repeating the
  first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
  for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
  builders. A single session-less build keeps its seed-1 value, and explicit sessions,
  snapshots and replay are unchanged. Factory builders can opt in through the new
  type-checked `defaultSession` option.
- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3
  - @mimlet/json-schema@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2
  - @mimlet/json-schema@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/api.

Offline OpenAPI operation fixtures with direction-aware schemas and explicit HTTP serialization.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
