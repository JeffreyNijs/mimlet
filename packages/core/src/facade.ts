import { facadeClass } from './facade-class.js';
import { initializeRuntime } from './runtime.js';
import type { GenerationSession } from './session.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  BuilderConfig,
  BuilderDescription,
  BuilderFor,
  BuilderPatch,
  BuilderTransform,
  BuiltList,
  DefaultedSessionFor,
  DefaultSessionFor,
  OptionalKeys,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';

/** Async build methods keep their own signatures, including literal-count list tuples. */
type AsyncBuildMethod =
  'buildAsync' | 'buildListAsync' | 'buildValidatedAsync' | 'buildValidatedListAsync' | 'describe';
/**
 * Retarget fluent methods, including generated methods, after an async transition. `map()` is
 * typed on async builders and on `fluent()` builders, but not after a facade's
 * `transformAsync()`: map before the async transition.
 */
export type AsyncFacade<T> = {
  [
    K in Exclude<keyof T, 'build' | 'buildList' | 'buildValidated' | 'buildValidatedList' | 'map'>
  ]: K extends AsyncBuildMethod
    ? T[K]
    : T[K] extends (...args: infer A) => infer R
      ? (...args: A) => R extends T ? AsyncFacade<T> : R
      : T[K];
};
/**
 * `Output` is what builds return (see `AsyncBuilder`). `Received` are the arguments callbacks
 * receive.
 */
export interface AsyncBuilderFacade<
  T,
  Args extends unknown[] = [],
  Output = T,
  Received extends unknown[] = Args,
> {
  with(patch: BuilderPatch<T>): this;
  replace(value: T): this;
  withFactory(factory: (...args: Received) => BuilderPatch<T>): this;
  replaceFactory(factory: (...args: Received) => T): this;
  omit(...keys: OptionalKeys<T>[]): this;
  transform(transformer: BuilderTransform<Output, Received>): this;
  transformAsync(
    transformer: (value: Output, ...args: Received) => Output | PromiseLike<Output>
  ): AsyncFacade<this>;
  buildAsync(...args: Args): Promise<Output>;
  buildListAsync<N extends number>(count: N, ...args: Args): Promise<BuiltList<Output, N>>;
  describe(): BuilderDescription;
}
export interface BuilderFacade<
  T,
  Args extends unknown[] = [],
  Output = T,
  Received extends unknown[] = Args,
> extends AsyncBuilderFacade<T, Args, Output, Received> {
  /**
   * A transform whose result may have another type. The runtime keeps every method of the
   * facade, such as a generated class's setters; this type is the plain facade. `fluent()`
   * builders keep their setters in the type too.
   */
  map<Next>(
    mapper: (value: Output, ...args: Received) => Next
  ): BuilderFacade<T, Args, Next, Received>;
  build(...args: Args): Output;
  buildList<N extends number>(count: N, ...args: Args): BuiltList<Output, N>;
}
export interface AsyncSchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncBuilderFacade<I, Args, I, Received> {
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
/** What a builder patches: the parameter of `replace()`, which `map()` does not change. */
type PatchedBy<B> = B extends { replace(value: infer T): unknown } ? T : never;
/** What its callbacks receive: the factory parameters of `withFactory()`. */
type ReceivedBy<B> = B extends { withFactory(factory: (...args: infer R) => never): unknown }
  ? R
  : never;
type Override<Inferred, Out> = [Out] extends [never] ? Inferred : Out;
/**
 * The facade of a builder, read from its members, so a builder, a facade and a `fluent()`
 * builder all qualify. `Out` replaces what builds return (for `fluent()` after `map()`).
 */
export type FacadeFor<B, Out = never> = B extends {
  buildValidated(...args: infer A): infer O;
}
  ? SchemaBuilderFacade<PatchedBy<B>, O, A, ReceivedBy<B>>
  : B extends { buildValidatedAsync(...args: infer A): Promise<infer O> }
    ? AsyncSchemaBuilderFacade<PatchedBy<B>, O, A, ReceivedBy<B>>
    : B extends { build(...args: infer A): infer O }
      ? BuilderFacade<PatchedBy<B>, A, Override<O, Out>, ReceivedBy<B>>
      : B extends { buildAsync(...args: infer A): Promise<infer O> }
        ? AsyncBuilderFacade<PatchedBy<B>, A, Override<O, Out>, ReceivedBy<B>>
        : never;
type InputOf<B> = PatchedBy<B>;
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
