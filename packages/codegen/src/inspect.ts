import { jsonSchemaAdapter, SchemaPreparationError } from '@mimlet/json-schema';
import type { JsonSchema, SchemaDialect, JsonSchemaOptions } from '@mimlet/json-schema';
import type { DiagnosticReport } from './diagnostics.js';

export interface InspectionReport extends DiagnosticReport {
  readonly command: 'inspect';
  readonly sampled: false;
  readonly capabilities: {
    readonly preparation: boolean;
    readonly generation: 'bounded-json-sampling' | 'unavailable';
    readonly validation: 'json-schema' | 'unavailable';
    readonly network: false;
  };
  readonly identity?: ReturnType<typeof jsonSchemaAdapter>['identity'];
  readonly dialect?: SchemaDialect;
}
/** Describe prepared JSON capabilities without producing fixtures or executing native schemas. */
export function inspectSchema(
  schema: JsonSchema,
  options: Pick<JsonSchemaOptions, 'dialect' | 'references'> = {}
): InspectionReport {
  try {
    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
      Reflect.ownKeys(options).some((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(options, key);
        return (
          !['dialect', 'references'].includes(String(key)) ||
          !descriptor ||
          !('value' in descriptor) ||
          !descriptor.enumerable
        );
      })
    ) {
      throw new TypeError('Unsupported inspection options');
    }
    if (
      options.references !== undefined &&
      (!options.references ||
        typeof options.references !== 'object' ||
        Array.isArray(options.references))
    ) {
      throw new TypeError('References must be an in-memory schema map');
    }
    const adapter = jsonSchemaAdapter(schema, options);
    return {
      format: 'mimlet/diagnostics',
      version: 1,
      command: 'inspect',
      sampled: false,
      ok: true,
      diagnostics: [],
      capabilities: {
        preparation: true,
        generation: 'bounded-json-sampling',
        validation: 'json-schema',
        network: false,
      },
      identity: adapter.identity,
      dialect: adapter.metadata.dialect,
    };
  } catch (error) {
    return {
      format: 'mimlet/diagnostics',
      version: 1,
      command: 'inspect',
      sampled: false,
      ok: false,
      capabilities: {
        preparation: false,
        generation: 'unavailable',
        validation: 'unavailable',
        network: false,
      },
      diagnostics: [
        {
          code: 'SCHEMA_PREPARATION_FAILED',
          severity: 'error',
          message:
            error instanceof SchemaPreparationError
              ? error.message
              : 'The schema or options cannot be prepared with the selected JSON Schema capabilities.',
          hint:
            error instanceof SchemaPreparationError && error.missingReference !== undefined
              ? 'Add the referenced schema to the references map under this exact URI; references are never fetched.'
              : 'Check the dialect, supplied references and supported constraints; use an explicit factory for native values or opaque refinements.',
          ...(error instanceof SchemaPreparationError ? { schemaPath: error.schemaPath } : {}),
          ...(error instanceof SchemaPreparationError && error.reference !== undefined
            ? { reference: error.reference }
            : {}),
          ...(error instanceof SchemaPreparationError && error.missingReference !== undefined
            ? { missingReference: error.missingReference }
            : {}),
        },
      ],
    };
  }
}
