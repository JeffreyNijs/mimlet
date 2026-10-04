import { Kind } from '@sinclair/typebox';
import type { StaticDecode, StaticEncode, TObject, TSchema } from '@sinclair/typebox';
import { Errors } from '@sinclair/typebox/errors';
import * as Value from '@sinclair/typebox/value';
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

export interface TypeBoxOptions extends SchemaBuilderConfig {
  /** Explicit native references. Remote fetching is never performed. */
  readonly references?: ReadonlyArray<TSchema>;
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
const provider = 'test-builders/@sinclair/typebox@0.34/value-create-v1';
type References = ReadonlyArray<TSchema>;
const native: FillNative<References> = {
  kind: (node) => node[Kind],
  // Native creation and checks push `$id` schemas onto the array, so each call gets a copy.
  create: (node, scope) => Value.Create(node as unknown as TSchema, [...scope.create]),
  check: (node, scope, value) => Value.Check(node as unknown as TSchema, [...scope.check], value),
  clone: (value) => Value.Clone(value),
  // `This` and `Ref` resolve through enclosing `$id` schemas and a module's definitions.
  enter: (node, scope) => {
    const definitions = node['$defs'];
    const added = [
      ...(typeof node['$id'] === 'string' ? [node] : []),
      ...(node[Kind] === 'Import' && typeof definitions === 'object' && definitions !== null
        ? Object.values(definitions)
        : []),
    ] as TSchema[];
    return added.length
      ? { check: [...scope.check, ...added], create: [...scope.create, ...added] }
      : scope;
  },
};

/** Native @sinclair/typebox adapter. Never translates Transform into a lossy JSON schema. */
export function typeBoxAdapter<S extends TSchema>(source: S, options: TypeBoxOptions = {}) {
  type Input = StaticEncode<S>;
  type Output = StaticDecode<S>;
  const references = [...(options.references ?? [])];
  const settings = fillSettings(options.fill);
  const check = (value: unknown): value is Input => Value.Check(source, references, value);
  const issues = (value: unknown): ValidationIssue[] =>
    [...Errors(source, references, value)].map((error) => ({
      message: error.message,
      path: path(error.path),
    }));
  const decodeChecked = (value: Input): Output =>
    Value.Decode(source, references, Value.Clone(value));
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/typebox-legacy',
      validate(value) {
        if (!check(value)) {
          return { issues: issues(value) };
        }
        // Legacy Decode checks and executes Transform callbacks; it does not repair input.
        return { value: decodeChecked(value) };
      },
    },
  };
  const identity = Object.freeze({
    fingerprint: fingerprint({ schema: source, references }),
    provider,
    configuration: fingerprint(fillIdentity(settings)),
  });
  const session = (seed: SessionKey = 1): GenerationSession => createSession({ ...identity, seed });
  const original: References = [...references];
  let prepared: { readonly now: string; readonly source: TSchema; readonly references: TSchema[] };
  const creation = (configured: FillSettings, now: string) => {
    if (prepared?.now !== now) {
      const fill = prepareFill(native, configured, new Date(now));
      const filled = original.map(
        (schema, index) =>
          fill.reference(
            typeof schema.$id === 'string' ? schema.$id : String(index),
            schema as unknown as Node,
            { check: original, create: original }
          ) as unknown as TSchema
      );
      prepared = {
        now,
        references: filled,
        source: fill.node(source as unknown as Node, {
          check: original,
          create: filled,
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
      return Value.Encode(source, references, Value.Clone(value));
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
          created = Value.Create(filled.source, [...filled.references]);
        } else {
          created = Value.Create(source, references);
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
export type TypeBoxBuilder<S extends TSchema> = SchemaBuilder<
  StaticEncode<S>,
  StaticDecode<S>,
  [session?: GenerationSession]
>;

/**
 * The builder `fromTypeBoxFactory(schema, factory, options)` returns for a factory of type `F`:
 * the factory's arguments, and synchronous build methods unless `F` returns a promise. Pass
 * the factory's own type as `F`. As with the function, sync or async is decided once `S` is known.
 */
export type TypeBoxFactoryBuilder<
  S extends TSchema,
  F extends (...args: never[]) => StaticEncode<S> | PromiseLike<StaticEncode<S>>,
> = SchemaBuilderFor<StandardSchemaV1<StaticEncode<S>, StaticDecode<S>>, F>;

/**
 * Native creation is synchronous, so the builder type is concrete: generic helpers over an
 * unresolved schema keep the synchronous build methods after `with()` or `withFactory()`.
 * A session-less build or list uses the adapter's seed-1 session, so `withFactory()` and
 * transforms can draw distinct values for list items from it.
 */
export function fromTypeBox<S extends TSchema>(
  schema: S,
  options: TypeBoxOptions = {}
): TypeBoxBuilder<S> {
  const adapter = typeBoxAdapter(schema, options);
  return createSchemaBuilder(
    adapter.standard,
    (session?: GenerationSession) => adapter.create(session),
    { ...options, defaultSession: adapter.session }
  ) as TypeBoxBuilder<S>;
}
export function fromTypeBoxFactory<
  S extends TSchema,
  F extends (...args: never[]) => NoInfer<StaticEncode<S>> | PromiseLike<NoInfer<StaticEncode<S>>>,
>(schema: S, factory: F, options: TypeBoxOptions = {}): TypeBoxFactoryBuilder<S, F> {
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
>(source: S, index: I, options: TypeBoxOptions = {}) {
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
  type Input = StaticEncode<S['anyOf'][I]>;
  type Output = StaticDecode<S>;
  // Preserve self-references to the enclosing legacy union when inspecting its branch.
  const nativeOptions = {
    ...options,
    references: [source, ...(options.references ?? []).filter((schema) => schema !== source)],
  };
  const parent = typeBoxAdapter(source, nativeOptions);
  const selected = typeBoxAdapter(variantSource, nativeOptions);
  const check = (value: unknown): value is Input => selected.check(value) && parent.check(value);
  const issues = (value: unknown): ValidationIssue[] =>
    selected.check(value) ? parent.issues(value) : selected.issues(value);
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/typebox-legacy/variant',
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
      return parent.decode(value as StaticEncode<S>);
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
> = SchemaBuilder<StaticEncode<S['anyOf'][I]>, StaticDecode<S>, [session?: GenerationSession]>;

/** Safe discriminated-union selection: generate the entire branch before applying patches. */
export function fromTypeBoxVariant<
  S extends TSchema & { readonly anyOf: readonly TSchema[] },
  const I extends TypeBoxVariantIndex<S['anyOf']>,
>(source: S, index: I, options: TypeBoxOptions = {}): TypeBoxVariantBuilder<S, I> {
  const adapter = typeBoxVariantAdapter(source, index, options);
  return createSchemaBuilder(
    adapter.standard,
    (session?: GenerationSession) => adapter.create(session),
    { ...options, defaultSession: adapter.session }
  ) as TypeBoxVariantBuilder<S, I>;
}
