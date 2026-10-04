# Changelog

## 0.1.0-beta.1

### Patch Changes

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

- 62e6669: Accept ArkType 2.2.5 through 2.2.7 and Faker 10.5.0 through 10.6.0, each tested
  against the packed adapter. Faker's replay identity now names the loaded Faker
  release instead of always claiming 10.5.0. ArkType exposes no runtime version, so
  `arkTypeAdapter().metadata` reports `supportedVersions` instead of a fixed `version`;
  its generation identity still comes from the converted input schema.
- @mimlet/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 21ef5a9: Raise a descriptive `TypeError` when a Faker builder or `fakerAdapter().instance()`
  runs without the required explicit session, instead of failing with an opaque
  property access error. The check runs before the factory; Faker still has no
  default session and its types continue to require one.
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

- Add deterministic, locale-aware Faker factories and Standard Schema validation.
