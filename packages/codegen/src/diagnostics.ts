export interface Diagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly hint: string;
  readonly package?: string;
  readonly dependency?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly schemaPath?: string;
  /** `inspect`: the supplied reference that `schemaPath` points into. */
  readonly reference?: string;
  /** `inspect`: a `$ref` target that was not supplied; `schemaPath` points at the `$ref`. */
  readonly missingReference?: string;
}

export interface DiagnosticReport {
  readonly format: 'mimlet/diagnostics';
  readonly version: 1;
  readonly command: 'doctor' | 'inspect' | 'generate';
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function reportStatus(diagnostics: readonly Diagnostic[]): boolean {
  return !diagnostics.some((entry) => entry.severity === 'error');
}
