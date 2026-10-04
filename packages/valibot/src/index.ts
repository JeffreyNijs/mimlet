import type { GenericSchema, InferInput, InferOutput, ObjectEntries } from 'valibot';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import type {
  ConversionConfig,
  JsonSchema as ConvertedSchema,
  OverrideActionContext,
} from '@valibot/to-json-schema';
import { fromStandardJsonSchema, jsonSchemaAdapter } from '@mimlet/json-schema';
import type { JsonSchema, JsonSchemaOptions } from '@mimlet/json-schema';
import { schemaFields } from '@mimlet/core';
import type { SchemaFields, StandardSchemaV1, StandardJSONSchemaV1 } from '@mimlet/core';

export type ValibotOptions = JsonSchemaOptions;

/**
 * Actions whose pinned conversion is broader than Valibot's own check. The converter turns
 * isoDateTime and isoTime into RFC 3339 `date-time` and `time` (seconds and a zone, which
 * Valibot rejects), cannot convert isoDateTimeSecond, and records base64 only as the
 * `contentEncoding` annotation. `true` marks the actions whose converted format is replaced.
 */
const exactActions: Readonly<Record<string, boolean>> = {
  iso_date_time: true,
  iso_time: true,
  iso_date_time_second: false,
  base64: false,
};

/** Valibot's own regular expression is the exact rule, so these convert like isoTimeSecond. */
function exactAction(
  { valibotAction: action, jsonSchema }: OverrideActionContext,
  errorMode: ConversionConfig['errorMode']
): ConvertedSchema | undefined {
  if (!Object.hasOwn(exactActions, action.type)) {
    return undefined;
  }
  if (jsonSchema.pattern !== undefined) {
    // The converter's rule for its other regex actions: one pattern per string schema.
    const message = `The "${action.type}" action is not supported in combination with another regex action.`;
    if (errorMode === 'warn') {
      console.warn(message);
    } else if (errorMode !== 'ignore') {
      throw new Error(message);
    }
    return undefined;
  }
  const { requirement } = action as unknown as { readonly requirement: RegExp };
  const { format: _broader, ...rest } = jsonSchema;
  return {
    ...(exactActions[action.type] ? rest : jsonSchema),
    // Only base64 is case-insensitive, and its letters appear solely in `a-z` ranges.
    pattern: requirement.flags.includes('i')
      ? requirement.source.replaceAll('a-z', 'a-zA-Z')
      : requirement.source,
  };
}

/** Native conversion adds metadata without replacing Valibot's parser or its input/output types. */
export function valibotAdapter<S extends GenericSchema>(source: S, options: ValibotOptions = {}) {
  const converted = toStandardJsonSchema(source)['~standard'];
  type Converter = StandardJSONSchemaV1.Converter['input'];
  const exact =
    (convert: Converter): Converter =>
    (conversion) => {
      const library = (conversion.libraryOptions ?? {}) as ConversionConfig;
      const override = library.overrideAction;
      return convert({
        ...conversion,
        libraryOptions: {
          ...library,
          overrideAction: (context: OverrideActionContext) => {
            const replaced = exactAction(context, library.errorMode);
            return (
              override?.(replaced ? { ...context, jsonSchema: replaced } : context) ?? replaced
            );
          },
        },
      });
    };
  const standard: StandardSchemaV1<InferInput<S>, InferOutput<S>> &
    StandardJSONSchemaV1<InferInput<S>, InferOutput<S>> = {
    '~standard': {
      ...converted,
      jsonSchema: {
        input: exact((conversion) => converted.jsonSchema.input(conversion)),
        output: exact((conversion) => converted.jsonSchema.output(conversion)),
      },
      validate: (value) => source['~standard'].validate(value),
    },
  };
  let generated: ReturnType<typeof jsonSchemaAdapter> | undefined;
  // The same converted input that fromValibot generates from, so sessions and replay match.
  const generation = () =>
    (generated ??= jsonSchemaAdapter(
      standard['~standard'].jsonSchema.input({
        target: options.dialect ?? 'draft-2020-12',
      }) as JsonSchema,
      options
    ));
  return Object.freeze({
    source,
    standard,
    generation,
    metadata: Object.freeze({ vendor: 'valibot', version: '1.5.0', conversion: 'input' }),
  });
}
/** Automatic input generation; unsupported conversions throw instead of dropping constraints. */
export function fromValibot<S extends GenericSchema>(source: S, options: ValibotOptions = {}) {
  return fromStandardJsonSchema(valibotAdapter(source, options).standard, options);
}
const objectTypes = new Set(['object', 'loose_object', 'strict_object', 'object_with_rest']);
/**
 * The object schema's top-level entry names, for a setter per field:
 * `fluent(fromValibot(schema), valibotFields(schema))`. A `v.pipe()` that starts with an object
 * keeps its entries. Reads only the keys of `schema.entries`.
 */
export function valibotFields<S extends GenericSchema & { readonly entries: ObjectEntries }>(
  schema: S
): SchemaFields<Extract<keyof S['entries'], string>> {
  const entries: unknown = objectTypes.has(schema?.type) ? schema.entries : undefined;
  if (!entries || typeof entries !== 'object') {
    throw new TypeError('Expected a Valibot object schema');
  }
  return schemaFields(Object.keys(entries) as Extract<keyof S['entries'], string>[]);
}
