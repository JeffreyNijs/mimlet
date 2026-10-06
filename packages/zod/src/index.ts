import * as z from 'zod/v4/core';
import { BuilderValidationError, createSchemaBuilder, schemaFields } from '@mimlet/core';
import type {
  AsyncSchemaBuilder,
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderFor,
  SchemaFields,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import { jsonSchemaAdapter, SchemaPreparationError } from '@mimlet/json-schema';
import type { JsonSchema, JsonSchemaOptions } from '@mimlet/json-schema';

export interface ZodOptions extends JsonSchemaOptions {
  /** Native error customization, input reporting and JIT policy. */
  readonly parseOptions?: z.ParseContext<z.$ZodIssue>;
}

type Generation = ReturnType<typeof jsonSchemaAdapter>;
type InputDialect = 'draft-07' | 'draft-2020-12';
type Definition = { readonly type?: unknown; readonly values?: ReadonlyArray<unknown> };

const zodDefinition = (schema: unknown): Definition | undefined =>
  (schema as { readonly _zod?: { readonly def?: Definition } } | null | undefined)?._zod?.def;

function inputDialect(options: ZodOptions): InputDialect {
  const dialect = options.dialect ?? 'draft-2020-12';
  if (dialect !== 'draft-07' && dialect !== 'draft-2020-12') {
    throw new TypeError('Zod input conversion supports draft-07 and draft-2020-12');
  }
  return dialect;
}

/** `z.void()`, `z.undefined()` and `z.literal(undefined)` accept only `undefined`, which JSON lacks. */
function acceptsOnlyUndefined(schema: unknown): boolean {
  const def = zodDefinition(schema);
  return (
    def?.type === 'void' ||
    def?.type === 'undefined' ||
    (def?.type === 'literal' && !!def.values?.length && def.values.every((v) => v === undefined))
  );
}

/** Zod types whose input JSON Schema conversion throws. */
const withoutJsonForm = new Set([
  'bigint',
  'custom',
  'date',
  'function',
  'map',
  'nan',
  'set',
  'symbol',
  'transform',
  'undefined',
  'void',
]);
function hasNoJsonForm(schema: unknown): boolean {
  const def = zodDefinition(schema);
  return (
    withoutJsonForm.has(def?.type as string) ||
    (def?.type === 'literal' &&
      !!def.values?.some((value) => value === undefined || typeof value === 'bigint'))
  );
}

/**
 * JSON Pointer to the input that Zod could not convert. Zod's own traversal finds it: in
 * `any` mode it converts that input to `{}` and reports schemas in reverse visiting order, so
 * the last match is the first input the throwing conversion stopped at.
 */
function unconvertedInput(source: z.$ZodType, target: InputDialect): string {
  let found: ReadonlyArray<PropertyKey> = [];
  try {
    z.toJSONSchema(source, {
      io: 'input',
      target,
      unrepresentable: 'any',
      override({ zodSchema, path }) {
        if (hasNoJsonForm(zodSchema)) {
          found = path ?? [];
        }
      },
    });
  } catch {
    // The location only adds detail; the conversion error itself is reported either way.
  }
  return found.map((key) => `/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

/** The schema's input projection as plain JSON Schema data. */
function inputJsonSchema(source: z.$ZodType, target: InputDialect): JsonSchema {
  let input: object;
  try {
    // Bind the native input projection, never the transformed output type.
    input = z.toJSONSchema(source, { io: 'input', target, unrepresentable: 'throw' });
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.message
        ? cause.message.replace(/\.$/, '')
        : 'Zod could not convert the schema to JSON Schema';
    throw new SchemaPreparationError(
      `${reason}; use fromZodFactory(schema, factory) to supply this input`,
      unconvertedInput(source, target),
      { cause }
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const standardMetadata = descriptors['~standard'];
  // Zod attaches this known protocol as non-enumerable root data. Preserve
  // every other descriptor so JSON preparation still rejects active/hidden data.
  if (standardMetadata && !standardMetadata.enumerable && 'value' in standardMetadata) {
    Reflect.deleteProperty(descriptors, '~standard');
  }
  return Object.create(Object.getPrototypeOf(input), descriptors) as JsonSchema;
}

/** Options that configure the builder or native parsing; the generator never reads them. */
const builderOptions = new Set([
  'cloneInput',
  'defaultSession',
  'maxListSize',
  'parseOptions',
  'validationOptions',
]);

/** Equal plain generation options share a generator; callbacks and schema maps are not compared. */
function generatorKey(options: ZodOptions): string | undefined {
  const entries: [string, unknown][] = [];
  for (const name of Object.keys(options).sort()) {
    const value: unknown = (options as Record<string, unknown>)[name];
    if (value === undefined || builderOptions.has(name)) {
      continue;
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      !(Array.isArray(value) && value.every((item) => typeof item === 'string'))
    ) {
      return undefined;
    }
    entries.push([name, value]);
  }
  return JSON.stringify(entries);
}

/**
 * Prepared generators by schema object and generation options. Preparing one compiles a JSON
 * Schema validator, the main cost of an automatic builder, so every adapter and builder for
 * the same schema object shares it. Hey API, for example, exports each component schema
 * again under per-operation names.
 */
const generators = new WeakMap<object, Map<string, Generation>>();
function sharedGenerator(source: object, options: ZodOptions, prepare: () => Generation) {
  const key = generatorKey(options);
  if (key === undefined || source === null || typeof source !== 'object') {
    return prepare();
  }
  let prepared = generators.get(source);
  const existing = prepared?.get(key);
  if (existing) {
    return existing;
  }
  const generation = prepare();
  if (!prepared) {
    prepared = new Map();
    generators.set(source, prepared);
  }
  prepared.set(key, generation);
  return generation;
}

/**
 * Zod lets an error thrown inside a transform, refinement or other callback escape the parse.
 * Report it as a rejected value: a thrown ZodError keeps its issues and their paths, any other
 * error becomes one issue at the root, and the original error is the `cause`. Zod's async and
 * encode errors report a wrong entry point, not a rejected value, so they pass through.
 */
function callbackFailure(error: unknown): unknown {
  if (error instanceof z.$ZodAsyncError || error instanceof z.$ZodEncodeError) {
    return error;
  }
  const issues: ReadonlyArray<ValidationIssue> =
    error instanceof z.$ZodError && error.issues.length > 0
      ? error.issues
      : [
          {
            message: `A Zod transform or refinement threw ${
              error instanceof Error ? `${error.name}: ${error.message}` : `a ${typeof error}`
            }`,
            path: [],
          },
        ];
  const failure = new BuilderValidationError(issues);
  // The same own, non-enumerable property that the standard `cause` option defines.
  Object.defineProperty(failure, 'cause', { value: error, writable: true, configurable: true });
  return failure;
}

/** Native parsing and codecs; JSON conversion is needed only for automatic generation. */
export function zodAdapter<S extends z.$ZodType>(source: S, options: ZodOptions = {}) {
  type Input = z.input<S>;
  type Output = z.output<S>;
  const configured = { ...options };
  const parseOptions = Object.freeze({ ...options.parseOptions });
  // Zod 4.3 and older assign `async` and `direction` to the context they receive, so every
  // call gets its own copy and the configured options stay unchanged.
  const context = () => ({ ...parseOptions });
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'mimlet/zod',
      validate(value) {
        let result;
        try {
          // Zod's Standard entry retries thrown sync parses asynchronously. Select
          // the native mode explicitly so user callbacks are never probed twice.
          result = z.safeParse(source, value, context());
        } catch (error) {
          throw callbackFailure(error);
        }
        return result.success ? { value: result.data } : { issues: result.error.issues };
      },
    },
  };
  const standardAsync: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'mimlet/zod',
      async validate(value) {
        let result;
        try {
          result = await z.safeParseAsync(source, value, context());
        } catch (error) {
          throw callbackFailure(error);
        }
        return result.success ? { value: result.data } : { issues: result.error.issues };
      },
    },
  };
  const onlyUndefined = acceptsOnlyUndefined(source);
  let generated: Generation | undefined;
  // Conversion and validator compilation run on first use and are shared; see sharedGenerator.
  const generation = (): Generation => {
    if (!generated) {
      const target = inputDialect(configured);
      if (onlyUndefined) {
        throw new SchemaPreparationError(
          'A schema that accepts only undefined is built without a JSON Schema generator',
          ''
        );
      }
      generated = sharedGenerator(source, configured, () =>
        jsonSchemaAdapter(inputJsonSchema(source, target), configured)
      );
    }
    return generated;
  };
  return Object.freeze({
    source,
    standard,
    standardAsync,
    generation,
    create: (session?: GenerationSession): Input =>
      (onlyUndefined ? undefined : generation().create(session)) as Input,
    decode: (value: Input): Output => z.decode(source, value, context()),
    decodeAsync: (value: Input): Promise<Output> => z.decodeAsync(source, value, context()),
    // These retain Zod's own failure for one-way transforms; no inverse is synthesized.
    encode: (value: Output): Input => z.encode(source, value, context()),
    encodeAsync: (value: Output): Promise<Input> => z.encodeAsync(source, value, context()),
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
 * The default session comes from the prepared generator, so it is created on the first build
 * without a session instead of with the builder. A schema that accepts only `undefined` needs
 * neither. The dialect is still checked here, as a configuration error.
 */
function lazyDefaultSession(
  source: z.$ZodType,
  generation: () => Generation,
  options: ZodOptions
): { readonly defaultSession?: () => GenerationSession } {
  inputDialect(options);
  return acceptsOnlyUndefined(source) ? {} : { defaultSession: () => generation().session() };
}

/**
 * The builder `fromZod(schema, options)` returns: synchronous, with the schema's input and
 * output types and an optional session. Name it as a generic helper's return type.
 *
 * `build()` returns the schema's input (`z.input<S>`): the generated value before Zod runs
 * anything, so for a `.transform()` or `.pipe()` it is the API or wire shape. Only
 * `buildValidated()` parses it and returns the output (`z.output<S>`) with transforms,
 * defaults and codecs applied.
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

/**
 * Generate input from the schema's input JSON Schema and validate synchronously through the
 * original Zod schema. `build()` returns that input (`z.input<S>`); `buildValidated()` parses
 * it and returns the output (`z.output<S>`), so only the validated methods run transforms.
 *
 * Creating the builder does not convert the schema. The first build converts it and compiles
 * the generator, which every builder of the same schema object and generation options then
 * shares, so a conversion error surfaces on that build. `z.void()` and `z.undefined()` build
 * `undefined`.
 */
export function fromZod<S extends z.$ZodType>(source: S, options: ZodOptions = {}): ZodBuilder<S> {
  const adapter = zodAdapter(source, options);
  // Successful JSON preparation guarantees synchronous, non-thenable generation.
  return createSchemaBuilder(adapter.standard, adapter.create, {
    ...options,
    ...lazyDefaultSession(source, adapter.generation, options),
  }) as unknown as ZodBuilder<S>;
}

/**
 * Async refinements and codecs run once through safeParseAsync, without a sync probe. As with
 * `fromZod()`, the schema is converted on the first build.
 */
export function fromZodAsync<S extends z.$ZodType>(
  source: S,
  options: ZodOptions = {}
): AsyncSchemaBuilder<z.input<S>, z.output<S>, [session?: GenerationSession]> {
  const adapter = zodAdapter(source, options);
  return createSchemaBuilder(
    adapter.standardAsync,
    async (session?: GenerationSession) => adapter.create(session),
    { ...options, ...lazyDefaultSession(source, adapter.generation, options) }
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
