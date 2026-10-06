# Changelog

## 3.0.0-beta.5

### Patch Changes

- Updated dependencies [659949f]
- Updated dependencies [659949f]
- Updated dependencies [eca2898]
  - @mimlet/core@0.1.0-beta.5

## 3.0.0-beta.4

### Patch Changes

- Updated dependencies [62b95de]
- Updated dependencies [c1282f7]
  - @mimlet/core@0.1.0-beta.4

## 3.0.0-beta.3

### Patch Changes

- @mimlet/core@0.1.0-beta.3

## 3.0.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- a0a8142: Type generated `withX()` helpers with exactly what `.with()` accepts for that
  property, as core `fluent()` setters already are. Under `exactOptionalPropertyTypes`,
  an optional property such as `notes?: string` no longer accepts `withNotes(undefined)`,
  which built a present-but-undefined field that the model type forbids. Properties that
  include `undefined` explicitly still accept it. Regenerate the client to pick up the
  change; the generated file gains a local, unexported `BuilderSetterValue` type.
- Updated dependencies [536ca1e]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1

## 3.0.0-beta.0

### Patch Changes

- Promote the coordinated train from alpha to beta for structured evaluation. The beta
  scope, known limits and feedback workflows are recorded in the beta readiness checklist.
- eba145d: Generate `withX()` helpers for model properties that come from `allOf` members and
  references, as response builders already did. `oneOf`/`anyOf` models still get none,
  because a shared discriminant setter would allow a partial variant transition.
- Updated dependencies
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0

## 3.0.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4

## 3.0.0-alpha.3

### Patch Changes

- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3

## 3.0.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 3.0.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 3.0.0-alpha.0

- Move the plugin into the neutral toolkit workspace without changing its npm name.
- Generated builders now import the shared runtime, retain fluent property methods, and use the tested record/async/list contracts.
- Consumers must install the matching `@mimlet/core` runtime. See `docs/hey-api-migration.md`.
- This version is prepared source, not a publication announcement.

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-09

### Added

- Immutable, generated builders backed by Hey API's official
  `@faker-js/faker` factories.
- Builders for reusable definitions, aggregate operation requests, and
  status-specific operation responses.
- Typed constructor patches, `with()`, generated definition/request/response
  convenience methods, ordered `transform()`, `build()`, and `buildList()`.
- Direct forwarding of Faker's `faker`, `includeOptional`, and `useDefault`
  factory options.
- Category toggles and Hey API-compatible naming configuration for definitions,
  requests, and responses.
- Generated entry-file exports by default, with `includeInEntry` control.
- Real-generation end-to-end coverage for representative OpenAPI 2.0, 3.0, and
  3.1 inputs, generated TypeScript compilation, Faker execution, Zod acceptance,
  symbol conflicts, compositions, recursion, and unusual property names.
- ESM package exports aligned with Hey API, an explicit npm file allowlist, and
  release provenance configuration.

### Changed

- Rebuilt the plugin for `@hey-api/openapi-ts` 0.99 and Node.js 22.18 or newer.
- Declared TypeScript 6 as a peer to prevent Hey API 0.99 from being installed
  with an incompatible TypeScript 7 runtime.
- Delegated schema-aware data generation, constraints, defaults, optional
  properties, recursion, localization, and custom Faker rules to Hey API's
  official Faker plugin.
- Made all builder configuration methods immutable. Each call returns a new
  builder while leaving the source builder unchanged.
- Changed object override behavior to a documented shallow top-level merge;
  primitive values, arrays, and nested properties are replaced.
- Moved generation controls to the Faker plugin and runtime factory controls to
  `build()` and `buildList()`.

### Removed

- The custom runtime, static, and Zod mock strategies.
- `mockStrategy`, `generateZod`, `useZodForMocks`, and `useStaticMocks`.
- The custom output-name option and generated `setOptions()` API.
- Bundled Zod schema generation and v1 compatibility aliases.
- Legacy generated artifacts, source tests coupled to the old plugin API, and
  unpublished repository files from the npm package.

### Breaking

- Consumers must install `@faker-js/faker` and configure its official Hey API
  plugin before `hey-api-builders`.
- Generated output and imports change to `hey-api-builders.gen.ts` and its entry
  re-export.
- Builder calls no longer mutate an existing instance; callers must chain or
  retain the returned builder.
- Runtime validation is no longer implied. Use Hey API's Zod plugin explicitly
  when validation is required.

## [1.0.0 - 1.0.2] - 2025-10-06 to 2026-01-09

The 1.x line was the final generation of the legacy implementation. It offered
custom runtime, static, and Zod mock strategies and later corrected
model-name normalization for generated builder symbols. That implementation was
tied to the older Hey API custom-plugin surface and is no longer maintained.

Versions before 1.0 were prerelease iterations of that legacy design. See the
[Git history](https://github.com/JeffreyNijs/mimlet/tags) for their
individual tags.

[2.0.0]: https://github.com/JeffreyNijs/mimlet/compare/1.0.2...v2.0.0
[1.0.0 - 1.0.2]: https://github.com/JeffreyNijs/mimlet/compare/1.0.0...1.0.2
