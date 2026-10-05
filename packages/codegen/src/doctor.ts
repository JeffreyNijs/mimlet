import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { satisfies, valid, validRange } from 'semver';
import { reportStatus } from './diagnostics.js';
import type { Diagnostic, DiagnosticReport } from './diagnostics.js';

interface PackageData {
  name?: unknown;
  version?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  engines?: { node?: unknown };
  /** `mimlet.testedPeers`: the peer versions an adapter was tested with, inside its peer ranges. */
  mimlet?: unknown;
}
interface Installed {
  data: PackageData;
  directory: string;
}
export interface ProjectPackage {
  readonly name: string;
  readonly version: string;
  readonly peers: readonly {
    name: string;
    /** The supported peer range. */
    required: string;
    /** The tested range inside `required`, when the package declares one. */
    tested?: string;
    installed: string | null;
    optional: boolean;
  }[];
}
export interface DoctorReport extends DiagnosticReport {
  readonly command: 'doctor';
  readonly node: string;
  readonly packages: readonly ProjectPackage[];
}
const toolkit = (name: string) => name === 'hey-api-builders' || name.startsWith('@mimlet/');
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
function dependencies(value: unknown): [string, string][] {
  if (value === undefined) {
    return [];
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('metadata');
  }
  const entries = Object.entries(value);
  if (
    entries.length > 512 ||
    entries.some(
      ([name, range]) =>
        name.length > 214 ||
        !packageName.test(name) ||
        typeof range !== 'string' ||
        range.length > 512
    )
  ) {
    throw new Error('metadata');
  }
  return entries as [string, string][];
}
/** A missing field or one without `testedPeers` declares no tested ranges. */
function testedPeers(value: unknown): Map<string, string> {
  if (value === undefined) {
    return new Map();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('metadata');
  }
  return new Map(dependencies((value as { testedPeers?: unknown }).testedPeers));
}
async function manifest(file: string): Promise<Installed | undefined> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > 2_000_000) {
      throw new Error('metadata');
    }
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('metadata');
    }
    return { data: value as PackageData, directory: dirname(await realpath(file)) };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return undefined;
    }
    throw error;
  }
}
/** Inspect installed manifests only. No application modules, scripts or network calls run. */
export async function diagnoseProject(directory: string = process.cwd()): Promise<DoctorReport> {
  const root = resolve(directory);
  const diagnostics: Diagnostic[] = [];
  const packages: ProjectPackage[] = [];
  const cache = new Map<string, Promise<Installed | undefined>>();
  const locate = async (name: string, from: string): Promise<Installed | undefined> => {
    let current = from;
    for (let depth = 0; depth < 64; depth++) {
      if (basename(current) !== 'node_modules') {
        const file = join(current, 'node_modules', name, 'package.json');
        if (!cache.has(file)) {
          cache.set(file, manifest(file));
        }
        const installed = await cache.get(file);
        if (installed) {
          return installed;
        }
      }
      const parent = dirname(current);
      if (parent === current) {
        return undefined;
      }
      current = parent;
    }
    throw new Error('lookup budget');
  };
  const add = (
    code: string,
    message: string,
    hint: string,
    pkg?: string,
    details: Pick<Diagnostic, 'expected' | 'actual' | 'dependency'> = {},
    severity: Diagnostic['severity'] = 'error'
  ) => {
    diagnostics.push({
      code,
      severity,
      message,
      hint,
      ...(pkg ? { package: pkg } : {}),
      ...details,
    });
  };
  try {
    const project = await manifest(join(root, 'package.json'));
    if (!project) {
      add(
        'PROJECT_NOT_FOUND',
        'No package.json was found in the selected project.',
        'Run doctor in the project directory or pass --project.'
      );
    } else {
      const declared = new Map(
        [
          ...dependencies(project.data.dependencies),
          ...dependencies(project.data.devDependencies),
          ...dependencies(project.data.optionalDependencies),
          ...dependencies(project.data.peerDependencies),
        ].filter(([name]) => toolkit(name))
      );
      if (!declared.size) {
        add(
          'NO_MIMLET_PACKAGES',
          'This project declares no Mimlet packages.',
          'Install the core or the adapter you need using a coherent release train.',
          undefined,
          {},
          'warning'
        );
      }
      const queue = [...declared.keys()].sort().map((name) => ({ name, from: project.directory }));
      const visited = new Set<string>();
      let inspected = 0;
      for (const item of queue) {
        if (++inspected > 128) {
          throw new Error('package budget');
        }
        const installed = await locate(item.name, item.from);
        if (!installed) {
          add(
            'PACKAGE_NOT_INSTALLED',
            'A declared Mimlet package is not installed.',
            'Install the project dependencies before running doctor.',
            item.name
          );
          continue;
        }
        if (visited.has(installed.directory)) {
          continue;
        }
        visited.add(installed.directory);
        const pkg = installed.data;
        if (pkg.name !== item.name || typeof pkg.version !== 'string' || !valid(pkg.version)) {
          throw new Error('package identity');
        }
        const requested = item.from === project.directory ? declared.get(item.name) : undefined;
        if (requested && validRange(requested) && !satisfies(pkg.version, requested)) {
          add(
            'DECLARED_VERSION_MISMATCH',
            'The installed package does not satisfy package.json.',
            'Reinstall dependencies and check the lockfile.',
            item.name,
            { expected: requested, actual: pkg.version }
          );
        }
        if (
          pkg.engines !== undefined &&
          (!pkg.engines || typeof pkg.engines !== 'object' || Array.isArray(pkg.engines))
        ) {
          throw new Error('engines metadata');
        }
        const node = pkg.engines?.node;
        if (node !== undefined) {
          if (typeof node !== 'string' || node.length > 512 || !validRange(node)) {
            throw new Error('node range');
          }
          if (!satisfies(process.versions.node, node)) {
            add(
              'NODE_VERSION_UNSUPPORTED',
              'The running Node version does not satisfy this package.',
              'Use a supported Node version.',
              item.name,
              { expected: node, actual: process.versions.node }
            );
          }
        }
        const peers: ProjectPackage['peers'][number][] = [];
        const testedRanges = testedPeers(pkg.mimlet);
        for (const [name, range] of dependencies(pkg.peerDependencies)) {
          const tested = testedRanges.get(name);
          if (!validRange(range) || (tested !== undefined && !validRange(tested))) {
            throw new Error('peer range');
          }
          const peer = await locate(name, installed.directory);
          const optional = pkg.peerDependenciesMeta?.[name]?.optional === true;
          const version = peer?.data.version;
          if (peer && (peer.data.name !== name || typeof version !== 'string' || !valid(version))) {
            throw new Error('peer identity');
          }
          const actual = typeof version === 'string' ? version : null;
          peers.push({
            name,
            required: range,
            ...(tested === undefined ? {} : { tested }),
            installed: actual,
            optional,
          });
          if (!actual && !optional) {
            add(
              'PEER_NOT_INSTALLED',
              'A required peer dependency is not installed.',
              `Install ${name} at a supported version.`,
              item.name,
              { dependency: name, expected: range }
            );
          } else if (actual && !satisfies(actual, range)) {
            add(
              'PEER_VERSION_UNSUPPORTED',
              'An installed peer dependency is outside the supported range.',
              `Align ${name} with the adapter's supported range.`,
              item.name,
              { dependency: name, expected: range, actual }
            );
          } else if (actual && tested !== undefined && !satisfies(actual, tested)) {
            // Supported (npm accepts it) but not one of the versions the adapter was tested with.
            add(
              'PEER_VERSION_UNTESTED',
              'An installed peer dependency is inside the supported range but outside the tested range.',
              `Versions newer than the tested range usually work. Report problems at https://github.com/JeffreyNijs/mimlet/issues, or pin ${name} to a version in ${tested} to stay on tested versions.`,
              item.name,
              { dependency: name, expected: tested, actual },
              'warning'
            );
          }
          if (toolkit(name) && peer) {
            queue.push({ name, from: installed.directory });
          }
        }
        const optionalDependencies = new Map(dependencies(pkg.optionalDependencies));
        for (const [name, range] of new Map([
          ...dependencies(pkg.dependencies),
          ...optionalDependencies,
        ])) {
          if (!toolkit(name)) {
            continue;
          }
          const dependency = await locate(name, installed.directory);
          const version = dependency?.data.version;
          if (!validRange(range)) {
            throw new Error('dependency range');
          }
          if (!dependency && optionalDependencies.has(name)) {
            continue;
          }
          if (
            !dependency ||
            typeof version !== 'string' ||
            !valid(version) ||
            !satisfies(version, range)
          ) {
            add(
              'TOOLKIT_DEPENDENCY_MISMATCH',
              'An internal toolkit dependency is missing or incompatible.',
              'Reinstall a matching coordinated Mimlet release train.',
              item.name,
              {
                dependency: name,
                expected: range,
                ...(typeof version === 'string' && valid(version) ? { actual: version } : {}),
              }
            );
          }
          if (dependency) {
            queue.push({ name, from: installed.directory });
          }
        }
        packages.push({
          name: item.name,
          version: pkg.version,
          peers: peers.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
      const releases = new Set(
        packages.filter((pkg) => pkg.name.startsWith('@mimlet/')).map((pkg) => pkg.version)
      );
      if (releases.size > 1) {
        add(
          'MIXED_TOOLKIT_RELEASES',
          'Multiple scoped Mimlet release versions are installed.',
          'Align direct dependencies to one coordinated train to avoid duplicate runtimes and type identities.',
          undefined,
          {},
          'warning'
        );
      }
    }
  } catch {
    add(
      'PROJECT_INSPECTION_FAILED',
      'Package metadata could not be inspected safely within the inspection budget.',
      'Check package.json validity, installed package metadata and filesystem permissions. No project code was executed.'
    );
  }
  return {
    format: 'mimlet/diagnostics',
    version: 1,
    command: 'doctor',
    ok: reportStatus(diagnostics),
    node: process.versions.node,
    packages: packages.sort(
      (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
    ),
    diagnostics,
  };
}
