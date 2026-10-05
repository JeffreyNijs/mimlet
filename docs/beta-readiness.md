# Beta readiness checklist

The first beta, toolkit **0.1.0-beta.0** and `hey-api-builders` **3.0.0-beta.0**, was
published on `next` on 2026-10-03 after this checklist's entry items passed. Betas after
`0.1.0-beta.1` publish the `@mimlet/*` packages straight to `latest` and keep
`hey-api-builders` on `next`; see [distribution tags](releases.md#distribution-tags). The
candidate record (evidence for each item) is in
[the release PR](https://github.com/JeffreyNijs/mimlet/pull/55). The repository is in
Changesets `beta` mode. This document does not change versions or authorize publication.

Beta opens selected workflows to structured evaluation. It does not claim the
full [stable contract](stability.md), production adoption, universal schema
support or zero vulnerabilities. [Releases](releases.md) remains authoritative.

## Recorded alpha.2 baseline

Existing records, not beta-candidate verification:

- [Publication](releases.md): nineteen packages and new-version GitHub OIDC
  publication; future versions and artifacts still need verification.
- [Application trials](stabilization-evidence.md#application-trials): native
  Zod/Temporal and existing Hey API schemas, with type-checks, tests and builds.
  These are private integration branches, not production rollout or adoption.
- [Browser evidence](stabilization-evidence.md#cancellation-and-browser-failures):
  cancellation regression and a 200-case Firefox stress run without retries;
  bounded evidence, not a substitute for candidate-head browser checks.
- [Compatibility](compatibility.md) and [acceptance](acceptance.md) document
  tested interfaces, explicit vendor ranges and implementation limits.

## Entry: approve the beta candidate

- [ ] **Select the exact candidate.** The maintainer records source SHA, toolkit
      and Hey API versions and dist-tags; reviews the alpha-to-beta Changesets
      transition, changelogs and exact coordinated internal dependencies.
- [ ] **Review API and compatibility scope.** Identify intended beta contracts
      and known gaps for exported APIs/types, named builders, diagnostics and saved
      fixture/replay formats against the [proposed stable contract](stability.md).
      Document planned breaking changes and migrations, including [Hey API v3](hey-api-migration.md).
      Keep [compatibility targets](compatibility.md) unchanged unless new installed
      consumer/vendor evidence supports a change; do not extend core portability
      or existing tested native ranges by inference.
- [ ] **Pass final-head checks.** Link results at the exact candidate SHA for
      all [acceptance gates](acceptance.md#checks-that-must-pass-on-the-final-head):
      source/types, coverage, tarballs, dependency audit/review, browsers, platforms,
      runtimes, vendor ranges, examples and website. Preserve first-attempt browser
      failures and traces. Failed, blocked or unrun checks remain open.
- [ ] **Verify the checkout example.** [Bug, fix and replay](checkout-example.md)
      has executable regression coverage. Rerun the installed-tarball example tests
      at the candidate SHA to confirm the failing property, replay and corrected
      behavior; record results before marking this gate complete.
- [ ] **Inspect candidate artifacts.** Follow [preparation](releases.md#prepare-without-publishing)
      from the reviewed clean commit. Verify complete inventory, exports/declarations,
      exact internal dependencies, source/version/channel and digests; install the
      complete artifact set in a fresh consumer rather than relying on workspace imports.
- [ ] **Plan useful feedback.** Choose native-schema and Hey API evaluation
      workflows and a review point. Use the [beta feedback kit](beta-feedback.md)
      for the first-run tasks and its GitHub issue form for reports. Success means
      documented install/build/validate and failure/replay flows work against real
      application contracts. Record exact
      candidate/toolchain versions, expected versus actual results and minimal
      synthetic reproductions. Follow [security reporting](../SECURITY.md#reporting-a-vulnerability)
      for sensitive findings; do not require private captures in public reports.

## Publication is a separate approval

- [ ] The maintainer explicitly approves publishing the named candidate through
      [the release workflow](releases.md#subsequent-releases), including current npm
      ownership, trusted-publisher and environment checks. Checklist completion or
      merging alone does not authorize publication.
- [ ] After publication, verify each new registry artifact and its provenance
      against the reviewed inventory/source, coherent dist-tags (`latest` for
      `@mimlet/*`, `next` for `hey-api-builders`) and a clean full
      registry install. An already-published-version skip is not new OIDC evidence.
      Use [recovery](releases.md#failure-partial-release-and-rollback) for partial releases.

## Exit: review feedback and choose the next step

- [ ] Record native-schema and Hey API trial results with application base SHAs,
      beta/toolchain versions and findings. Alpha.2 trials do not verify a new beta;
      internal trials can supply evidence without implying external adoption.
- [ ] Triage feedback as fixed with regression coverage, duplicate, documented
      unsupported behavior or explicitly deferred with rationale. Broken documented
      install/build/replay flows, silent validation weakening, corrupt saved data or
      unresolved security-boundary violations block promotion. Missing evidence stays open.
- [ ] Recheck fixes with affected trials and full final-head gates; update limits
      and migration notes. Changed source/artifacts require a new candidate version.
- [ ] The maintainer records another beta, release candidate or hold. Stable
      promotion still requires every [first-stable gate](stability.md#gates-for-the-first-stable-release),
      including new trusted-publisher RC evidence and explicit stable approval.
      Application merges, deployments and stable publication remain separate decisions.
