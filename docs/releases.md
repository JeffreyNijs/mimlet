# Releases and recovery

Preparing the repository, merging a PR and publishing packages are separate
operations. The current published train is the second beta: toolkit `0.1.0-beta.1` and Hey
API integration `3.0.0-beta.1`, available on npm's `next` channel. It includes all nineteen
packages, with direct named setters and schema field lists, local diagnostics and native
Zod/ArkType adapters, targets Effect 4.0.0, accepts tested ArkType 2.2.5–2.2.7 and Faker
10.5.0–10.6.0, and documents its error and diagnostic codes as contracts. The
[GitHub prerelease](https://github.com/JeffreyNijs/mimlet/releases/tag/toolkit-v0.1.0-beta.1)
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
`publishConfig.tag` fields. They must be `next` for prereleases and `latest` only
for an explicitly reviewed stable train. Refresh `pnpm-lock.yaml` after versioning
and run `pnpm check:workspace`. The guard intentionally fails rather than concealing
an incomplete version transition. Leaving prerelease mode is a deliberate operation.

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
inventory, versions, distribution tag and SHA-256/SHA-512 digests. Package export
and ESM declaration diagnostics run against each actual tarball. Internal dependency
metadata is checked again after all packages have been packed. No publication
occurs during these commands.

Inspect the complete artifact set. Consumer tests install actual tarballs in fresh
projects; a successful workspace import is not equivalent evidence. Portable core,
browser, minimum-compiler and recipe jobs are separate acceptance gates. Performance
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
disabled and provenance enabled. Prereleases use `next`; stable releases use `latest`.
A non-matching tag or channel fails closed.

## Failure, partial release and rollback

Publication across multiple npm packages is not transactional. The job checks all
existing package versions first. An identical already-published integrity is a
completed item; a different integrity or a failed registry request stops the job.
A retry can resume the remaining packages from the same verified artifact set.
Do not rebuild arbitrary different bytes and claim they are the same release.

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

This guide describes the release process; the linked release and registry metadata
provide publication evidence. A published alpha does not authorize releasing
unreviewed future artifacts. See [acceptance](acceptance.md) and [security](../SECURITY.md).
