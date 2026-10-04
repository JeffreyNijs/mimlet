import type { BaseType } from 'arktype';
import { createSchemaBuilder, schemaFields } from '@mimlet/core';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderFor,
  SchemaFields,
  SchemaInput,
  SchemaOutput,
  StandardSchemaV1,
} from '@mimlet/core';
import { jsonSchemaAdapter } from '@mimlet/json-schema';
import type { JsonSchema, JsonSchemaOptions } from '@mimlet/json-schema';

export type ArkTypeOptions = JsonSchemaOptions;
/** Keep only the native operations needed here, so caller-owned scopes remain compatible. */
export type ArkTypeSchema = Pick<BaseType, '~standard' | 'allows' | 'assert'>;

/** Retain the native Type, input checks, morphs and errors without reconstructing a validator. */
export function arkTypeAdapter<S extends ArkTypeSchema>(source: S, options: ArkTypeOptions = {}) {
  const configured = { ...options };
  let generated: ReturnType<typeof jsonSchemaAdapter> | undefined;
  const generation = () => {
    if (!generated) {
      const input = source['~standard'].jsonSchema.input({
        target: configured.dialect ?? 'draft-2020-12',
      });
      // ArkType advertises this input projection; JSON preparation still checks
      // the converted data, references and supported generation constraints.
      generated = jsonSchemaAdapter(input as JsonSchema, configured);
    }
    return generated;
  };
  return Object.freeze({
    source,
    standard: source,
    generation,
    create: (session?: GenerationSession): SchemaInput<S> =>
      generation().create(session) as SchemaInput<S>,
    /** Native allows() checks input without running morphs or output predicates. */
    checkInput: (value: unknown): value is SchemaInput<S> => source.allows(value),
    decode: (value: SchemaInput<S>): SchemaOutput<S> => source.assert(value) as SchemaOutput<S>,
    metadata: Object.freeze({
      vendor: 'arktype',
      // ArkType exposes no runtime version. Generation identity comes from the
      // converted input schema, so a projection change cannot reuse a replay.
      supportedVersions: '>=2.2.5 <=2.2.7',
      generation: 'input-json-schema',
      validation: 'native-standard-schema',
      encoding: false,
    }),
  });
}

/** Automatic generation uses input metadata; validated builds invoke the native Type once. */
export function fromArkType<S extends ArkTypeSchema>(
  source: S,
  options: ArkTypeOptions = {}
): SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, [session?: GenerationSession]> {
  const adapter = arkTypeAdapter(source, options);
  const { session: defaultSession } = adapter.generation();
  // Successful JSON preparation guarantees synchronous, non-thenable generation.
  return createSchemaBuilder(adapter.standard, adapter.create, {
    ...options,
    defaultSession,
  }) as unknown as SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, [session?: GenerationSession]>;
}

/** Factory arguments, native input/output types and known async factories are preserved. */
export function fromArkTypeFactory<
  S extends ArkTypeSchema,
  F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(source: S, factory: F, options: ArkTypeOptions = {}): SchemaBuilderFor<S, F> {
  return createSchemaBuilder(arkTypeAdapter(source, options).standard, factory, options);
}

/**
 * The object type's top-level input property names, for a setter per field:
 * `fluent(fromArkType(schema), arkTypeFields(schema))`. Reads the native `schema.in.props`,
 * so a morph such as `.pipe()` lists the keys of the input it receives. Symbol keys are skipped.
 */
export function arkTypeFields<S extends ArkTypeSchema & StandardSchemaV1<object, unknown>>(
  schema: S
): SchemaFields<Extract<keyof SchemaInput<S>, string>> {
  let props: unknown;
  try {
    props = (schema as unknown as { readonly in: { readonly props: unknown } }).in.props;
  } catch (cause) {
    // ArkType refuses to list props of unions and non-object types.
    throw new TypeError('Expected an ArkType object type', { cause });
  }
  if (!Array.isArray(props)) {
    throw new TypeError('Expected an ArkType object type');
  }
  const keys = props
    .map((prop: { readonly key?: unknown }) => prop?.key)
    .filter((key): key is string => typeof key === 'string');
  return schemaFields(keys as Extract<keyof SchemaInput<S>, string>[]);
}
