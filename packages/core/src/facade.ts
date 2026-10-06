import { facadeClass } from './facade-class.js';
import { initializeRuntime } from './runtime.js';
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
  DefaultSessionFor,
  OptionalKeys,
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';

/** Retarget fluent methods, including generated methods, after an async transition. */
export type AsyncFacade<T> = {
  [
    K in Exclude<
      keyof T,
      // PROTOTYPE: map() is typed on synchronous builders only.
      'build' | 'buildList' | 'buildValidated' | 'buildValidatedList' | 'map'
    >
  ]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R extends T ? AsyncFacade<T> : R
    : T[K];
};
/** PROTOTYPE (docs/proposals/class-instances.md): `Output` is what the builds return. */
export interface AsyncBuilderFacade<T, Args extends unknown[] = [], Output = T> {
  with(patch: BuilderPatch<T>): this;
  replace(value: T): this;
  withFactory(factory: (...args: Args) => BuilderPatch<T>): this;
  replaceFactory(factory: (...args: Args) => T): this;
  omit(...keys: OptionalKeys<T>[]): this;
  transform(transformer: BuilderTransform<Output, Args>): this;
  transformAsync(
    transformer: (value: Output, ...args: Args) => Output | PromiseLike<Output>
  ): AsyncFacade<this>;
  buildAsync(...args: Args): Promise<Output>;
  buildListAsync(count: number, ...args: Args): Promise<Output[]>;
  describe(): BuilderDescription;
}
export interface BuilderFacade<
  T,
  Args extends unknown[] = [],
  Output = T,
> extends AsyncBuilderFacade<T, Args, Output> {
  /**
   * PROTOTYPE: the runtime keeps every named method of the facade after map(), but its type
   * is the plain facade. Map before fluent(), for example with createInstanceBuilder().
   */
  map<Next>(mapper: (value: Output, ...args: Args) => Next): BuilderFacade<T, Args, Next>;
  build(...args: Args): Output;
  buildList(count: number, ...args: Args): Output[];
}
export interface AsyncSchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
> extends AsyncBuilderFacade<I, Args> {
  usingValidation(options: StandardSchemaV1.Options): this;
  buildValidatedAsync(...args: Args): Promise<O>;
  buildValidatedListAsync(count: number, ...args: Args): Promise<O[]>;
}
export interface SchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
> extends AsyncSchemaBuilderFacade<I, O, Args> {
  build(...args: Args): I;
  buildList(count: number, ...args: Args): I[];
  buildValidated(...args: Args): O;
  buildValidatedList(count: number, ...args: Args): O[];
}
export type FacadeFor<B> =
  B extends SchemaBuilder<infer I, infer O, infer A>
    ? SchemaBuilderFacade<I, O, A>
    : B extends AsyncSchemaBuilder<infer I, infer O, infer A>
      ? AsyncSchemaBuilderFacade<I, O, A>
      : B extends Builder<infer T, infer A, infer O>
        ? BuilderFacade<T, A, O>
        : B extends AsyncBuilder<infer T, infer A, infer O>
          ? AsyncBuilderFacade<T, A, O>
          : never;
/** The input a builder patches: the parameter of replace(), which map() does not change. */
type InputOf<B> = B extends { replace(value: infer T): unknown }
  ? T
  : B extends { buildAsync(...args: never[]): Promise<infer T> }
    ? T
    : never;
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

export function createBuilderClass<F extends AnyFactory>(
  factory: F,
  config?: BuilderConfig & DefaultSessionFor<F>
): BuilderConstructor<BuilderFor<F>> {
  return builderClass(() => initializeRuntime(factory, config)) as unknown as BuilderConstructor<
    BuilderFor<F>
  >;
}
export function createSchemaBuilderClass<
  S extends StandardSchemaV1,
  F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config?: SchemaBuilderConfig & DefaultSessionFor<F>
): BuilderConstructor<SchemaBuilderFor<S, F>> {
  if (schema === undefined) {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }
  return builderClass(() =>
    initializeRuntime(factory, config, schema)
  ) as unknown as BuilderConstructor<SchemaBuilderFor<S, F>>;
}
