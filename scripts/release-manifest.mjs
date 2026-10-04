/** Pure release metadata checks shared by local preparation and release verification. */
import { releaseDistTag, versionPattern } from './check-workspace.mjs';
/** Format 2 records the channel as `prerelease` and each package's own npm dist-tag. */
export function validateReleaseManifest(value, expectedTag) {
  const fail = (message) => {
    throw new Error(`Release: ${message}`);
  };
  if (
    !value ||
    value.format !== 2 ||
    !/^[a-f0-9]{40}$/.test(value.commit ?? '') ||
    !versionPattern.test(value.coreVersion ?? '')
  )
    fail('invalid release identity');
  const tag = `toolkit-v${value.coreVersion}`;
  if (value.tag !== tag || (expectedTag !== undefined && expectedTag !== tag))
    fail('release tag does not match the core version');
  if (value.prerelease !== value.coreVersion.includes('-'))
    fail('release channel does not match the core version');
  if (!Array.isArray(value.packages) || value.packages.length < 2 || value.packages.length > 64)
    fail('invalid package inventory');
  const names = new Set(),
    files = new Set();
  for (const item of value.packages) {
    if (
      !item ||
      !/^(hey-api-builders|@mimlet\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(item.name ?? '') ||
      !versionPattern.test(item.version ?? '')
    )
      fail('invalid package identity');
    const filename = `${item.name.replace('@', '').replace('/', '-')}-${item.version}.tgz`;
    if (item.filename !== filename || files.has(filename) || names.has(item.name))
      fail('invalid or duplicate artifact filename');
    if (
      !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity ?? '')
    )
      fail('missing artifact digest');
    if (item.name !== 'hey-api-builders' && item.version !== value.coreVersion)
      fail('neutral packages must share the release train version');
    if (item.version.includes('-') !== value.coreVersion.includes('-'))
      fail('stable and prerelease packages cannot be mixed');
    if (item.distTag !== releaseDistTag(item.name, item.version))
      fail(`incorrect distribution tag for ${item.name}`);
    names.add(item.name);
    files.add(filename);
  }
  if (value.packages[0].name !== '@mimlet/core' || !names.has('hey-api-builders'))
    fail('core must be first and the integration must be included');
  return value;
}

/** Verify the entire packed dependency graph before the first package is published. */
export function validateReleasePackageMetadata(manifest, metadata) {
  const fail = (message) => {
    throw new Error(`Release metadata: ${message}`);
  };
  if (
    !manifest ||
    !Array.isArray(manifest.packages) ||
    !Array.isArray(metadata) ||
    metadata.length !== manifest.packages.length
  )
    fail('incomplete package inventory');
  const entries = new Map(manifest.packages.map((entry) => [entry.name, entry]));
  const seen = new Set();
  for (const pkg of metadata) {
    const expected = entries.get(pkg?.name);
    if (
      !expected ||
      seen.has(pkg.name) ||
      pkg.version !== expected.version ||
      pkg.private !== false
    )
      fail('packed package identity differs from the verified manifest');
    if (
      expected.distTag !== releaseDistTag(pkg.name, pkg.version) ||
      pkg.publishConfig?.tag !== expected.distTag
    )
      fail(`packed distribution tag differs from the verified manifest: ${pkg.name}`);
    seen.add(pkg.name);
    for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies = pkg[group] ?? {};
      if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies))
        fail('invalid dependency metadata');
      for (const [name, version] of Object.entries(dependencies)) {
        if (typeof version !== 'string') fail('dependency versions must be strings');
        const internal =
          name === 'hey-api-builders' ||
          name === 'mimlet' ||
          /^@mimlet\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
        if (internal && (!entries.has(name) || entries.get(name).version !== version))
          fail(`missing or mismatched internal dependency: ${name}`);
      }
    }
  }
  if (seen.size !== entries.size) fail('missing or duplicate package metadata');
  return metadata;
}
