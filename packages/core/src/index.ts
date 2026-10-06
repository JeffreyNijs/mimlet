import type { GenerationSession } from './session.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  Builder,
  BuilderConfig,
  BuilderFor,
  DefaultedSessionFor,
  DefaultSessionFor,
  MappedBuilderFor,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';
import { initializeRuntime } from './runtime.js';
import {
  intoClass,
  type AnyClass,
  type ConstructibleClass,
  type ConstructOption,
  type InstanceInput,
} from './class-instance.js';

export type * from './types.js';
export type * from './standard-schema.js';
export { BuilderGenerationError, BuilderValidationError } from './runtime.js';
export { formatValidationIssues } from './issues.js';
export type { ValidationIssueFormatOptions } from './issues.js';

/**
 * With a `defaultSession`, builds may omit the leading session, and the factory, patch
 * factories and transforms always receive one, so the factory may declare it as required.
 */
export function createBuilder<F extends (session: GenerationSession) => unknown>(
  factory: F,
  config: BuilderConfig & DefaultedSessionFor<F>
): BuilderFor<F, true>;
/** Sync and async factories retain their argument tuples and distinct build capabilities. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createBuilder<F extends AnyFactory>(
  factory: F,
  config?: BuilderConfig & DefaultSessionFor<F>
): BuilderFor<F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createBuilder(factory: AnyFactory, config?: BuilderConfig): unknown {
  return initializeRuntime(factory, config);
}

/**
 * With a `defaultSession`, builds may omit the leading session, and the factory, patch
 * factories and transforms always receive one, so the factory may declare it as required.
 */
export function createSchemaBuilder<
  S extends StandardSchemaV1,
  F extends (
    session: GenerationSession
  ) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config: SchemaBuilderConfig & DefaultedSessionFor<F>
): SchemaBuilderFor<S, F, true>;
/** Build schema INPUT, then optionally validate exactly once to obtain OUTPUT. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createSchemaBuilder<
  S extends StandardSchemaV1,
  F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config?: SchemaBuilderConfig & DefaultSessionFor<F>
): SchemaBuilderFor<S, F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createSchemaBuilder(
  schema: StandardSchemaV1,
  factory: AnyFactory,
  config?: SchemaBuilderConfig
): unknown {
  if (schema === undefined) {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }
  return initializeRuntime(factory, config, schema);
}

/** The record a builder for class `C` patches. */
type RecordOf<C extends AnyClass> = InstanceInput<InstanceType<C>>;
/** A factory of the record, with any arguments, sync or async. */
type RecordFactory<C extends AnyClass> = (
  ...args: never[]
) => NoInfer<RecordOf<C>> | PromiseLike<NoInfer<RecordOf<C>>>;
/** The type a key gets when the class does not declare it: the message TypeScript reports. */
type UnknownField<K> = K extends string | number ? `${K} is not a field of the class` : never;
/** Keys of the record `R` (or of any member of a union) that `Shape` does not declare. */
type UnknownKeys<R, Shape> = R extends unknown ? Exclude<keyof R, keyof Shape> : never;
/** `R` with each key that `Shape` does not declare typed as an error message. */
type KnownFieldsOf<R, Shape> = R extends unknown
  ? { [K in keyof R]: K extends keyof Shape ? R[K] : UnknownField<K> }
  : never;
type KnownFieldsReturn<R, Shape> =
  R extends PromiseLike<infer V> ? PromiseLike<KnownFieldsOf<V, Shape>> : KnownFieldsOf<R, Shape>;
/**
 * TypeScript does not report excess properties of an object literal that a function returns,
 * so without this check a misspelled field in an unannotated factory would compile and be
 * copied onto the instance. Intersected with the factory's own type, it is `unknown` when every
 * key the factory returns is a field of the class (or the return type is `any`), and otherwise
 * a signature that types each unknown key as `"<key> is not a field of the class"`.
 */
type KnownFieldsFactory<F extends AnyFactory, Shape> =
  unknown extends ReturnType<F>
    ? unknown
    : [UnknownKeys<Awaited<ReturnType<F>>, Shape>] extends [never]
      ? unknown
      : (...args: Parameters<F>) => KnownFieldsReturn<ReturnType<F>, Shape>;
/** The configuration of an instance builder: builder options plus the `construct` option. */
type InstanceConfig<C extends AnyClass, F extends AnyFactory> = BuilderConfig &
  ConstructOption<C> &
  DefaultSessionFor<F>;
/**
 * The builder `createInstanceBuilder(C, factory)` returns, with build arguments `Args`: it
 * patches the class's record and builds instances. Name it as a helper's return type.
 */
export type InstanceBuilder<C extends AnyClass, Args extends unknown[] = []> = Builder<
  RecordOf<C>,
  Args,
  InstanceType<C>
>;

/**
 * With a `defaultSession`, builds may omit the leading session, and the factory, patch
 * factories, transforms and mappers always receive one, so the factory may declare it as
 * required.
 */
export function createInstanceBuilder<
  C extends AnyClass,
  F extends (
    session: GenerationSession
  ) => NoInfer<RecordOf<C>> | PromiseLike<NoInfer<RecordOf<C>>>,
>(
  target: C,
  factory: F & KnownFieldsFactory<F, RecordOf<C>>,
  config: BuilderConfig & ConstructOption<C> & DefaultedSessionFor<F>
): MappedBuilderFor<F, RecordOf<C>, InstanceType<C>, true>;
/**
 * A builder of class instances. The factory returns the class's plain record
 * (`InstanceInput<InstanceType<C>>`, checked as TypeScript reads it), patches apply to that
 * record, and each build ends by creating the instance with `intoClass(C, { construct })`.
 * The factory needs no return type annotation: its literals keep their types, a missing
 * field is reported, and so is a key the class does not declare (such as a misspelled field).
 * Transforms added later receive the instance and must return an instance of `C`.
 * `construct: 'prototype'` is required for a class whose constructor takes arguments.
 */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createInstanceBuilder<C extends AnyClass, F extends RecordFactory<C>>(
  target: C,
  factory: F & KnownFieldsFactory<F, RecordOf<C>>,
  ...config: C extends ConstructibleClass
    ? [config?: InstanceConfig<C, F>]
    : [config: InstanceConfig<C, F>]
): MappedBuilderFor<F, RecordOf<C>, InstanceType<C>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createInstanceBuilder(
  target: AnyClass,
  factory: AnyFactory,
  config: BuilderConfig & { readonly construct?: 'new' | 'prototype' } = {}
): unknown {
  const { construct, ...rest } = config;
  const mapper = intoClass(target, { construct: construct ?? 'new' } as { construct: 'prototype' });
  return initializeRuntime(factory, rest).map(mapper as (value: unknown) => unknown);
}

export * from './session.js';

export * from './capture.js';

export * from './scenario.js';

export * from './facade.js';

export * from './fluent.js';

export * from './path.js';

export { intoClass } from './class-instance.js';
export type {
  AnyClass,
  ConstructibleClass,
  ConstructOption,
  ConstructStrategy,
  InstanceInput,
  IntoClassOptions,
} from './class-instance.js';
