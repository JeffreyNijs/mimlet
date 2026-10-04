import {
  emitBuilders,
  emitJsonSchemaBuilders,
  writeGenerated,
  selfContainedRuntime,
} from '@mimlet/codegen';
const modules = emitBuilders([
  {
    name: 'Users',
    source: { kind: 'factory', module: './models.js', export: 'users' },
    fields: ['id'],
  },
]);
const schemas = await emitJsonSchemaBuilders([
  {
    name: 'Users',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
]);
await writeGenerated('./generated', [...modules, ...schemas], { check: true });
await selfContainedRuntime();
// @ts-expect-error Unknown source kinds are not implicit executable plugins.
emitBuilders([{ name: 'Bad', source: { kind: 'eval', module: './x.js', export: 'X' } }]);
emitJsonSchemaBuilders([
  // @ts-expect-error A raw-schema target cannot serialize executable callbacks.
  { name: 'Bad', schema: true, options: { provider: { id: 'x', generate: () => 1 } } },
]);

// Diagnostics remain typed without importing app code or accepting native callbacks.
import { diagnoseProject, inspectSchema, reportStatus } from '@mimlet/codegen';
import type { Diagnostic, DiagnosticReport } from '@mimlet/codegen';
const inspection = inspectSchema({ type: 'string' });
const sampled: false = inspection.sampled;
const network: false = inspection.capabilities.network;
const report: DiagnosticReport = inspection;
const doctor = await diagnoseProject('.');
const command: 'doctor' = doctor.command;
void [sampled, network, report, command];
// @ts-expect-error Native providers are outside inspection's data-only options.
inspectSchema({}, { provider: () => 'value' });
// @ts-expect-error References are an explicit schema map, not a list.
inspectSchema({}, { references: [] });
// @ts-expect-error Diagnostic reports are immutable.
inspection.ok = false;
// The status rule is a runtime value, not only a type.
const entries: readonly Diagnostic[] = inspection.diagnostics;
const status: boolean = reportStatus(entries);
void status;
// @ts-expect-error The rule takes the diagnostics list, not a whole report.
reportStatus(inspection);
