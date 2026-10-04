import type { StaticDecode, StaticEncode, TProperties, TSchema } from 'typebox';
import * as Value from 'typebox/value';
import { BuilderGenerationError, BuilderValidationError, createSchemaBuilder } from '@mimlet/core';
import type {
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';

export interface TypeBoxOptions<
  Context extends TProperties = Record<never, never>,
> extends SchemaBuilderConfig {
  /** Native named reference context. No reference is fetched from the network. */
  readonly context?: Context;
}
function path(pointer: string): string[] {
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Preserve native codecs and references instead of reducing the schema to JSON. */
export function typeBoxAdapter<S extends TSchema, C extends TProperties = Record<never, never>>(
  source: S,
  options: TypeBoxOptions<C> = {}
) {
  type Input = StaticEncode<S, C>;
  type Output = StaticDecode<S, C>;
  const context: C = { ...options.context } as C;
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
  return Object.freeze({
    source,
    standard,
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
    create(): Input {
      try {
        const value: unknown = Value.Clone(Value.Create(context, source));
        if (!check(value)) {
          throw new BuilderValidationError(issues(value));
        }
        return value;
      } catch (cause) {
        throw new BuilderGenerationError(
          'TypeBox could not create a valid default fixture; supply fromTypeBoxFactory() for this schema',
          cause
        );
      }
    },
  });
}

/**
 * Generate native TypeBox defaults. This is deterministic creation, not random sampling.
 * Native creation is synchronous, so the builder type is concrete: generic helpers over an
 * unresolved schema keep the synchronous build methods after `with()` or `withFactory()`.
 */
export function fromTypeBox<S extends TSchema, C extends TProperties = Record<never, never>>(
  schema: S,
  options: TypeBoxOptions<C> = {}
): SchemaBuilder<StaticEncode<S, C>, StaticDecode<S, C>> {
  const adapter = typeBoxAdapter(schema, options);
  return createSchemaBuilder(adapter.standard, () => adapter.create(), options) as SchemaBuilder<
    StaticEncode<S, C>,
    StaticDecode<S, C>
  >;
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
>(
  schema: S,
  factory: F,
  options: TypeBoxOptions<C> = {}
): SchemaBuilderFor<StandardSchemaV1<StaticEncode<S, C>, StaticDecode<S, C>>, F> {
  return createSchemaBuilder(typeBoxAdapter(schema, options).standard, factory, options);
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
  return Object.freeze({
    source,
    variantSource,
    standard,
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
    create(): Input {
      const value = selected.create();
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

/** Safe discriminated-union selection: generate the entire branch before applying patches. */
export function fromTypeBoxVariant<
  S extends TSchema & { readonly anyOf: readonly TSchema[] },
  const I extends TypeBoxVariantIndex<S['anyOf']>,
  C extends TProperties = Record<never, never>,
>(
  source: S,
  index: I,
  options: TypeBoxOptions<C> = {}
): SchemaBuilder<StaticEncode<S['anyOf'][I], C>, StaticDecode<S, C>> {
  const adapter = typeBoxVariantAdapter(source, index, options);
  return createSchemaBuilder(adapter.standard, () => adapter.create(), options) as SchemaBuilder<
    StaticEncode<S['anyOf'][I], C>,
    StaticDecode<S, C>
  >;
}
