import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import {
  groupSupportedRange,
  readVendorMatrix,
  readWorkspace,
  releaseDistTag,
  satisfiesPeerRange,
  supportedPeerRange,
  testedPeerRange,
} from '../../scripts/check-workspace.mjs';
const baseline = await readWorkspace();
const vendorVersions = await readFile(
  new URL('../../tests/vendor-versions.json', import.meta.url),
  'utf8'
);
const classValidatorGroup = (matrix) =>
  matrix.groups.find(
    (group) => group.adapter === 'class-validator' && group.dependency === 'class-validator'
  );
async function fixture(action) {
  const root = await mkdtemp(join(tmpdir(), 'toolkit-workspace-test-'));
  const write = async (path, value) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const change = async (path, edit) => {
    const value = JSON.parse(await readFile(join(root, path), 'utf8'));
    edit(value);
    await write(path, value);
  };
  try {
    await write('package.json', baseline.manifest);
    await write('tests/vendor-versions.json', vendorVersions);
    for (const item of baseline.packages) {
      const name = item.directory.split(/[\\/]/).at(-1);
      await write(`packages/${name}/package.json`, item.manifest);
      await write(`packages/${name}/README.md`, 'Test readme');
      await write(`packages/${name}/LICENSE`, 'MIT');
    }
    await action({ root, write, change });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
it('recognizes the complete workspace and orders internal dependencies first', () =>
  fixture(async ({ root }) => {
    const workspace = await readWorkspace(root);
    const names = workspace.packages.map((item) => item.manifest.name);
    assert.equal(names[0], '@mimlet/core');
    for (const item of workspace.packages)
      for (const dependency of Object.keys(item.manifest.dependencies ?? {})) {
        if (names.includes(dependency))
          assert.ok(names.indexOf(dependency) < names.indexOf(item.manifest.name));
      }
  }));
it('rejects missing/mismatched internal packages before installation falls back to npm', () =>
  fixture(async ({ root, change }) => {
    const path = 'packages/adapter/package.json';
    await change(path, (pkg) => {
      pkg.dependencies['@mimlet/core'] = '99.0.0';
    });
    await assert.rejects(readWorkspace(root), /must match/);
    await change(path, (pkg) => {
      pkg.dependencies = { '@mimlet/missing': '0.1.0' };
    });
    await assert.rejects(readWorkspace(root), /missing internal/);
    await change(path, (pkg) => {
      pkg.dependencies = { mimlet: '0.1.0-alpha.0' };
    });
    await assert.rejects(readWorkspace(root), /missing internal/);
  }));
it('rejects accidental root publication, package metadata drift, cycles and runtime coupling', async () => {
  const changes = [
    [
      'package.json',
      (pkg) => {
        pkg.private = false;
      },
      /root must be private/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.private = true;
      },
      /publishing boundary/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.version = '../bad';
      },
      /invalid version/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.name = '@other/core';
      },
      /mismatch/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.publishConfig.tag = 'next';
      },
      /distribution tag/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.publishConfig.provenance = false;
      },
      /provenance/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.repository.directory = '.';
      },
      /repository metadata/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.files.push('src');
      },
      /file selection/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.exports['.'] = './dist/../secret.js';
      },
      /traversal/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.exports['.'] = './src/index.ts';
      },
      /unsafe export/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.bin = { demo: '../secret' };
      },
      /executable target/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.dependencies = { faker: '1' };
      },
      /core must not require/,
    ],
    [
      'packages/adapter/package.json',
      (pkg) => {
        pkg.dependencies[pkg.name] = pkg.version;
      },
      /cycle/,
    ],
  ];
  for (const [path, edit, pattern] of changes)
    await fixture(async ({ root, change }) => {
      await change(path, edit);
      await assert.rejects(readWorkspace(root), pattern);
    });
});
it('publishes prerelease toolkit packages to latest and Hey API prereleases to next', () => {
  assert.equal(releaseDistTag('@mimlet/core', '0.1.0-beta.1'), 'latest');
  assert.equal(releaseDistTag('@mimlet/zod', '0.1.0'), 'latest');
  assert.equal(releaseDistTag('hey-api-builders', '3.0.0-beta.1'), 'next');
  assert.equal(releaseDistTag('hey-api-builders', '3.0.0'), 'latest');
  for (const [name, version] of [
    [undefined, '0.1.0'],
    ['@mimlet/core', undefined],
  ])
    assert.throws(() => releaseDistTag(name, version), /distribution tag/);
});
it('rejects every publishConfig.tag outside the channel policy', async () => {
  const rejected = [
    // A prerelease @mimlet package on next would leave latest behind and need a manual retag.
    ['core', { tag: 'next' }],
    // hey-api-builders prereleases must never move latest away from the stable major.
    ['hey-api-builders', { tag: 'latest' }],
    // Stable versions are only published to latest.
    ['adapter', { version: '0.1.0', tag: 'next' }],
    ['hey-api-builders', { version: '3.0.0', tag: 'next' }],
    // Only latest and next exist; a missing tag would fall back to npm's default.
    ['core', { tag: 'beta' }],
    ['hey-api-builders', { tag: 'beta' }],
    ['core', { tag: undefined }],
  ];
  for (const [directory, { version, tag }] of rejected)
    await fixture(async ({ root, change }) => {
      await change(`packages/${directory}/package.json`, (pkg) => {
        if (version) pkg.version = version;
        pkg.publishConfig.tag = tag;
      });
      await assert.rejects(readWorkspace(root), /incorrect distribution tag/);
    });
  for (const [directory, version] of [
    ['adapter', '0.1.0'],
    ['hey-api-builders', '3.0.0'],
  ])
    await fixture(async ({ root, change }) => {
      await change(`packages/${directory}/package.json`, (pkg) => {
        pkg.version = version;
        pkg.publishConfig.tag = 'latest';
      });
      await assert.doesNotReject(readWorkspace(root));
    });
});
it('does not follow symbolic package manifests', () =>
  fixture(async ({ root }) => {
    const path = join(root, 'packages/core/package.json');
    const value = await readFile(path);
    await rm(path);
    await writeFile(join(root, 'other.json'), value);
    await symlink(join(root, 'other.json'), path);
    await assert.rejects(readWorkspace(root), /symbolic links/);
  }));
it('derives supported peer ranges up to the next breaking release and tested ranges from the matrix', () => {
  assert.equal(supportedPeerRange('4.0.0'), '>=4.0.0 <5');
  assert.equal(supportedPeerRange('10.5.0'), '>=10.5.0 <11');
  assert.equal(supportedPeerRange('0.34.48'), '>=0.34.48 <0.35');
  assert.equal(supportedPeerRange('0.0.3'), '>=0.0.3 <0.1');
  assert.equal(testedPeerRange('1.3.34', '1.3.34'), '1.3.34');
  assert.equal(testedPeerRange('4.4.3', '4.6.5'), '>=4.4.3 <=4.6.5');
  for (const [version, range, expected] of [
    ['4.0.1', '>=4.0.0 <5', true],
    ['4.99.0', '>=4.0.0 <5', true],
    ['5.0.0', '>=4.0.0 <5', false],
    ['3.22.2', '>=4.0.0 <5', false],
    ['0.34.60', '>=0.34.48 <0.35', true],
    ['0.35.0', '>=0.34.48 <0.35', false],
    ['1.0.0', '>=0.34.48 <0.35', false],
    ['4.6.5', '>=4.4.3 <=4.6.5', true],
    ['4.6.6', '>=4.4.3 <=4.6.5', false],
    ['1.3.34', '1.3.34', true],
    ['1.3.35', '1.3.34', false],
  ])
    assert.equal(satisfiesPeerRange(version, range), expected, `${version} ${range}`);
  assert.throws(() => satisfiesPeerRange('4.0.0', '^4.0.0'), /unsupported peer range/);
  assert.throws(() => supportedPeerRange('4.0.0-beta.1'), /exact x\.y\.z/);
  // The minorLines exception: tested 0.x minor lines widen the range to the next untested one.
  assert.equal(supportedPeerRange('0.14.1', ['0.14', '0.15']), '>=0.14.1 <0.16');
  assert.equal(satisfiesPeerRange('0.15.9', '>=0.14.1 <0.16'), true);
  assert.equal(satisfiesPeerRange('0.16.0', '>=0.14.1 <0.16'), false);
  assert.throws(() => supportedPeerRange('1.0.0', ['1.0', '1.1']), /0\.x libraries only/);
});
it('publishes every native peer as its supported range and the matrix range as tested', async () => {
  const matrix = await readVendorMatrix(baseline.root);
  for (const { directory, manifest } of baseline.packages.filter((item) => item.manifest.mimlet)) {
    const adapter = directory.split(/[\\/]/).at(-1);
    for (const [name, tested] of Object.entries(manifest.mimlet.testedPeers)) {
      const group = matrix.groups.find(
        (item) => item.adapter === adapter && item.dependency === name
      );
      assert.equal(tested, group.range, manifest.name);
      assert.equal(manifest.peerDependencies[name], groupSupportedRange(group), manifest.name);
      if (!group.minorLines) {
        const minimum = tested.replace(/^>=/, '').split(' ')[0];
        assert.equal(manifest.peerDependencies[name], supportedPeerRange(minimum), manifest.name);
      }
    }
  }
  const changes = [
    [
      'packages/zod/package.json',
      (pkg) => {
        pkg.mimlet.testedPeers.zod = '>=4.3.0 <=4.7.0';
      },
      /mimlet\.testedPeers\.zod must be >=4\.3\.0 <=4\.6\.5/,
    ],
    [
      'packages/zod/package.json',
      (pkg) => {
        delete pkg.mimlet;
      },
      /mimlet\.testedPeers\.zod must be/,
    ],
    [
      'packages/effect/package.json',
      (pkg) => {
        pkg.peerDependencies.effect = '4.0.0';
      },
      /peerDependencies\.effect must be >=4\.0\.0 <5/,
    ],
    [
      'packages/typebox-legacy/package.json',
      (pkg) => {
        pkg.peerDependencies['@sinclair/typebox'] = '>=0.34.48 <1';
      },
      /must be >=0\.34\.48 <0\.35/,
    ],
    [
      'packages/valibot/package.json',
      (pkg) => {
        pkg.devDependencies.valibot = '1.6.0';
      },
      /devDependencies\.valibot must be a tested version/,
    ],
    [
      'packages/fast-check/package.json',
      (pkg) => {
        pkg.peerDependencies['pure-rand'] = '>=8.0.0 <9';
      },
      /native peer pure-rand has no group/,
    ],
    [
      'packages/faker/package.json',
      (pkg) => {
        pkg.mimlet.notes = 'free text';
      },
      /may only contain a testedPeers object/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        matrix.groups.find((group) => group.adapter === 'effect').maximum = '4.0.0';
      },
      /minimum and maximum must be the first and last tested versions/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        matrix.groups.find((group) => group.adapter === 'effect').versions.reverse();
      },
      /distinct and ascending/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        matrix.groups.find((group) => group.adapter === 'arktype').range = '>=2.2.5 <3';
      },
      /range must be >=2\.2\.5 <=2\.2\.7/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        matrix.groups = matrix.groups.filter((group) => group.adapter !== 'valibot');
      },
      /native peer valibot has no group/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        matrix.groups.push({ ...matrix.groups[0], adapter: 'core' });
      },
      /@mimlet\/core has no zod peer/,
    ],
    // The minorLines exception is explicit and checked against the tested versions.
    [
      'tests/vendor-versions.json',
      (matrix) => {
        delete classValidatorGroup(matrix).minorLines;
      },
      /peerDependencies\.class-validator must be >=0\.14\.1 <0\.15/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        const group = classValidatorGroup(matrix);
        group.versions = group.versions.filter((entry) => entry.version.startsWith('0.14.'));
        group.maximum = group.versions.at(-1).version;
        group.range = testedPeerRange(group.minimum, group.maximum);
      },
      /minorLines must list consecutive 0\.x minor lines/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        classValidatorGroup(matrix).minorLines = ['0.14', '0.16'];
      },
      /minorLines must list consecutive 0\.x minor lines/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        const group = classValidatorGroup(matrix);
        group.versions = group.versions.filter((entry) => entry.version !== '0.14.1');
        group.minimum = '0.14.2';
        group.range = testedPeerRange(group.minimum, group.maximum);
        group.minorLines = ['0.14', '0.15', '0.16'];
      },
      /minorLines must list consecutive 0\.x minor lines/,
    ],
    [
      'tests/vendor-versions.json',
      (matrix) => {
        const group = matrix.groups.find((item) => item.adapter === 'zod');
        group.minorLines = ['4.4', '4.5'];
      },
      /minorLines must list consecutive 0\.x minor lines/,
    ],
  ];
  for (const [path, edit, pattern] of changes)
    await fixture(async ({ root, change }) => {
      await change(path, edit);
      await assert.rejects(readWorkspace(root), pattern);
    });
});
