import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  BuilderConfig,
  BuilderFor,
  DefaultSessionFor,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';
import { initializeRuntime } from './runtime.js';

export type * from './types.js';
export type * from './standard-schema.js';
export { BuilderGenerationError, BuilderValidationError } from './runtime.js';
export { formatValidationIssues } from './issues.js';
export type { ValidationIssueFormatOptions } from './issues.js';

/** Sync and async factories retain their argument tuples and distinct build capabilities. */
export function createBuilder<F extends AnyFactory>(
  factory: F,
  config?: BuilderConfig & DefaultSessionFor<F>
): BuilderFor<F> {
  return initializeRuntime(factory, config) as unknown as BuilderFor<F>;
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
