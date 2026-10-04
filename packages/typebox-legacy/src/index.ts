import type { StaticDecode, StaticEncode, TSchema } from '@sinclair/typebox';
import { Errors } from '@sinclair/typebox/errors';
import * as Value from '@sinclair/typebox/value';
import { BuilderGenerationError, BuilderValidationError, createSchemaBuilder } from '@mimlet/core';
import type {
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';

export interface TypeBoxOptions extends SchemaBuilderConfig {
  /** Explicit native references. Remote fetching is never performed. */
  readonly references?: ReadonlyArray<TSchema>;
}
function path(pointer: string): string[] {
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Native @sinclair/typebox adapter. Never translates Transform into a lossy JSON schema. */
export function typeBoxAdapter<S extends TSchema>(source: S, options: TypeBoxOptions = {}) {
  type Input = StaticEncode<S>;
  type Output = StaticDecode<S>;
  const references = [...(options.references ?? [])];
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
      return Value.Encode(source, references, Value.Clone(value));
    },
    create(): Input {
      try {
        const value: unknown = Value.Clone(Value.Create(source, references));
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
 * Native creation is synchronous, so the builder type is concrete: generic helpers over an
 * unresolved schema keep the synchronous build methods after `with()` or `withFactory()`.
 */
export function fromTypeBox<S extends TSchema>(
  schema: S,
  options: TypeBoxOptions = {}
): SchemaBuilder<StaticEncode<S>, StaticDecode<S>> {
  const adapter = typeBoxAdapter(schema, options);
  return createSchemaBuilder(adapter.standard, () => adapter.create(), options) as SchemaBuilder<
    StaticEncode<S>,
    StaticDecode<S>
  >;
}
export function fromTypeBoxFactory<
  S extends TSchema,
  F extends (...args: never[]) => NoInfer<StaticEncode<S>> | PromiseLike<NoInfer<StaticEncode<S>>>,
>(
  schema: S,
  factory: F,
  options: TypeBoxOptions = {}
): SchemaBuilderFor<StandardSchemaV1<StaticEncode<S>, StaticDecode<S>>, F> {
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
      return parent.decode(value as StaticEncode<S>);
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
>(
  source: S,
  index: I,
  options: TypeBoxOptions = {}
): SchemaBuilder<StaticEncode<S['anyOf'][I]>, StaticDecode<S>> {
  const adapter = typeBoxVariantAdapter(source, index, options);
  return createSchemaBuilder(adapter.standard, () => adapter.create(), options) as SchemaBuilder<
    StaticEncode<S['anyOf'][I]>,
    StaticDecode<S>
  >;
}
