/** First publication needs package ownership before npm can configure trusted publishers.
 * Sign on GitHub, then publish the exact verified bytes with npm's interactive authentication.
 * The pinned npm implementation supplies both Sigstore and 2FA; no tokens enter source/artifacts.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, lstat, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseManifest, validateReleasePackageMetadata } from './release-manifest.mjs';

export const bootstrapIdentity =
  'https://github.com/JeffreyNijs/mimlet/.github/workflows/npm-bootstrap.yml@refs/heads/main';
const registry = 'https://registry.npmjs.org/';

export function bootstrapFailureMessage(error) {
  // npm HTTP errors contain response headers, including session cookies. Report
  // the actionable message without serializing the response or nested causes.
  return error instanceof Error ? error.message : 'Bootstrap release failed';
}

export function validateBootstrapContext(env, commit) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REPOSITORY !== 'JeffreyNijs/mimlet' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_SHA !== commit ||
    `https://github.com/${env.GITHUB_WORKFLOW_REF}` !== bootstrapIdentity
  ) {
    throw new Error(
      'Attestation requires the matching reviewed main commit in the bootstrap workflow'
    );
  }
}

async function regularFile(path, maximum) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw new Error('Invalid release file');
  return readFile(path);
}

export async function readBootstrapRelease(directory) {
  const manifest = validateReleaseManifest(
    JSON.parse(await regularFile(join(directory, 'manifest.json'), 128000))
  );
  const expected = new Set([
    'manifest.json',
    'SHA256SUMS',
    ...manifest.packages.map((p) => p.filename),
  ]);
  if ((await readdir(directory)).some((file) => !expected.has(file)))
    throw new Error('Unexpected release file');
  const metadata = [];
  for (const pkg of manifest.packages) {
    const path = join(directory, pkg.filename);
    const bytes = await regularFile(path, 64 * 1024 * 1024);
    if (
      createHash('sha256').update(bytes).digest('hex') !== pkg.sha256 ||
      `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pkg.integrity
    ) {
      throw new Error(`Artifact digest mismatch: ${pkg.name}`);
    }
    const data = JSON.parse(
      execFileSync('tar', ['-xOf', path, 'package/package.json'], {
        encoding: 'utf8',
        maxBuffer: 1000000,
        timeout: 10000,
      })
    );
    if (
      data.repository?.url !== 'git+https://github.com/JeffreyNijs/mimlet.git' ||
      data.publishConfig?.provenance !== true
    ) {
      throw new Error('Invalid repository or provenance policy');
    }
    metadata.push(data);
  }
  validateReleasePackageMetadata(manifest, metadata);
  return { manifest, metadata };
}

export function validateBootstrapStatement(bundle, manifest, pkg) {
  const statement = JSON.parse(
    Buffer.from(bundle?.dsseEnvelope?.payload ?? '', 'base64').toString('utf8')
  );
  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  if (
    statement._type !== 'https://in-toto.io/Statement/v1' ||
    statement.predicateType !== 'https://slsa.dev/provenance/v1' ||
    workflow?.repository !== 'https://github.com/JeffreyNijs/mimlet' ||
    workflow?.path !== '.github/workflows/npm-bootstrap.yml' ||
    workflow?.ref !== 'refs/heads/main' ||
    definition?.resolvedDependencies?.length !== 1 ||
    definition.resolvedDependencies[0]?.digest?.gitCommit !== manifest.commit ||
    statement.subject?.length !== 1 ||
    statement.subject[0]?.digest?.sha512 !==
      Buffer.from(pkg.integrity.slice(7), 'base64').toString('hex')
  ) {
    throw new Error('Provenance source, commit or digest mismatch');
  }
  return statement;
}

export async function bootstrapRelease(mode, npmRoot, directory, provenanceDirectory) {
  if (!['attest', 'verify', 'publish'].includes(mode))
    throw new Error('Use attest, verify or publish');
  const npmManifest = JSON.parse(await readFile(join(npmRoot, 'package.json'), 'utf8'));
  if (npmManifest.name !== 'npm' || npmManifest.version !== '11.19.0')
    throw new Error('This bootstrap requires the pinned npm@11.19.0 runtime');
  const require = createRequire(join(npmRoot, 'package.json'));
  const npa = require('npm-package-arg');
  const { generateProvenance, verifyProvenance } = require(
    join(npmRoot, 'node_modules/libnpmpublish/lib/provenance.js')
  );
  const sigstore = require('sigstore');
  const { manifest, metadata } = await readBootstrapRelease(directory);
  const subjects = manifest.packages.map((pkg) => ({
    name: npa.toPurl(npa.resolve(pkg.name, pkg.version)),
    digest: { sha512: Buffer.from(pkg.integrity.slice(7), 'base64').toString('hex') },
  }));
  if (mode === 'attest') {
    validateBootstrapContext(process.env, manifest.commit);
    await mkdir(provenanceDirectory, { recursive: true });
    for (const [index, pkg] of manifest.packages.entries()) {
      // Rekor can accept a statement before its response exceeds npm's default
      // five-second timeout. Retrying the same POST then returns a duplicate 409.
      // Give signing services time to respond; retry a failed job as a new attempt.
      const bundle = await generateProvenance([subjects[index]], { timeout: 30000, retry: 0 });
      validateBootstrapStatement(bundle, manifest, pkg);
      await writeFile(
        join(provenanceDirectory, `${pkg.filename}.sigstore`),
        JSON.stringify(bundle),
        { flag: 'wx' }
      );
      console.log(`Attested ${pkg.name}@${pkg.version}`);
    }
    return;
  }
  // Verify every archive, dependency and signed statement before the first registry write.
  for (const [index, pkg] of manifest.packages.entries()) {
    const path = join(provenanceDirectory, `${pkg.filename}.sigstore`);
    const bundle = JSON.parse(await regularFile(path, 1000000));
    validateBootstrapStatement(bundle, manifest, pkg);
    await verifyProvenance(subjects[index], path);
    await sigstore.verify(bundle, {
      certificateIdentityURI: bootstrapIdentity,
      certificateIssuer: 'https://token.actions.githubusercontent.com',
    });
  }
  console.log(
    `Verified ${manifest.packages.length} archives and GitHub provenance bundles at ${manifest.commit}`
  );
  if (mode === 'verify') return;
  const pending = [];
  for (const [index, pkg] of manifest.packages.entries()) {
    const response = await globalThis.fetch(
      `${registry}${encodeURIComponent(pkg.name)}/${pkg.version}`,
      { signal: globalThis.AbortSignal.timeout(30000) }
    );
    if (response.status === 404) pending.push(index);
    else if (!response.ok) throw new Error(`Registry preflight failed: ${response.status}`);
    else if ((await response.json()).dist?.integrity !== pkg.integrity)
      throw new Error(`Published content differs: ${pkg.name}@${pkg.version}`);
    else console.log(`Already published with matching integrity: ${pkg.name}@${pkg.version}`);
  }
  if (!pending.length) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Initial publication requires an interactive npm session');
  const Npm = require(join(npmRoot, 'lib/npm.js'));
  const { otplease } = require(join(npmRoot, 'lib/utils/auth.js'));
  const { publish } = require('libnpmpublish');
  const npm = new Npm({
    npmRoot,
    argv: ['--registry', registry, '--auth-type', 'web', '--ignore-scripts'],
  });
  try {
    await npm.load();
    for (const index of pending) {
      const pkg = manifest.packages[index];
      const bytes = await regularFile(join(directory, pkg.filename), 64 * 1024 * 1024);
      if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pkg.integrity)
        throw new Error('Artifact changed after verification');
      console.log(`Publishing ${pkg.name}@${pkg.version} to ${pkg.distTag}`);
      // Select the pre-signed bundle, not local automatic signing. libnpmpublish
      // verifies and attaches it; the tarball's provenance policy remains true.
      const options = {
        ...npm.flatOptions,
        // Match the native CLI context so npm can apply an approved publish session.
        npmCommand: 'publish',
        registry,
        '@mimlet:registry': registry,
        access: 'public',
        // Verified per package against the policy and the tarball's publishConfig.tag.
        defaultTag: pkg.distTag,
        ignoreScripts: true,
        provenance: false,
        provenanceFile: join(provenanceDirectory, `${pkg.filename}.sigstore`),
      };
      await otplease(npm, options, (authenticated) =>
        publish(metadata[index], bytes, authenticated)
      );
      console.log(`Published ${pkg.name}@${pkg.version}`);
    }
  } finally {
    npm.unload();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 6)
    throw new Error(
      'Usage: node scripts/bootstrap-release.mjs <attest|verify|publish> <npm-runtime-directory> <release-directory> <provenance-directory>'
    );
  await bootstrapRelease(
    process.argv[2],
    resolve(process.argv[3]),
    resolve(process.argv[4]),
    resolve(process.argv[5])
  ).catch((error) => {
    console.error(bootstrapFailureMessage(error));
    process.exitCode = 1;
  });
}
