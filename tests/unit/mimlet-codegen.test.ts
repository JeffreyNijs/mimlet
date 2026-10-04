import { expect, it } from 'vitest';
import { emitBuilders, inspectSchema, reportStatus } from '../../packages/codegen/src/index.js';
it('generates deterministic collision-safe fluent helpers', () => {
  const targets = [
    {
      name: 'UserBuilder',
      source: { kind: 'factory' as const, module: './users.js', export: 'makeUser' },
      fields: ['first-name', 'first_name'],
    },
  ];
  const first = emitBuilders(targets);
  expect(first).toEqual(emitBuilders(targets));
  expect(first[0]?.content).toContain('withFirstName(');
  expect(first[0]?.content).toContain('withFirstName2(');
  expect(() =>
    emitBuilders([
      { name: '../escape', source: { kind: 'factory', module: './users.js', export: 'makeUser' } },
    ])
  ).toThrow();
});

it('inspection reports preparation, not satisfiability or sampled fixtures', () => {
  expect(inspectSchema(false)).toMatchObject({
    format: 'mimlet/diagnostics',
    version: 1,
    ok: true,
    sampled: false,
    capabilities: { preparation: true, network: false },
  });
  const unsupported = inspectSchema({ $ref: 'https://example.invalid/not-supplied' });
  expect(unsupported.ok).toBe(false);
  expect(unsupported.diagnostics[0]?.code).toBe('SCHEMA_PREPARATION_FAILED');
});

it('exports reportStatus as the value that sets a report status', () => {
  expect(reportStatus([])).toBe(true);
  expect(
    reportStatus([{ code: 'NO_MIMLET_PACKAGES', severity: 'warning', message: '', hint: '' }])
  ).toBe(true);
  const failed = inspectSchema({ $ref: 'https://example.invalid/not-supplied' });
  expect(reportStatus(failed.diagnostics)).toBe(false);
  expect(reportStatus(failed.diagnostics)).toBe(failed.ok);
});
