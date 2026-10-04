import * as z from 'zod/v4/core';
import { createSchemaBuilder, schemaFields } from '@mimlet/core';
import type {
  AsyncSchemaBuilder,
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderFor,
  SchemaFields,
  StandardSchemaV1,
} from '@mimlet/core';
import { jsonSchemaAdapter } from '@mimlet/json-schema';
import type { JsonSchema, JsonSchemaOptions } from '@mimlet/json-schema';

export interface ZodOptions extends JsonSchemaOptions {
  /** Native error customization, input reporting and JIT policy. */
  readonly parseOptions?: z.ParseContext<z.$ZodIssue>;
}

/** Native parsing and codecs; JSON conversion is needed only for automatic generation. */
export function zodAdapter<S extends z.$ZodType>(source: S, options: ZodOptions = {}) {
  type Input = z.input<S>;
  type Output = z.output<S>;
  const configured = { ...options };
  const parseOptions = Object.freeze({ ...options.parseOptions });
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'mimlet/zod',
      validate(value) {
        // Zod's Standard entry retries thrown sync parses asynchronously. Select
        // the native mode explicitly so user callbacks are never probed twice.
        const result = z.safeParse(source, value, parseOptions);
        return result.success ? { value: result.data } : { issues: result.error.issues };
      },
    },
  };
  const standardAsync: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'mimlet/zod',
      async validate(value) {
        const result = await z.safeParseAsync(source, value, parseOptions);
        return result.success ? { value: result.data } : { issues: result.error.issues };
      },
    },
  };
  let generated: ReturnType<typeof jsonSchemaAdapter> | undefined;
  const generation = () => {
    if (!generated) {
      const dialect = configured.dialect ?? 'draft-2020-12';
      if (dialect !== 'draft-07' && dialect !== 'draft-2020-12') {
        throw new TypeError('Zod input conversion supports draft-07 and draft-2020-12');
      }
      // Bind the native input projection, never the transformed output type.
      const input = z.toJSONSchema(source, {
        io: 'input',
        target: dialect,
        unrepresentable: 'throw',
      });
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const standardMetadata = descriptors['~standard'];
      // Zod attaches this known protocol as non-enumerable root data. Preserve
      // every other descriptor so JSON preparation still rejects active/hidden data.
      if (standardMetadata && !standardMetadata.enumerable && 'value' in standardMetadata) {
        Reflect.deleteProperty(descriptors, '~standard');
      }
      const data = Object.create(Object.getPrototypeOf(input), descriptors) as JsonSchema;
      generated = jsonSchemaAdapter(data, configured);
    }
    return generated;
  };
  return Object.freeze({
    source,
    standard,
    standardAsync,
    generation,
    create: (session?: GenerationSession): Input => generation().create(session) as Input,
    decode: (value: Input): Output => z.decode(source, value, parseOptions),
    decodeAsync: (value: Input): Promise<Output> => z.decodeAsync(source, value, parseOptions),
    // These retain Zod's own failure for one-way transforms; no inverse is synthesized.
    encode: (value: Output): Input => z.encode(source, value, parseOptions),
    encodeAsync: (value: Output): Promise<Input> => z.encodeAsync(source, value, parseOptions),
    metadata: Object.freeze({
      vendor: 'zod',
      // Zod types its version as the compile-time release; report any loaded release.
      version: `${z.version.major}.${z.version.minor}.${z.version.patch}` as string,
      generation: 'input-json-schema',
      validation: 'explicit-native-sync-or-async',
      encoding: 'native-supported-schemas-only',
    }),
  });
}

/**
 * The builder `fromZod(schema, options)` returns: synchronous, with the schema's input and
 * output types and an optional session. Name it as a generic helper's return type.
 */
export type ZodBuilder<S extends z.$ZodType> = SchemaBuilder<
  z.input<S>,
  z.output<S>,
  [session?: GenerationSession]
>;

/**
 * The builder `fromZodFactory(schema, factory, options)` returns for a factory of type `F`:
 * the factory's arguments, and synchronous build methods unless `F` returns a promise. Pass
 * the factory's own type as `F`. As with the function, sync or async is decided once `S` is known.
 */
export type ZodFactoryBuilder<
  S extends z.$ZodType,
  F extends (...args: never[]) => z.input<S> | PromiseLike<z.input<S>>,
> = SchemaBuilderFor<StandardSchemaV1<z.input<S>, z.output<S>>, F>;

/** Generate input metadata and validate synchronously through the original Zod schema. */
export function fromZod<S extends z.$ZodType>(source: S, options: ZodOptions = {}): ZodBuilder<S> {
  const adapter = zodAdapter(source, options);
  const { session: defaultSession } = adapter.generation();
  // Successful JSON preparation guarantees synchronous, non-thenable generation.
  return createSchemaBuilder(adapter.standard, adapter.create, {
    ...options,
    defaultSession,
  }) as unknown as ZodBuilder<S>;
}

/** Async refinements and codecs run once through safeParseAsync, without a sync probe. */
export function fromZodAsync<S extends z.$ZodType>(
  source: S,
  options: ZodOptions = {}
): AsyncSchemaBuilder<z.input<S>, z.output<S>, [session?: GenerationSession]> {
  const adapter = zodAdapter(source, options);
  const { session: defaultSession } = adapter.generation();
  return createSchemaBuilder(
    adapter.standardAsync,
    async (session?: GenerationSession) => adapter.create(session),
    { ...options, defaultSession }
  );
}

/** Native values and opaque constraints do not need a JSON representation when using a factory. */
export function fromZodFactory<
  S extends z.$ZodType,
  F extends (...args: never[]) => NoInfer<z.input<S>> | PromiseLike<NoInfer<z.input<S>>>,
>(source: S, factory: F, options: ZodOptions = {}): ZodFactoryBuilder<S, F> {
  return createSchemaBuilder(zodAdapter(source, options).standard, factory, options);
}

/** Explicit native async validation with either a synchronous or asynchronous factory. */
export function fromZodFactoryAsync<
  S extends z.$ZodType,
  F extends (...args: never[]) => NoInfer<z.input<S>> | PromiseLike<NoInfer<z.input<S>>>,
>(
  source: S,
  factory: F,
  options: ZodOptions = {}
): AsyncSchemaBuilder<z.input<S>, z.output<S>, Parameters<F>> {
  // Forward the original factory tuple, while deliberately forcing async mode.
  return createSchemaBuilder(
    zodAdapter(source, options).standardAsync,
    async (...args: never[]) => factory(...args),
    options
  ) as unknown as AsyncSchemaBuilder<z.input<S>, z.output<S>, Parameters<F>>;
}

/**
 * The object schema's top-level input property names, for a setter per field:
 * `fluent(fromZod(schema), zodFields(schema))`. Pipes such as `.transform()` are followed to
 * the object that receives the input. Reads only the keys of the schema's shape.
 */
export function zodFields<S extends z.$ZodType<unknown, object>>(
  schema: S
): SchemaFields<Extract<keyof z.input<S>, string>> {
  let definition: unknown = schema?._zod?.def;
  for (let depth = 0; depth < 64 && (definition as z.$ZodPipeDef)?.type === 'pipe'; depth++) {
    definition = (definition as z.$ZodPipeDef).in?._zod?.def;
  }
  const shape: unknown =
    (definition as z.$ZodObjectDef | undefined)?.type === 'object'
      ? (definition as z.$ZodObjectDef).shape
      : undefined;
  if (!shape || typeof shape !== 'object') {
    throw new TypeError('Expected a Zod object schema or a pipe from one');
  }
  return schemaFields(Object.keys(shape) as Extract<keyof z.input<S>, string>[]);
}
