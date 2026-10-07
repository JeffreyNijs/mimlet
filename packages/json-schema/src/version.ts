/**
 * This package's version, so that two versions loaded into one process keep separate shared
 * generator caches. `scripts/check-workspace.mjs` rejects a value that differs from
 * `package.json`, and `pnpm version-packages` updates it.
 */
export const packageVersion = '0.1.0-beta.7';
