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

- b92c4ca: Compile the declarations without the DOM library. `JsonResponseOptions.headers`
  referenced the DOM-only global `HeadersInit`, so a Node-only project (`@types/node`
  without `lib: ["DOM"]`, and `skipLibCheck: false`) failed with TS2304. It now accepts
  whatever the global `Headers` constructor accepts: still `HeadersInit` with the DOM
  library, and the equivalent `@types/node` type without it.
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

- Add isolated component loaders, JSON response resolvers and explicit persistence handoff.
