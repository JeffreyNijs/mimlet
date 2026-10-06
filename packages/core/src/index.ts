import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  BuilderConfig,
  BuilderFor,
  DefaultSessionFor,
  IntoBuilderFor,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';
import { initializeRuntime } from './runtime.js';
import {
  intoClass,
  type AnyClass,
  type ConstructibleClass,
  type ConstructStrategy,
  type InstanceInput,
  type IntoClassConfig,
} from './class-instance.js';

export type * from './types.js';
export type * from './standard-schema.js';
export { BuilderGenerationError, BuilderValidationError } from './runtime.js';
export { formatValidationIssues } from './issues.js';
export type { ValidationIssueFormatOptions } from './issues.js';

/**
 * PROTOTYPE (docs/proposals/class-instances.md): build into a class. The factory returns the
 * plain record (`InstanceInput<InstanceType<C>>`), patches apply to that record, and each
 * build ends by creating the instance, as if `.map(intoClass(C))` were the first transform.
 */
export function createBuilder<
  C extends AnyClass,
  F extends (
    ...args: never[]
  ) =>
    NoInfer<InstanceInput<InstanceType<C>>> | PromiseLike<NoInfer<InstanceInput<InstanceType<C>>>>,
>(
  factory: F,
  config: BuilderConfig & IntoClassConfig<C> & DefaultSessionFor<F>
): IntoBuilderFor<F, InstanceInput<InstanceType<C>>, InstanceType<C>>;
/** Sync and async factories retain their argument tuples and distinct build capabilities. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createBuilder<F extends AnyFactory>(
  factory: F,
  config?: BuilderConfig & DefaultSessionFor<F>
): BuilderFor<F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createBuilder(
  factory: AnyFactory,
  config?: BuilderConfig & {
    readonly into?: AnyClass;
    readonly construct?: 'new' | 'prototype';
    readonly defaultSession?: () => unknown;
  }
): unknown {
  type RuntimeConfig = Parameters<typeof initializeRuntime>[1];
  if (config?.into === undefined) {
    return initializeRuntime(factory, config as RuntimeConfig);
  }
  const { into, construct, ...rest } = config;
  const mapper = intoClass(into, { construct: construct ?? 'new' } as { construct: 'prototype' });
  return initializeRuntime(factory, rest as RuntimeConfig).map(
    mapper as (value: unknown) => unknown
  );
}

type InstanceFactory<C extends AnyClass> = (
  ...args: never[]
) => NoInfer<InstanceInput<InstanceType<C>>> | PromiseLike<NoInfer<InstanceInput<InstanceType<C>>>>;
/**
 * PROTOTYPE (docs/proposals/class-instances.md): the class-first form of
 * `createBuilder(factory, { into })`. With the class first, TypeScript checks the factory
 * against `InstanceInput` as it reads it, so string-literal fields need no `as const`.
 */
export function createInstanceBuilder<C extends ConstructibleClass, F extends InstanceFactory<C>>(
  target: C,
  factory: F,
  config?: BuilderConfig & { readonly construct?: ConstructStrategy } & DefaultSessionFor<F>
): IntoBuilderFor<F, InstanceInput<InstanceType<C>>, InstanceType<C>>;
/** A constructor that requires arguments is never called: pass `construct: 'prototype'`. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createInstanceBuilder<C extends AnyClass, F extends InstanceFactory<C>>(
  target: C,
  factory: F,
  config: BuilderConfig & { readonly construct: 'prototype' } & DefaultSessionFor<F>
): IntoBuilderFor<F, InstanceInput<InstanceType<C>>, InstanceType<C>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createInstanceBuilder(
  target: AnyClass,
  factory: AnyFactory,
  config: BuilderConfig & { readonly construct?: ConstructStrategy } = {}
): unknown {
  return createBuilder(
    factory as InstanceFactory<AnyClass>,
    {
      ...config,
      into: target,
    } as BuilderConfig & IntoClassConfig<AnyClass>
  );
}

/** Build schema INPUT, then optionally validate exactly once to obtain OUTPUT. */
export function createSchemaBuilder<
  S extends StandardSchemaV1,
  F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config?: SchemaBuilderConfig & DefaultSessionFor<F>
): SchemaBuilderFor<S, F> {
  if (schema === undefined) {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }
  return initializeRuntime(factory, config, schema) as unknown as SchemaBuilderFor<S, F>;
}

export * from './session.js';

export * from './capture.js';

export * from './scenario.js';

export * from './facade.js';

export * from './fluent.js';

export * from './path.js';

// PROTOTYPE (docs/proposals/class-instances.md)
export { intoClass } from './class-instance.js';
export type {
  AnyClass,
  ConstructibleClass,
  ConstructStrategy,
  InstanceInput,
  IntoClassConfig,
  IntoClassOptions,
} from './class-instance.js';
