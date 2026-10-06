import type { GenerationSession } from './session.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  BuilderConfig,
  BuilderFor,
  DefaultedSessionFor,
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

export * from './session.js';

export * from './capture.js';

export * from './scenario.js';

export * from './facade.js';

export * from './fluent.js';

export * from './path.js';
