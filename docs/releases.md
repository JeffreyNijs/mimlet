# Releases and recovery

Preparing the repository, merging a PR and publishing packages are separate
operations. The current published train is the fourth beta: toolkit `0.1.0-beta.3` on npm's
`latest` tag and Hey API integration `3.0.0-beta.3` on `next`. It includes all nineteen
packages, with direct named setters and schema field lists, local diagnostics and native
Zod/ArkType adapters, targets Effect 4.0.0, accepts tested ArkType 2.2.5–2.2.7 and Faker
10.5.0–10.6.0, and documents its error and diagnostic codes as contracts. The
[GitHub prerelease](https://github.com/JeffreyNijs/mimlet/releases/tag/toolkit-v0.1.0-beta.3)
records its source commit and original package artifacts. The first seventeen-package
[alpha.0 release](https://github.com/JeffreyNijs/mimlet/releases/tag/toolkit-v0.1.0-alpha.0)
remains unchanged. For later trains,
version fields and green tests alone do not prove registry publication.

## Release train

The root is private. All scoped toolkit packages share a fixed Changesets version
group; the unscoped `hey-api-builders` keeps its own major version. Internal runtime
dependencies are exact. Root development links may use `workspace:*`, but published
manifests must contain the matching actual versions. `check-workspace.mjs` rejects
missing internal packages, version drift, dependency cycles, unexpected exports,
core vendor dependencies and incorrect release channels before installation.

Add a changeset for subsequent changes. The repository is in Changesets prerelease
mode (`.changeset/pre.json`, tag `beta`), so run `pnpm version-packages` for the next
beta. To move to a new prerelease tag (for example `rc`), run `pnpm changeset pre exit`
and then `pnpm changeset pre enter <tag>`. Changesets continues the prerelease number
across tags, so rename the first versions on the new tag to `.0` before
`pnpm check:workspace`, as was done for `0.1.0-beta.0`.
Review the
version plan, generated changelogs, exact internal dependency versions and package
`publishConfig.tag` fields (see [Distribution tags](#distribution-tags)). Refresh
`pnpm-lock.yaml` after versioning and run `pnpm check:workspace`. The guard
intentionally fails rather than concealing an incomplete version transition. Leaving
prerelease mode is a deliberate operation.

### Native peer ranges

Adapters publish two ranges for their native library (see
[supported and tested versions](compatibility.md#supported-and-tested-versions)).
The peer range runs from the tested minimum up to the library's next breaking
release, so users can install a compatible upstream release before Mimlet publishes
again. The tested range in `mimlet.testedPeers` comes from `tests/vendor-versions.json`,
and `check-workspace.mjs` rejects any drift between the two. Before preparing a
train, read the latest `Native library canary` run: add each newer release that
passed to `tests/vendor-versions.json` with its registry `resolved` and `integrity`,
update `mimlet.testedPeers`, and run `pnpm test:vendors <adapter>`. A new major of a
library always needs a reviewed adapter change and a new peer range.

## Distribution tags

Each package's `publishConfig.tag` decides the npm dist-tag it is published with.
Only `latest` and `next` are allowed:

| Train      | `@mimlet/*` packages | `hey-api-builders` |
| ---------- | -------------------- | ------------------ |
| Prerelease | `latest`             | `next`             |
| Stable     | `latest`             | `latest`           |

During the beta, `npm install @mimlet/core` installs the current beta. The examples
still pin exact versions, so fixtures and generated clients stay reproducible.
`hey-api-builders` prereleases stay on `next`, so its `latest` remains on the
stable v2 line until a stable 3.x release. The `next` tag of the `@mimlet/*`
packages stopped moving at `0.1.0-beta.1`; nothing updates it any more, so do not
use it to find the current version.

The rule is enforced in three places, and each fails closed:

- `check-workspace.mjs` (run by `pnpm install`, `pnpm check:workspace` and CI)
  rejects any `publishConfig.tag` that does not match the table.
- `pnpm release:prepare` copies each package's tag into `manifest.json` as
  `packages[].distTag`, checks it against the table, and checks that every packed
  tarball's own `publishConfig.tag` is the same. The top-level `prerelease` flag
  must match the core version.
- The publish workflow checks the GitHub prerelease flag against the manifest,
  repeats the table and tarball checks before any package is published, then runs
  `npm publish --tag <packages[].distTag>` for each package.

The workflow keeps its own inline copies of the policy and the tarball check;
`tests/tooling` fails if they differ from the tested functions in `scripts/`. It
also runs the publish step's script against fixture tarballs, with npm replaced by
a recorder, to check the tag passed for each package and the failure cases.

Still mark a beta's GitHub release as a prerelease: the flag must match the
versions, but it no longer selects the npm tag. Trusted publishing sets the tag at
publish time, so no retag is needed after a beta. When the workflow finishes,
`latest` already points at the new `@mimlet/*` versions.

## Prepare without publishing

From the reviewed commit with the pinned Node/pnpm toolchain:

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm pack:check
pnpm test:examples
node scripts/test-browser.mjs --install
pnpm release:prepare
```

`pack:check` verifies packages in a disposable location and does not require a clean
worktree. `release:prepare` requires a clean committed tree, refuses to overwrite an
existing `release` directory, and prepares that directory with all tarballs,
`manifest.json` and `SHA256SUMS`. The manifest records the source commit, complete
inventory, versions, each package's distribution tag, the prerelease flag and
SHA-256/SHA-512 digests. Package export
and ESM declaration diagnostics run against each actual tarball. Internal dependency
metadata is checked again after all packages have been packed. No publication
occurs during these commands.

Inspect the complete artifact set. Consumer tests install actual tarballs in fresh
projects; a successful workspace import is not equivalent evidence. Portable core,
browser, minimum-compiler, TypeScript 7 consumer and recipe jobs are separate
acceptance gates. Performance
reports are correctness-checked measurements, not hardware-independent speed promises.

## Publish through the reviewed release workflow

### First publication of the new npm names

npm requires a package to exist before it can receive a trusted-publisher
configuration. Releases introducing new package names use a separate bootstrap:

1. On the renamed repository's reviewed `main`, dispatch **Prepare provenance-backed
   first publication**. It runs the full acceptance gates, packs the entire train,
   and signs the verified archives in a separate credential-isolated GitHub job.
   It does not publish to npm and needs no npm token.
2. Download the `mimlet-first-publication` artifact from that exact workflow run.
   It contains `release/` and `provenance/`. Install `npm@11.19.0` into a temporary
   directory with lifecycle scripts disabled.
3. Run the verifier, then the publisher in an interactive terminal:

   ```sh
   node scripts/bootstrap-release.mjs verify /path/to/npm-runtime/node_modules/npm /path/to/artifact/release /path/to/artifact/provenance
   node scripts/bootstrap-release.mjs publish /path/to/npm-runtime/node_modules/npm /path/to/artifact/release /path/to/artifact/provenance
   ```

   Every archive, internal dependency, provenance signature, GitHub certificate
   identity, source commit and registry collision is checked before the first
   write. npm handles interactive security-key/2FA verification. Existing identical
   versions are skipped, so an interrupted batch can resume from the same artifact.

4. Configure each package's trusted publisher for `JeffreyNijs/mimlet`, workflow
   `npm-publish.yml`, environment `npm-publish`, allowing publication. Future
   releases use the normal workflow below.

The bootstrap pins npm's own configuration, 2FA, publishing and Sigstore modules.
It selects the pre-signed bundle instead of local automatic signing; it does not
strip provenance or change packed bytes. This avoids the npm CLI's conflicting
`publishConfig.provenance` and `--provenance-file` options. Updating the pinned npm
runtime requires reviewing those interfaces. Keep credentials out of artifacts.

### Subsequent releases

The publishing trigger is a GitHub release with tag
`toolkit-v<core version>`, for example `toolkit-v0.1.0-alpha.0`. The workflow checks
that the release commit belongs to `main`, runs acceptance, audits dependencies,
prepares the verified artifacts and compares the tag/prerelease flag to the manifest.
The scoped train and Hey API integration must use the same prerelease/stable channel.

Before each publication, confirm ownership of each npm name, the matching trusted
publisher, the intended `npm-publish` environment policy and the release source.
These external account controls can drift independently of the repository.
Keep long-lived npm credentials out of source and generated artifacts.

The publish job receives the verified artifact inventory rather than rebuilding
source with publishing credentials. It verifies archive/file identities, sizes,
digests, package metadata and the complete internal dependency graph before any
publish. The configured npm CLI publishes the tarballs with lifecycle scripts
disabled and provenance enabled, each with its own verified tag from
[Distribution tags](#distribution-tags). A tag outside the policy, a tarball whose
`publishConfig.tag` differs from the manifest, or a GitHub prerelease flag that
does not match the versions fails closed before the first package is published.
Do not retag afterwards; check the result with `npm view <package> dist-tags`.

## Failure, partial release and rollback

Publication across multiple npm packages is not transactional. The job checks all
existing package versions first. An identical already-published integrity is a
completed item; a different integrity or a failed registry request stops the job.
A retry can resume the remaining packages from the same verified artifact set.
Do not rebuild arbitrary different bytes and claim they are the same release.
Because betas go straight to `latest`, a partial publish leaves `latest` on the new
version for some `@mimlet/*` packages and on the previous one for others. Re-run
the failed workflow run for the same release to finish the train before announcing it.

Preserve the original release artifacts while investigating a partial publish.
Do not publish a replacement under a conflicting immutable version. Prepare a new
patch/prerelease train when a source or artifact correction is necessary, with
updated internal versions and new acceptance evidence. Registry errors are not
converted into permission to publish blindly.

For a bad release, consumers should pin a previous coherent train (including the
matching core and Hey API integration), or move to a corrected train. Maintainers
may deprecate a bad version and adjust distribution tags through their normal
reviewed npm process. Do not automatically unpublish packages or rewrite Git
history as a rollback. Never mix a generated v3 client with an incompatible core.

A bad beta reaches `latest` as soon as it is published, so new installs without a
version pick it up. Prefer publishing a fixed beta through the normal workflow; it
moves `latest` forward. If users need the previous train before a fix is ready,
the maintainer can move `latest` back for every affected `@mimlet/*` package with
`npm dist-tag add <package>@<good version> latest`. This is a manual step that
needs the maintainer's npm 2FA for each package; the release workflow never
changes tags after publishing.

This guide describes the release process; the linked release and registry metadata
provide publication evidence. A published alpha does not authorize releasing
unreviewed future artifacts. See [acceptance](acceptance.md) and [security](../SECURITY.md).
