# Versioning

All neutral packages share one version. `hey-api-builders` retains its existing
npm identity and has its own major version because generated code now imports
the shared runtime. This repository root is private and never published.

The initial prepared train is `0.1.0-alpha.0` (Hey API integration `3.0.0-alpha.0`).
These are prerelease source versions, not a claim that npm publication occurred.
Add a changeset with `pnpm changeset` for subsequent changes. Before the next
prerelease cycle, run `pnpm changeset pre enter alpha`; run `pnpm version-packages`
to apply changes. Inspect the version plan and all generated changelogs. Leaving
prerelease mode with `pnpm changeset pre exit` is a deliberate stable-release
operation, not part of normal development.

Internal runtime dependencies remain exact rather than source-only workspace
protocols. After versioning, `pnpm check:workspace` catches any drift. The package
publishConfig tag is `latest` for every `@mimlet/*` package, including prereleases.
`hey-api-builders` keeps `next` for prereleases and changes to `latest` only for a
reviewed stable train. See `docs/releases.md` for distribution tags, artifact
verification, trusted publisher setup, partial-release recovery, and rollback.
