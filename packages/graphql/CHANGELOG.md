# Changelog

## 0.1.0-beta.3

### Patch Changes

- @mimlet/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- 0bcdeea: Clearer preparation errors. A schema with a custom scalar but no `scalars` entry now
  names each missing scalar, and invalid or misplaced scalar hooks name the scalar too.
  Schema and operation validation failures, such as an unknown field or an
  introspection query, keep GraphQL's message in `issues` (bounded to 300 characters)
  and repeat the first one in the error message, instead of only a location. Variable
  and response issues are unchanged and still never echo fixture values.
- Updated dependencies [536ca1e]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- Updated dependencies
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4

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

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/graphql.

Native GraphQL input and operation-response fixtures without application resolvers or network access.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
