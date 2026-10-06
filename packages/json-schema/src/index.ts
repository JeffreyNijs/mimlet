import { Ajv, MissingRefError, type ErrorObject } from 'ajv';
import { Ajv2019 } from 'ajv/dist/2019.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formatsModule from 'ajv-formats';
import { generateSync, type JsonSchema as ProviderSchema } from 'json-schema-faker';
import { createSchemaBuilder, createSession, schemaFields, SessionBudgetError } from '@mimlet/core';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaFields,
  SchemaInput,
  SchemaOutput,
  SessionKey,
  StandardJSONSchemaV1,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import {
  clipUri,
  copyJson,
  draft7ValidationSchema,
  dialect,
  fingerprint,
  inReference,
  limits,
  locateReference,
  prepare,
  resolveUri,
  SchemaGenerationError,
  SchemaPreparationError,
  unpointer,
  type JsonSchema,
  type SchemaDialect,
  type SchemaLimits,
} from './schema.js';
export { SchemaGenerationError, SchemaPreparationError } from './schema.js';
export type {
  JsonSchema,
  SchemaDialect,
  SchemaLimits,
  SchemaPreparationErrorOptions,
} from './schema.js';
export interface SampleRandom {
  next(): number;
  int(minimum: number, maximum: number): number;
  bool(probability?: number): boolean;
  pick<T>(values: readonly T[]): T;
}
export type GenerationProfile = 'minimal' | 'defaults' | 'examples' | 'random' | 'boundary';
export interface JsonGenerationProvider {
  /** Versioned semantic identity. Change this when generation behavior changes. */
  readonly id: string;
  readonly generate: (request: {
    readonly schema: JsonSchema;
    readonly references: Readonly<Record<string, JsonSchema>>;
    readonly profile: GenerationProfile;
    readonly dialect: SchemaDialect;
    readonly session: GenerationSession;
    readonly attempt: number;
  }) => unknown;
}
export interface JsonSchemaOptions extends SchemaLimits, SchemaBuilderConfig {
  /** Pure synchronous candidate generation. The original validator remains authoritative. */
  readonly provider?: JsonGenerationProvider;
  /** Custom assertions require a versioned extensionIdentity; they are never silently ignored. */
  readonly keywords?: Readonly<Record<string, (constraint: unknown, value: unknown) => boolean>>;
  readonly annotations?: ReadonlyArray<string>;
  readonly extensionIdentity?: string;
  readonly dialect?: SchemaDialect;
  readonly profile?: GenerationProfile;
  /** Exact URI -> in-memory schema. No network or filesystem resolver is installed. */
  readonly references?: Readonly<Record<string, JsonSchema>>;
  /** Trusted synchronous callbacks. Validation and generation must agree on each format. */
  readonly formats?: Readonly<
    Record<
      string,
      {
        readonly validate: (value: string) => boolean;
        readonly generate: (random: SampleRandom) => string;
      }
    >
  >;
  /** Required when custom callbacks participate in replay identity. */
  readonly formatsIdentity?: string;
}
export interface JsonSchemaIssue extends ValidationIssue {
  readonly keyword: string;
  readonly schemaPath: string;
  readonly instancePath: string;
}
export { NegativeCaseError } from './cases.js';
export type { NegativeTarget } from './cases.js';
import { boundaryHints, checkedNegative, synchronous } from './cases.js';

const YEAR_SECONDS = 365 * 24 * 60 * 60;
/**
 * UTC date-times within a year of the session reference instant. The provider's own
 * min/max path formats the calendar day in the machine's local time zone with a fixed
 * time of day, so the same seed differed across time zones and every value was equal.
 */
function referenceDateTime(reference: Date): (random: SampleRandom) => string {
  const origin = Math.floor(reference.getTime() / 1000) * 1000;
  return (random) =>
    new Date(origin + random.int(-YEAR_SECONDS, YEAR_SECONDS) * 1000)
      .toISOString()
      .replace('.000Z', 'Z');
}
import type { NegativeTarget } from './cases.js';
function issues(errors: ErrorObject[] | null | undefined): JsonSchemaIssue[] {
  return (errors ?? []).map((error) => ({
    message: error.message ?? 'JSON Schema validation failed',
    path: [
      ...unpointer(error.instancePath),
      ...(error.keyword === 'required'
        ? [String(error.params.missingProperty)]
        : error.keyword === 'additionalProperties'
          ? [String(error.params.additionalProperty)]
          : []),
    ],
    keyword: error.keyword,
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
  }));
}
/** Prepare once, generate many. Schemas are data snapshots; callbacks remain trusted code. */
export function jsonSchemaAdapter(schema: JsonSchema, options: JsonSchemaOptions = {}) {
  const maximum = limits(options);
  const source = copyJson(schema, maximum) as JsonSchema;
  const selected = dialect(source, options.dialect);
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'defaults', 'examples', 'random', 'boundary'].includes(profile)) {
    throw new TypeError('Unknown generation profile');
  }
  const references = copyJson(options.references ?? {}, maximum) as Record<string, JsonSchema>;
  const customFormats = { ...options.formats };
  if (
    Object.keys(customFormats).length > 0 &&
    (typeof options.formatsIdentity !== 'string' || !options.formatsIdentity)
  ) {
    throw new TypeError('Custom formats require an explicit formatsIdentity for reproducibility');
  }
  const provider = options.provider ? Object.freeze({ ...options.provider }) : undefined;
  if (
    provider &&
    (typeof provider.id !== 'string' || !provider.id || typeof provider.generate !== 'function')
  ) {
    throw new TypeError('A generation provider requires a versioned id and generate()');
  }
  const keywords = { ...options.keywords };
  if (options.annotations !== undefined && !Array.isArray(options.annotations)) {
    throw new TypeError('Annotations must be an array');
  }
  if (
    options.extensionIdentity !== undefined &&
    (typeof options.extensionIdentity !== 'string' || !options.extensionIdentity)
  ) {
    throw new TypeError('extensionIdentity must be a nonempty string');
  }
  const annotations = [...(options.annotations ?? [])];
  if (Object.keys(keywords).length && !options.extensionIdentity) {
    throw new TypeError('Custom keywords require extensionIdentity for reproducibility');
  }
  const validator = new (
    selected === 'draft-07' ? Ajv : selected === 'draft-2019-09' ? Ajv2019 : Ajv2020
  )({
    allErrors: true,
    strict: true,
    strictSchema: false,
    strictTypes: false,
    strictRequired: false,
    strictTuples: false,
    allowUnionTypes: true,
    allowMatchingProperties: true,
    ownProperties: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    validateFormats: true,
    logger: false,
  });
  // ajv-formats is CommonJS; NodeNext represents its default through the module type.
  const addFormats = formatsModule as unknown as (instance: Ajv) => void;
  addFormats(validator);
  const extensions = new Set<string>();
  for (const name of [...Object.keys(keywords), ...annotations]) {
    if (
      !/^[A-Za-z_$][A-Za-z0-9_$-]{0,127}$/.test(name) ||
      ['__proto__', 'prototype', 'constructor'].includes(name) ||
      validator.getKeyword(name) ||
      extensions.has(name)
    ) {
      throw new TypeError(
        'Extensions must be unique safe names and cannot override built-in keywords'
      );
    }
    extensions.add(name);
    if (Object.hasOwn(keywords, name)) {
      const check = keywords[name];
      if (typeof check !== 'function') {
        throw new TypeError('Custom keywords require a synchronous validator');
      }
      validator.addKeyword({
        keyword: name,
        errors: false,
        validate(constraint: unknown, value: unknown) {
          const result = synchronous(check(constraint, value));
          if (typeof result !== 'boolean') {
            throw new TypeError('Custom keywords must return a boolean');
          }
          return result;
        },
      });
    } else {
      validator.addKeyword({ keyword: name, valid: true });
    }
  }
  const generators: Record<string, (random: SampleRandom) => string> = {};
  for (const [name, format] of Object.entries(customFormats)) {
    if (!format || typeof format.validate !== 'function' || typeof format.generate !== 'function') {
      throw new TypeError('Formats require synchronous validate and generate functions');
    }
    const validate = format.validate;
    const generate = format.generate;
    validator.addFormat(name, {
      type: 'string',
      validate(value: string) {
        const result = synchronous(validate(value));
        if (typeof result !== 'boolean') {
          throw new TypeError('Format validation must return a boolean synchronously');
        }
        return result;
      },
    });
    Object.defineProperty(generators, name, {
      enumerable: true,
      value: (random: SampleRandom) => {
        const result = synchronous(generate(random));
        if (typeof result !== 'string') {
          throw new TypeError('Format generation must return a string synchronously');
        }
        return result;
      },
    });
  }
  const knownFormats = new Set(Object.keys(validator.formats));
  const sampling = prepare(source, selected, maximum, knownFormats, extensions);
  const normalizedReferences = new Map<string, JsonSchema>();
  // A reference map often holds a whole component set. A reference that cannot be
  // prepared is left out and reported only if the schema actually reaches it.
  const unprepared = new Map<string, SchemaPreparationError>();
  for (const [uri, reference] of Object.entries(references)) {
    if (!uri || uri.includes('#')) {
      throw new SchemaPreparationError(
        'Reference keys must be nonempty document URIs without fragments',
        ''
      );
    }
    try {
      const document = prepare(reference, selected, maximum, knownFormats, extensions);
      const validation = selected === 'draft-07' ? draft7ValidationSchema(reference) : reference;
      // Ajv registers a schema before rejecting it, so check it first to keep a
      // rejected reference unresolvable instead of half-registered.
      if (!validator.validateSchema(validation)) {
        throw new Error(`schema is invalid: ${validator.errorsText(validator.errors)}`);
      }
      validator.addSchema(validation, uri);
      normalizedReferences.set(uri, document);
    } catch (error) {
      const failure = inReference(error, uri);
      unprepared.set(resolveUri(uri, ''), failure);
      const id = reference && typeof reference === 'object' ? reference.$id : undefined;
      if (typeof id === 'string') {
        unprepared.set(resolveUri(id, uri), failure);
      }
    }
  }
  let validate;
  try {
    validate = validator.compile(selected === 'draft-07' ? draft7ValidationSchema(source) : source);
  } catch (cause) {
    if (!(cause instanceof MissingRefError)) {
      throw new SchemaPreparationError('Schema compilation failed', '', { cause });
    }
    const failure = unprepared.get(resolveUri(cause.missingSchema, ''));
    if (failure) {
      throw failure;
    }
    const location = locateReference(cause.missingRef, [
      [undefined, source],
      ...Object.entries(references).filter(([uri]) => normalizedReferences.has(uri)),
    ]);
    throw new SchemaPreparationError(
      `Unresolved reference ${clipUri(cause.missingRef)}`,
      location?.schemaPath ?? '',
      {
        cause,
        missingReference: cause.missingRef,
        ...(location?.reference === undefined ? {} : { reference: location.reference }),
      }
    );
  }
  const compiled = validate;
  const identity = Object.freeze({
    fingerprint: fingerprint({ schema: source, references }),
    provider: provider?.id ?? 'json-schema-faker@0.6.3+ajv@8.20.0',
    configuration: fingerprint({
      profile,
      selected,
      maximum,
      formats: options.formatsIdentity ?? '',
      // Present only for schemas using the built-in date-time generator, so replays recorded
      // with the old time-zone-dependent values fail explicitly and others stay valid.
      ...(!provider &&
      !customFormats['date-time'] &&
      JSON.stringify([source, references]).includes('"date-time"')
        ? { dateTime: 'reference-window-utc-v1' }
        : {}),
      extensions: options.extensionIdentity ?? '',
      keywords: Object.keys(keywords).sort(),
      annotations: annotations.slice().sort(),
    }),
  });
  const session = (seed: SessionKey = 1): GenerationSession => createSession({ ...identity, seed });
  const check = (value: unknown): boolean => {
    try {
      copyJson(value, maximum, false);
    } catch {
      return false;
    }
    return compiled(value) as boolean;
  };
  const inspectIssues = (value: unknown): JsonSchemaIssue[] => {
    try {
      copyJson(value, maximum, false);
    } catch {
      return [
        {
          message: 'Expected bounded JSON input',
          keyword: 'jsonData',
          schemaPath: '',
          instancePath: '',
          path: [],
        },
      ];
    }
    compiled(value);
    return issues(compiled.errors);
  };
  const standard: StandardSchemaV1<unknown> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/json-schema',
      validate(value) {
        // Reject non-JSON values and oversized/cyclic data before the compiled validator.
        let candidate;
        try {
          candidate = copyJson(value, maximum, false);
        } catch {
          return { issues: [{ message: 'Expected bounded JSON input' }] };
        }
        return check(candidate) ? { value: candidate } : { issues: issues(compiled.errors) };
      },
    },
  };
  function create(execution: GenerationSession = session()): unknown {
    const stream = execution.scope(identity.provider, identity.fingerprint, identity.configuration);
    let cause: unknown;
    for (let attempt = 0; attempt < maximum.maxAttempts; attempt += 1) {
      try {
        const candidate = provider
          ? synchronous(
              provider.generate(
                Object.freeze({
                  schema: copyJson(source, maximum) as JsonSchema,
                  references: copyJson(references, maximum) as Record<string, JsonSchema>,
                  dialect: selected,
                  profile,
                  session: stream,
                  attempt,
                })
              )
            )
          : generateSync(
              (profile === 'boundary' && attempt === 0
                ? boundaryHints(sampling, maximum, stream)
                : sampling) as ProviderSchema,
              {
                seed: stream.integer(0, 0xffffffff),
                maxDepth: maximum.maxValueDepth,
                refDepthMax: maximum.maxValueDepth,
                maxDefaultItems: profile === 'random' || profile === 'boundary' ? 3 : 0,
                optionalsProbability: profile === 'random' ? 0.5 : profile === 'boundary' ? 1 : 0,
                useDefaultValue: profile === 'defaults' && attempt === 0,
                useExamplesValue: profile === 'examples' && attempt === 0,
                failOnInvalidTypes: true,
                validateSchemaVersion: true,
                formats: {
                  'date-time': referenceDateTime(execution.referenceDate()),
                  ...generators,
                },
                outputTransform(value, node) {
                  if (
                    !node ||
                    typeof node !== 'object' ||
                    !node.propertyNames ||
                    !value ||
                    typeof value !== 'object' ||
                    Array.isArray(value)
                  ) {
                    return value;
                  }
                  const output: Record<string, unknown> = {};
                  const original = value as Record<string, unknown>;
                  const fixed = new Set([
                    ...(node.required ?? []),
                    ...Object.keys(node.properties ?? {}),
                  ]);
                  for (const [key, item] of Object.entries(original)) {
                    let name = key;
                    if (!fixed.has(key)) {
                      let selected = false;
                      for (let attempt = 0; attempt < maximum.maxAttempts; attempt++) {
                        const candidate = generateSync(
                          {
                            allOf: [
                              { type: 'string', maxLength: maximum.maxStringLength },
                              node.propertyNames,
                            ],
                          },
                          {
                            seed: stream.integer(0, 0xffffffff),
                            maxDepth: maximum.maxValueDepth,
                            maxDefaultItems: 0,
                            formats: generators,
                          }
                        );
                        if (
                          typeof candidate === 'string' &&
                          candidate !== '__proto__' &&
                          !fixed.has(candidate) &&
                          !Object.hasOwn(output, candidate)
                        ) {
                          name = candidate;
                          selected = true;
                          break;
                        }
                      }
                      if (!selected) {
                        throw new SchemaGenerationError(
                          'Could not construct distinct property names',
                          maximum.maxAttempts
                        );
                      }
                    }
                    Object.defineProperty(output, name, {
                      value: item,
                      enumerable: true,
                      writable: true,
                      configurable: true,
                    });
                  }
                  return output;
                },
                refResolver(uri) {
                  const result = normalizedReferences.get(uri);
                  if (result === undefined) {
                    throw new SchemaPreparationError('Reference was not supplied in memory', '');
                  }
                  return result as ProviderSchema;
                },
              }
            );
        const value = copyJson(candidate, maximum, false);
        if (check(value)) {
          return value;
        }
        cause = issues(compiled.errors);
      } catch (error) {
        if (error instanceof SessionBudgetError) {
          throw error;
        }
        cause = error;
      }
    }
    throw new SchemaGenerationError(
      'No valid fixture was found within the generation budget; supply a custom factory or adjust the sampling profile',
      maximum.maxAttempts,
      { cause }
    );
  }
  return Object.freeze({
    source: copyJson(source, maximum) as JsonSchema,
    standard,
    identity,
    metadata: Object.freeze({
      dialect: selected,
      profile,
      generation: 'validated-sampling' as const,
      network: false as const,
    }),
    check,
    issues: inspectIssues,
    create,
    session,
    negative(
      execution: GenerationSession,
      mutation: (value: unknown) => unknown,
      target?: NegativeTarget
    ) {
      return checkedNegative(create(execution), mutation, inspectIssues, maximum, target);
    },
  });
}
/** Raw runtime JSON carries no invented application type. */
export function fromJsonSchema(
  schema: JsonSchema,
  options: JsonSchemaOptions = {}
): SchemaBuilder<unknown, unknown, [session?: GenerationSession], [session: GenerationSession]> {
  const adapter = jsonSchemaAdapter(schema, options);
  return createSchemaBuilder(
    adapter.standard,
    (session?: GenerationSession) => adapter.create(session),
    { ...options, defaultSession: adapter.session }
  ) as unknown as SchemaBuilder<
    unknown,
    unknown,
    [session?: GenerationSession],
    [session: GenerationSession]
  >;
}
/** Generate encoded INPUT through Standard JSON Schema and parse once through the native validator. */
export function fromStandardJsonSchema<S extends StandardJSONSchemaV1 & StandardSchemaV1>(
  schema: S,
  options: JsonSchemaOptions = {}
): SchemaBuilder<
  SchemaInput<S>,
  SchemaOutput<S>,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  const properties = schema?.['~standard'];
  if (
    properties?.version !== 1 ||
    typeof properties.validate !== 'function' ||
    typeof properties.jsonSchema?.input !== 'function'
  ) {
    throw new TypeError('Expected Standard Schema and Standard JSON Schema v1 capabilities');
  }
  const input = properties.jsonSchema.input({ target: options.dialect ?? 'draft-2020-12' });
  const adapter = jsonSchemaAdapter(
    copyJson(input, limits(options), true, true) as JsonSchema,
    options
  );
  // This cast binds a conversion advertised by the schema itself, not an unrelated user generic.
  return createSchemaBuilder(
    schema,
    (session?: GenerationSession) => adapter.create(session) as SchemaInput<S>,
    { ...options, defaultSession: adapter.session }
  ) as unknown as SchemaBuilder<
    SchemaInput<S>,
    SchemaOutput<S>,
    [session?: GenerationSession],
    [session: GenerationSession]
  >;
}
/**
 * The top-level `properties` names of the schema's input JSON Schema, for a setter per field:
 * `fluent(fromStandardJsonSchema(schema), standardJsonSchemaFields(schema))`. Converts the
 * input projection with the same dialect as `fromStandardJsonSchema()`; nothing is generated.
 */
export function standardJsonSchemaFields<
  S extends StandardJSONSchemaV1<object, unknown> & StandardSchemaV1<object, unknown>,
>(
  schema: S,
  options: Pick<JsonSchemaOptions, 'dialect'> = {}
): SchemaFields<Extract<keyof SchemaInput<S>, string>> {
  const converter = schema?.['~standard']?.jsonSchema;
  if (typeof converter?.input !== 'function') {
    throw new TypeError('Expected Standard JSON Schema v1 capabilities');
  }
  const input = converter.input({ target: options.dialect ?? 'draft-2020-12' });
  const properties: unknown =
    input && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'properties')?.value
      : undefined;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new TypeError('Expected an input JSON Schema with top-level properties');
  }
  return schemaFields(Object.keys(properties) as Extract<keyof SchemaInput<S>, string>[]);
}
