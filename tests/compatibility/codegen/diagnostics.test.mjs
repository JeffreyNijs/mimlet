import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { diagnoseProject, inspectSchema, reportStatus } from '@mimlet/codegen';

const cli = join(dirname(fileURLToPath(import.meta.resolve('@mimlet/codegen'))), 'cli.js');
async function temporary(run) {
  const directory = await mkdtemp(join(tmpdir(), 'mimlet-doctor-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function json(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}
const installed = (root, name, data = {}) =>
  json(join(root, 'node_modules', name, 'package.json'), { name, version: '1.0.0', ...data });
const invoke = (...args) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30000 });
const codes = (report) => report.diagnostics.map((item) => item.code);

describe('project diagnostics from installed metadata', () => {
  it('resolves native peers and internal packages without importing project code', () =>
    temporary(async (root) => {
      await json(join(root, 'package.json'), { dependencies: { '@mimlet/custom': '1.0.0' } });
      await installed(root, '@mimlet/custom', {
        main: './do-not-execute.js',
        engines: { node: '>=22' },
        dependencies: { '@mimlet/core': '1.0.0' },
        peerDependencies: { vendor: '>=2.0.0 <3', '@mimlet/core': '1.0.0', absent: '*' },
        peerDependenciesMeta: { absent: { optional: true } },
        optionalDependencies: { '@mimlet/optional': '1.0.0' },
      });
      await writeFile(
        join(root, 'node_modules/@mimlet/custom/do-not-execute.js'),
        "throw new Error('PROJECT CODE MUST NOT RUN')"
      );
      await installed(root, '@mimlet/core');
      await installed(root, 'vendor', { version: '2.4.1' });
      const report = await diagnoseProject(root);
      assert.equal(report.ok, true);
      assert.equal(report.format, 'mimlet/diagnostics');
      assert.equal(report.version, 1);
      assert.deepEqual(
        report.packages.map((p) => p.name),
        ['@mimlet/core', '@mimlet/custom']
      );
      assert.equal(report.packages[1].peers.find((p) => p.name === 'vendor').installed, '2.4.1');
      assert.equal(report.packages[1].peers.find((p) => p.name === 'absent').installed, null);
      assert.deepEqual(report, await diagnoseProject(root));
      const command = invoke('doctor', '--project', root, '--json');
      assert.equal(command.status, 0, command.stderr);
      assert.deepEqual(JSON.parse(command.stdout), report);
      assert.match(invoke('doctor', '--project', root).stdout, /@mimlet\/custom@1.0.0/);
    }));
  it('reports stale installs, incompatible peers, missing dependencies and unsupported Node', () =>
    temporary(async (root) => {
      await json(join(root, 'package.json'), {
        dependencies: { '@mimlet/custom': '^2.0.0', '@mimlet/not-installed': '*' },
      });
      await installed(root, '@mimlet/custom', {
        engines: { node: '>=999' },
        dependencies: { '@mimlet/core': '2.0.0', '@mimlet/absent': '1.0.0' },
        peerDependencies: { vendor: '^2.0.0', missing: '^1.0.0' },
      });
      await installed(root, '@mimlet/core');
      await installed(root, 'vendor');
      const report = await diagnoseProject(root);
      assert.equal(report.ok, false);
      for (const code of [
        'DECLARED_VERSION_MISMATCH',
        'NODE_VERSION_UNSUPPORTED',
        'PEER_NOT_INSTALLED',
        'PEER_VERSION_UNSUPPORTED',
        'TOOLKIT_DEPENDENCY_MISMATCH',
        'PACKAGE_NOT_INSTALLED',
      ])
        assert(codes(report).includes(code), code);
      assert.equal(invoke('doctor', '--project', root, '--json').status, 1);
      assert.match(invoke('doctor', '--project', root).stdout, /needs attention/);
    }));
  it('recognizes workspace links, duplicate release trains and cycles', () =>
    temporary(async (root) => {
      await json(join(root, 'package.json'), {
        dependencies: { '@mimlet/custom': 'workspace:*', '@mimlet/core': '1.0.0' },
      });
      const linked = join(root, 'packages/custom');
      await json(join(linked, 'package.json'), {
        name: '@mimlet/custom',
        version: '2.0.0',
        dependencies: { '@mimlet/core': '2.0.0' },
      });
      await mkdir(join(root, 'node_modules/@mimlet'), { recursive: true });
      await symlink(linked, join(root, 'node_modules/@mimlet/custom'), 'junction');
      await installed(root, '@mimlet/core', { dependencies: { '@mimlet/custom': '2.0.0' } });
      await installed(linked, '@mimlet/core', { version: '2.0.0' });
      const report = await diagnoseProject(root);
      assert.equal(report.ok, true);
      assert(codes(report).includes('MIXED_TOOLKIT_RELEASES'));
      assert.equal(report.packages.filter((p) => p.name === '@mimlet/core').length, 2);
      assert.match(invoke('doctor', '--project', root).stdout, /warnings/);
    }));
  it('handles empty, missing and invalid projects without echoing private file contents', () =>
    temporary(async (root) => {
      assert(codes(await diagnoseProject(root)).includes('PROJECT_NOT_FOUND'));
      await json(join(root, 'package.json'), { private: true });
      assert(codes(await diagnoseProject(root)).includes('NO_MIMLET_PACKAGES'));
      for (const content of [
        '{"token":"SECRET_VALUE"',
        JSON.stringify([]),
        JSON.stringify({ dependencies: [] }),
        JSON.stringify({ dependencies: { '../invalid': 'SECRET_VALUE' } }),
        'x'.repeat(2_000_001),
      ]) {
        await writeFile(join(root, 'package.json'), content);
        const report = await diagnoseProject(root);
        assert.equal(report.ok, false);
        assert(codes(report).includes('PROJECT_INSPECTION_FAILED'));
        assert(!JSON.stringify(report).includes('SECRET_VALUE'));
      }
    }));
  it('rejects malformed installed metadata and bounds dependency traversal', () =>
    temporary(async (root) => {
      await json(join(root, 'package.json'), { dependencies: { '@mimlet/custom': '1.0.0' } });
      for (const data of [
        { name: 'wrong' },
        { version: 'SECRET_VALUE' },
        { engines: 'SECRET_VALUE' },
        { engines: { node: 'SECRET_VALUE' } },
        { peerDependencies: { vendor: 'SECRET_VALUE' } },
        { dependencies: { '@mimlet/core': 'SECRET_VALUE' } },
      ]) {
        await installed(root, '@mimlet/custom', data);
        const report = await diagnoseProject(root);
        assert.equal(report.ok, false);
        assert(!JSON.stringify(report).includes('SECRET_VALUE'));
      }
      await installed(root, '@mimlet/custom', { peerDependencies: { vendor: '*' } });
      await installed(root, 'vendor', { version: 'SECRET_VALUE' });
      assert.equal((await diagnoseProject(root)).ok, false);
      await json(join(root, 'package.json'), {
        dependencies: Object.fromEntries(
          Array.from({ length: 513 }, (_, i) => [`vendor${i}`, '1.0.0'])
        ),
      });
      assert.equal((await diagnoseProject(root)).ok, false);
      await json(join(root, 'package.json'), { dependencies: { '@mimlet/p0': '1.0.0' } });
      for (let i = 0; i < 130; i++)
        await installed(root, `@mimlet/p${i}`, {
          dependencies: { [`@mimlet/p${i + 1}`]: '1.0.0' },
        });
      assert(codes(await diagnoseProject(root)).includes('PROJECT_INSPECTION_FAILED'));
    }));
});

describe('data-only schema inspection and CLI diagnostics', () => {
  it('reports preparation and identity without sampling or printing fixture values', () => {
    const report = inspectSchema({ type: 'string', default: 'SECRET_VALUE' });
    assert.equal(report.ok, true);
    assert.equal(report.sampled, false);
    assert.equal(report.capabilities.network, false);
    assert(!JSON.stringify(report).includes('SECRET_VALUE'));
    assert.equal(inspectSchema(false).ok, true); // Preparation is not proof of satisfiability.
    assert.equal(
      inspectSchema(
        { $ref: 'https://schema.example.test/sample' },
        { references: { 'https://schema.example.test/sample': { type: 'integer' } } }
      ).ok,
      true
    );
    for (const schema of [
      { type: 'string', format: 'SECRET_VALUE' },
      { $dynamicRef: 'SECRET_VALUE' },
      { type: 'string', pattern: 'SECRET_VALUE(' },
      { $ref: 'https://private.invalid/SECRET_VALUE', default: 'SECRET_VALUE' },
    ]) {
      const bad = inspectSchema(schema);
      assert.equal(bad.ok, false);
      assert.equal(bad.diagnostics[0].code, 'SCHEMA_PREPARATION_FAILED');
      if (schema.$ref) {
        // A missing reference is named so it can be supplied; nothing else is printed.
        const [entry] = bad.diagnostics;
        assert.equal(entry.missingReference, schema.$ref);
        assert.equal(entry.schemaPath, '/$ref');
        assert.equal(entry.message, `Unresolved reference ${schema.$ref} at /$ref`);
        assert.match(entry.hint, /references map under this exact URI/);
        assert.equal(JSON.stringify(bad).split('SECRET_VALUE').length - 1, 2);
        continue;
      }
      assert(!JSON.stringify(bad).includes('SECRET_VALUE'));
      assert.match(bad.diagnostics[0].hint, /factory/);
    }
    // Only references the schema reaches are prepared; failures name the reference.
    const shop = 'https://shop.example.test/';
    const references = {
      [`${shop}Product.json`]: { type: 'object', properties: { id: { type: 'string' } } },
      [`${shop}PaymentMethod.json`]: { oneOf: [true], discriminator: { propertyName: 'type' } },
    };
    assert.equal(inspectSchema({ $ref: `${shop}Product.json` }, { references }).ok, true);
    const payment = inspectSchema(
      { properties: { payment: { $ref: `${shop}PaymentMethod.json` } } },
      { references }
    );
    assert.equal(payment.ok, false);
    assert.deepEqual(
      { ...payment.diagnostics[0], hint: undefined },
      {
        code: 'SCHEMA_PREPARATION_FAILED',
        severity: 'error',
        message: `Unsupported schema keyword discriminator at /discriminator in reference ${shop}PaymentMethod.json`,
        hint: undefined,
        schemaPath: '/discriminator',
        reference: `${shop}PaymentMethod.json`,
      }
    );
    assert.equal(
      inspectSchema({ type: 'string', format: 'unknown' }).diagnostics[0].schemaPath,
      '/format'
    );
    let calls = 0;
    const active = Object.defineProperty({}, 'dialect', {
      enumerable: true,
      get() {
        calls++;
        return 'draft-07';
      },
    });
    assert.equal(inspectSchema({}, active).ok, false);
    assert.equal(
      inspectSchema(
        {},
        {
          provider: {
            generate() {
              calls++;
            },
          },
        }
      ).ok,
      false
    );
    assert.equal(inspectSchema({}, null).ok, false);
    assert.equal(calls, 0);
  });
  it('exports the rule that sets a report status as a callable value', () => {
    const entry = (code, severity) => ({ code, severity, message: '', hint: '' });
    assert.equal(reportStatus([]), true);
    assert.equal(reportStatus([entry('NO_MIMLET_PACKAGES', 'warning')]), true);
    assert.equal(
      reportStatus([
        entry('NO_MIMLET_PACKAGES', 'warning'),
        entry('PACKAGE_NOT_INSTALLED', 'error'),
      ]),
      false
    );
    const reports = [
      inspectSchema({ type: 'string' }),
      inspectSchema({ $ref: 'https://schema.invalid/missing' }),
    ];
    assert.deepEqual(
      reports.map((report) => report.ok),
      [true, false]
    );
    assert.deepEqual(
      reports.map((report) => reportStatus(report.diagnostics)),
      [true, false]
    );
  });
  it('provides machine-readable commands and preserves legacy code generation', () =>
    temporary(async (root) => {
      const schema = join(root, 'schema.json'),
        refs = join(root, 'references.json');
      await json(schema, { $ref: 'https://schema.example.test/sample' });
      await json(refs, { 'https://schema.example.test/sample': { type: 'integer' } });
      const inspected = invoke(
        'inspect',
        '--schema',
        schema,
        '--references',
        refs,
        '--dialect',
        'draft-07',
        '--json'
      );
      assert.equal(inspected.status, 0, inspected.stderr);
      assert.equal(JSON.parse(inspected.stdout).dialect, 'draft-07');
      assert.match(
        invoke('inspect', '--schema', schema, '--references', refs).stdout,
        /No fixtures were generated/
      );
      await json(schema, {
        properties: { customer: { $ref: 'https://schema.example.test/customer' } },
      });
      const missing = invoke('inspect', '--schema', schema, '--references', refs, '--json');
      assert.equal(missing.status, 1);
      assert.deepEqual(
        JSON.parse(missing.stdout).diagnostics.map(({ code, schemaPath, missingReference }) => ({
          code,
          schemaPath,
          missingReference,
        })),
        [
          {
            code: 'SCHEMA_PREPARATION_FAILED',
            schemaPath: '/properties/customer/$ref',
            missingReference: 'https://schema.example.test/customer',
          },
        ]
      );
      assert.match(
        invoke('inspect', '--schema', schema).stdout,
        /Unresolved reference https:\/\/schema\.example\.test\/customer at \/properties\/customer\/\$ref/
      );
      await json(schema, { $dynamicRef: 'SECRET_VALUE' });
      const unsupported = invoke('inspect', '--schema', schema, '--json');
      assert.equal(unsupported.status, 1);
      assert(!unsupported.stdout.includes('SECRET_VALUE'));
      await writeFile(schema, '{"private":"SECRET_VALUE"');
      for (const args of [
        ['inspect', '--schema', schema],
        ['inspect'],
        ['inspect', '--schema', schema, '--dialect', 'wrong'],
        ['doctor', '--project'],
        ['doctor', '--unknown'],
        ['doctor', '--json', '--json'],
        ['generate', '--config', schema, '--out', join(root, 'generated')],
      ]) {
        const bad = invoke(...args, '--json');
        assert.equal(bad.status, 2, bad.stderr);
        assert.equal(JSON.parse(bad.stdout).ok, false);
        assert(!bad.stdout.includes('SECRET_VALUE'));
      }
      assert.match(invoke('--version').stdout, /^\d+\.\d+\.\d+/);
      assert.match(invoke('--help').stdout, /doctor/);
      const config = join(root, 'builders.json'),
        out = join(root, 'generated');
      await json(config, {
        builders: [
          {
            name: 'UserBuilder',
            source: { kind: 'factory', module: '../not-executed.js', export: 'user' },
            fields: ['id'],
          },
        ],
      });
      assert.equal(invoke('--config', config, '--out', out).status, 0);
      const clean = invoke('generate', '--config', config, '--out', out, '--check', '--json');
      assert.equal(clean.status, 0, clean.stderr);
      assert.equal(JSON.parse(clean.stdout).ok, true);
      const before = await readFile(join(out, 'UserBuilder.ts'), 'utf8');
      await json(config, {
        builders: [
          {
            name: 'UserBuilder',
            source: { kind: 'factory', module: '../not-executed.js', export: 'user' },
            fields: ['id', 'name'],
          },
        ],
      });
      const drift = invoke('--config', config, '--out', out, '--check', '--json');
      assert.equal(drift.status, 1);
      assert.equal(JSON.parse(drift.stdout).diagnostics[0].code, 'GENERATED_FILES_OUTDATED');
      assert.equal(await readFile(join(out, 'UserBuilder.ts'), 'utf8'), before);
      // A hand edit is drift for --check, not an invocation error; a write still refuses it.
      await writeFile(join(out, 'UserBuilder.ts'), before + '// edited\n');
      const edited = invoke('--config', config, '--out', out, '--check', '--json');
      assert.equal(edited.status, 1, edited.stdout);
      const report = JSON.parse(edited.stdout);
      assert.equal(report.diagnostics[0].code, 'GENERATED_FILES_OUTDATED');
      assert.deepEqual(report.result.modified, ['UserBuilder.ts']);
      assert.match(report.diagnostics[0].message, /edited by hand: UserBuilder\.ts/);
      assert.equal(invoke('--config', config, '--out', out).status, 2);
      assert.equal(await readFile(join(out, 'UserBuilder.ts'), 'utf8'), before + '// edited\n');
    }));
});
