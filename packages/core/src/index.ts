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
import type { KnownFieldsFactory } from './known-fields.js';

export type * from './types.js';
export type * from './standard-schema.js';
export { BuilderGenerationError, BuilderValidationError } from './runtime.js';
export type { BuilderValidationErrorOptions } from './runtime.js';
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
  factory: F & KnownFieldsFactory<F, RecordOf<C>, InstanceType<C>>,
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
  factory: F & KnownFieldsFactory<F, RecordOf<C>, InstanceType<C>>,
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

export type { KnownFieldsFactory, KnownNestedFieldsFactory } from './known-fields.js';

export { intoClass } from './class-instance.js';
export type {
  AnyClass,
  ConstructibleClass,
  ConstructOption,
  ConstructStrategy,
  InstanceInput,
  IntoClassOptions,
} from './class-instance.js';
