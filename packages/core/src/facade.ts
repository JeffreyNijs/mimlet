import { facadeClass } from './facade-class.js';
import { initializeRuntime } from './runtime.js';
import type { GenerationSession } from './session.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  AsyncBuilder,
  AsyncSchemaBuilder,
  Builder,
  BuilderConfig,
  BuilderDescription,
  BuilderFor,
  BuilderPatch,
  BuilderTransform,
  BuiltList,
  DefaultedSessionFor,
  DefaultSessionFor,
  OptionalKeys,
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';

/** Async build methods keep their own signatures, including literal-count list tuples. */
type AsyncBuildMethod =
  'buildAsync' | 'buildListAsync' | 'buildValidatedAsync' | 'buildValidatedListAsync' | 'describe';
/** Retarget fluent methods, including generated methods, after an async transition. */
export type AsyncFacade<T> = {
  [
    K in Exclude<keyof T, 'build' | 'buildList' | 'buildValidated' | 'buildValidatedList'>
  ]: K extends AsyncBuildMethod
    ? T[K]
    : T[K] extends (...args: infer A) => infer R
      ? (...args: A) => R extends T ? AsyncFacade<T> : R
      : T[K];
};
/** `Received` are the arguments callbacks receive; see `AsyncBuilder`. */
export interface AsyncBuilderFacade<
  T,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> {
  with(patch: BuilderPatch<T>): this;
  replace(value: T): this;
  withFactory(factory: (...args: Received) => BuilderPatch<T>): this;
  replaceFactory(factory: (...args: Received) => T): this;
  omit(...keys: OptionalKeys<T>[]): this;
  transform(transformer: BuilderTransform<T, Received>): this;
  transformAsync(
    transformer: (value: T, ...args: Received) => T | PromiseLike<T>
  ): AsyncFacade<this>;
  buildAsync(...args: Args): Promise<T>;
  buildListAsync<N extends number>(count: N, ...args: Args): Promise<BuiltList<T, N>>;
  describe(): BuilderDescription;
}
export interface BuilderFacade<
  T,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncBuilderFacade<T, Args, Received> {
  build(...args: Args): T;
  buildList<N extends number>(count: N, ...args: Args): BuiltList<T, N>;
}
export interface AsyncSchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncBuilderFacade<I, Args, Received> {
  usingValidation(options: StandardSchemaV1.Options): this;
  buildValidatedAsync(...args: Args): Promise<O>;
  buildValidatedListAsync<N extends number>(count: N, ...args: Args): Promise<BuiltList<O, N>>;
}
export interface SchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncSchemaBuilderFacade<I, O, Args, Received> {
  build(...args: Args): I;
  buildList<N extends number>(count: N, ...args: Args): BuiltList<I, N>;
  buildValidated(...args: Args): O;
  buildValidatedList<N extends number>(count: N, ...args: Args): BuiltList<O, N>;
}
export type FacadeFor<B> =
  B extends SchemaBuilder<infer I, infer O, infer A, infer R>
    ? SchemaBuilderFacade<I, O, A, R>
    : B extends AsyncSchemaBuilder<infer I, infer O, infer A, infer R>
      ? AsyncSchemaBuilderFacade<I, O, A, R>
      : B extends Builder<infer T, infer A, infer R>
        ? BuilderFacade<T, A, R>
        : B extends AsyncBuilder<infer T, infer A, infer R>
          ? AsyncBuilderFacade<T, A, R>
          : never;
type InputOf<B> = B extends { buildAsync(...args: never[]): Promise<infer T> } ? T : never;
export type BuilderConstructor<B> = new (initial?: BuilderPatch<InputOf<B>>) => FacadeFor<B>;

/**
 * A class facade over a builder definition. Intended for generated classes and
 * method-only subclasses: fluent branches copy public own descriptors, not private fields.
 * The construction/validation implementation remains exclusively in the core runtime.
 */
export function builderClass<B extends { buildAsync: AnyFactory; describe(): BuilderDescription }>(
  definition: () => B
): BuilderConstructor<B> {
  return facadeClass(definition) as unknown as BuilderConstructor<B>;
}

/** With a `defaultSession`, builds may omit the leading session; see `createBuilder()`. */
export function createBuilderClass<F extends (session: GenerationSession) => unknown>(
  factory: F,
  config: BuilderConfig & DefaultedSessionFor<F>
): BuilderConstructor<BuilderFor<F, true>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createBuilderClass<F extends AnyFactory>(
  factory: F,
  config?: BuilderConfig & DefaultSessionFor<F>
): BuilderConstructor<BuilderFor<F>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createBuilderClass(factory: AnyFactory, config?: BuilderConfig): unknown {
  return builderClass(() => initializeRuntime(factory, config));
}
/** With a `defaultSession`, builds may omit the leading session; see `createSchemaBuilder()`. */
export function createSchemaBuilderClass<
  S extends StandardSchemaV1,
  F extends (
    session: GenerationSession
  ) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config: SchemaBuilderConfig & DefaultedSessionFor<F>
): BuilderConstructor<SchemaBuilderFor<S, F, true>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function createSchemaBuilderClass<
  S extends StandardSchemaV1,
  F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config?: SchemaBuilderConfig & DefaultSessionFor<F>
): BuilderConstructor<SchemaBuilderFor<S, F>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function createSchemaBuilderClass(
  schema: StandardSchemaV1,
  factory: AnyFactory,
  config?: SchemaBuilderConfig
): unknown {
  if (schema === undefined) {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }
  return builderClass(() => initializeRuntime(factory, config, schema));
}
