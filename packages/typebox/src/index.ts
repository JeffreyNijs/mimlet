import type { StaticDecode, StaticEncode, TObject, TProperties, TSchema } from 'typebox';
import * as Value from 'typebox/value';
import {
  BuilderGenerationError,
  BuilderValidationError,
  createSchemaBuilder,
  createSession,
  schemaFields,
} from '@mimlet/core';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SessionKey,
  SchemaFields,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import { FillFailure, fillIdentity, fillSettings, fingerprint, prepareFill } from './fill.js';
import type { FillNative, FillSettings, Node, TypeBoxFill } from './fill.js';
export type { TypeBoxFill } from './fill.js';

export interface TypeBoxOptions<
  Context extends TProperties = Record<never, never>,
> extends SchemaBuilderConfig {
  /** Native named reference context. No reference is fetched from the network. */
  readonly context?: Context;
  /**
   * Deterministic values where native creation cannot create one, on a creation-only copy of
   * the schema. `false` uses plain native `Value.Create`.
   */
  readonly fill?: TypeBoxFill | false;
}
function path(pointer: string): string[] {
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Versioned creation identity: change it when native creation or the fill changes output. */
const provider = 'test-builders/typebox@1.3.34/value-create-v1';
type References = Readonly<Record<string, unknown>>;
const native: FillNative<References> = {
  kind: (node) => node['~kind'],
  create: (node, scope) => Value.Create(scope.create as TProperties, node as unknown as TSchema),
  check: (node, scope, value) =>
    Value.Check(scope.check as TProperties, node as unknown as TSchema, value),
  clone: (value) => Value.Clone(value),
  // A Cyclic type resolves its references through its own definitions.
  enter: (node, scope) => {
    const definitions = node['$defs'];
    return node['~kind'] === 'Cyclic' && typeof definitions === 'object' && definitions !== null
      ? {
          check: { ...scope.check, ...definitions },
          create: { ...scope.create, ...definitions },
        }
      : scope;
  },
};

/** Preserve native codecs and references instead of reducing the schema to JSON. */
export function typeBoxAdapter<S extends TSchema, C extends TProperties = Record<never, never>>(
  source: S,
  options: TypeBoxOptions<C> = {}
) {
  type Input = StaticEncode<S, C>;
  type Output = StaticDecode<S, C>;
  const context: C = { ...options.context } as C;
  const settings = fillSettings(options.fill);
  const check = (value: unknown): value is Input => Value.Check(context, source, value);
  const issues = (value: unknown): ValidationIssue[] =>
    Value.Errors(context, source, value).map((error) => ({
      message: error.message,
      path: path(error.instancePath),
    }));
  const decodeChecked = (value: Input): Output =>
    Value.DecodeUnsafe(context, source, Value.Clone(value)) as Output;
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/typebox',
      validate(value) {
        if (!check(value)) {
          return { issues: issues(value) };
        }
        // Deliberately bypass Decode's Default/Convert/Clean pipeline AFTER checking.
        return { value: decodeChecked(value) };
      },
    },
  };
  const identity = Object.freeze({
    fingerprint: fingerprint({ schema: source, context }),
    provider,
    configuration: fingerprint(fillIdentity(settings)),
  });
  const session = (seed: SessionKey = 1): GenerationSession => createSession({ ...identity, seed });
  let prepared: { readonly now: string; readonly source: TSchema; readonly context: TProperties };
  const creation = (configured: FillSettings, now: string) => {
    if (prepared?.now !== now) {
      const fill = prepareFill(native, configured, new Date(now));
      const original = context as References;
      const references = Object.fromEntries(
        Object.entries(original).map(([name, schema]) => [
          name,
          fill.reference(name, schema as Node, { check: original, create: original }),
        ])
      );
      prepared = {
        now,
        context: references as TProperties,
        source: fill.node(source as unknown as Node, {
          check: original,
          create: references,
        }) as unknown as TSchema,
      };
    }
    return prepared;
  };
  return Object.freeze({
    source,
    standard,
    identity,
    session,
    metadata: Object.freeze({
      generation: 'native-defaults' as const,
      validation: 'native-strict' as const,
    }),
    check,
    issues,
    decode(value: Input): Output {
      if (!check(value)) {
        throw new BuilderValidationError(issues(value));
      }
      return decodeChecked(value);
    },
    encode(value: Output): Input {
      const encoded = Value.EncodeUnsafe(context, source, Value.Clone(value));
      if (!check(encoded)) {
        throw new BuilderValidationError(issues(encoded));
      }
      return encoded;
    },
    /** The fill takes dates from the session's reference time; nothing else reads it. */
    create(execution?: GenerationSession): Input {
      try {
        let created: unknown;
        if (settings) {
          const filled = creation(
            settings,
            settings.now ?? (execution ?? session()).referenceDate().toISOString()
          );
          created = Value.Create(filled.context, filled.source);
        } else {
          created = Value.Create(context, source);
        }
        const value: unknown = Value.Clone(created);
        if (!check(value)) {
          throw new BuilderValidationError(issues(value));
        }
        return value;
      } catch (cause) {
        if (cause instanceof FillFailure) {
          throw cause;
        }
        throw new BuilderGenerationError(
          'TypeBox could not create a valid default fixture; supply fromTypeBoxFactory() for this schema',
          cause
        );
      }
    },
  });
}

/**
 * The builder `fromTypeBox(schema, options)` returns: synchronous, with encoded input, decoded
 * output and an optional session. Name it as a generic helper's return type.
 */
export type TypeBoxBuilder<
  S extends TSchema,
  C extends TProperties = Record<never, never>,
> = SchemaBuilder<StaticEncode<S, C>, StaticDecode<S, C>, [session?: GenerationSession]>;

/**
 * The builder `fromTypeBoxFactory(schema, factory, options)` returns for a factory of type `F`:
 * the factory's arguments, and synchronous build methods unless `F` returns a promise. Pass
 * the factory's own type as `F`. As with the function, sync or async is decided once `S` is known.
 */
export type TypeBoxFactoryBuilder<
  S extends TSchema,
  F extends (...args: never[]) => StaticEncode<S, C> | PromiseLike<StaticEncode<S, C>>,
  C extends TProperties = Record<never, never>,
> = SchemaBuilderFor<StandardSchemaV1<StaticEncode<S, C>, StaticDecode<S, C>>, F>;

/**
 * Generate native TypeBox defaults. This is deterministic creation, not random sampling.
 * Native creation is synchronous, so the builder type is concrete: generic helpers over an
 * unresolved schema keep the synchronous build methods after `with()` or `withFactory()`.
 * A session-less build or list uses the adapter's seed-1 session, so `withFactory()` and
 * transforms can draw distinct values for list items from it.
 */
export function fromTypeBox<S extends TSchema, C extends TProperties = Record<never, never>>(
  schema: S,
  options: TypeBoxOptions<C> = {}
): TypeBoxBuilder<S, C> {
  const adapter = typeBoxAdapter(schema, options);
  return createSchemaBuilder(
    adapter.standard,
    (session?: GenerationSession) => adapter.create(session),
    { ...options, defaultSession: adapter.session }
  ) as TypeBoxBuilder<S, C>;
}

/** Use a custom sync/async factory without losing encoded/decoded types or arguments. */
export function fromTypeBoxFactory<
  S extends TSchema,
  C extends TProperties = Record<never, never>,
  F extends (
    ...args: never[]
  ) => NoInfer<StaticEncode<S, C>> | PromiseLike<NoInfer<StaticEncode<S, C>>> = () => StaticEncode<
    S,
    C
  >,
>(schema: S, factory: F, options: TypeBoxOptions<C> = {}): TypeBoxFactoryBuilder<S, F, C> {
  return createSchemaBuilder(typeBoxAdapter(schema, options).standard, factory, options);
}

/**
 * The object schema's top-level property names, for a setter per field:
 * `fluent(fromTypeBox(schema), typeBoxFields(schema))`. Reads only `schema.properties`.
 */
export function typeBoxFields<S extends TObject>(
  schema: S
): SchemaFields<Extract<keyof S['properties'], string>> {
  const properties: unknown = schema?.type === 'object' ? schema.properties : undefined;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new TypeError('Expected a TypeBox object schema');
  }
  return schemaFields(Object.keys(properties) as Extract<keyof S['properties'], string>[]);
}

/** Literal indexes of a statically known union; runtime-length unions accept numbers. */
export type TypeBoxVariantIndex<T extends readonly unknown[]> = number extends T['length']
  ? number
  : Extract<keyof T, `${number}`> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never;

/** Generate one complete branch, while preserving validation and decoding of the original union. */
export function typeBoxVariantAdapter<
  S extends TSchema & { readonly anyOf: readonly TSchema[] },
  const I extends TypeBoxVariantIndex<S['anyOf']>,
  C extends TProperties = Record<never, never>,
>(source: S, index: I, options: TypeBoxOptions<C> = {}) {
  if (
    !source ||
    !Array.isArray(source.anyOf) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= source.anyOf.length ||
    !Object.hasOwn(source.anyOf, index)
  ) {
    throw new TypeError('Expected an existing TypeBox anyOf variant index');
  }
  const variantSource = source.anyOf[index] as S['anyOf'][I];
  if (!variantSource || typeof variantSource !== 'object') {
    throw new TypeError('Expected a native TypeBox variant schema');
  }
  type Input = StaticEncode<S['anyOf'][I], C>;
  type Output = StaticDecode<S, C>;
  const nativeOptions = options;
  const parent = typeBoxAdapter(source, nativeOptions);
  const selected = typeBoxAdapter(variantSource, nativeOptions);
  const check = (value: unknown): value is Input => selected.check(value) && parent.check(value);
  const issues = (value: unknown): ValidationIssue[] =>
    selected.check(value) ? parent.issues(value) : selected.issues(value);
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/typebox/variant',
      validate(value, validationOptions) {
        if (!selected.check(value)) {
          return { issues: selected.issues(value) };
        }
        // Decode the original union, not a branch twice or a different codec pipeline.
        return parent.standard['~standard'].validate(value, validationOptions);
      },
    },
  };
  const identity = Object.freeze({
    ...parent.identity,
    fingerprint: fingerprint({ union: parent.identity.fingerprint, variant: index }),
  });
  return Object.freeze({
    source,
    variantSource,
    standard,
    identity,
    session: (seed: SessionKey = 1): GenerationSession => createSession({ ...identity, seed }),
    metadata: Object.freeze({ ...parent.metadata, variant: index }),
    check,
    issues,
    decode(value: Input): Output {
      if (!check(value)) {
        throw new BuilderValidationError(issues(value));
      }
      return parent.decode(value as StaticEncode<S, C>);
    },
    encode(value: Output): Input {
      const encoded: unknown = parent.encode(value);
      if (!check(encoded)) {
        throw new BuilderValidationError(issues(encoded));
      }
      return encoded;
    },
    create(execution?: GenerationSession): Input {
      const value = selected.create(execution);
      if (!parent.check(value)) {
        throw new BuilderGenerationError(
          'The selected variant does not satisfy the enclosing union',
          new BuilderValidationError(parent.issues(value))
        );
      }
      return value;
    },
  });
}

/**
 * The builder `fromTypeBoxVariant(union, index, options)` returns: input of the selected
 * branch, decoded output of the whole union, synchronous, with an optional session.
 */
export type TypeBoxVariantBuilder<
  S extends TSchema & { readonly anyOf: readonly TSchema[] },
  I extends TypeBoxVariantIndex<S['anyOf']>,
  C extends TProperties = Record<never, never>,
> = SchemaBuilder<
  StaticEncode<S['anyOf'][I], C>,
  StaticDecode<S, C>,
  [session?: GenerationSession]
>;

/** Safe discriminated-union selection: generate the entire branch before applying patches. */
export function fromTypeBoxVariant<
  S extends TSchema & { readonly anyOf: readonly TSchema[] },
  const I extends TypeBoxVariantIndex<S['anyOf']>,
  C extends TProperties = Record<never, never>,
>(source: S, index: I, options: TypeBoxOptions<C> = {}): TypeBoxVariantBuilder<S, I, C> {
  const adapter = typeBoxVariantAdapter(source, index, options);
  return createSchemaBuilder(
    adapter.standard,
    (session?: GenerationSession) => adapter.create(session),
    { ...options, defaultSession: adapter.session }
  ) as TypeBoxVariantBuilder<S, I, C>;
}
