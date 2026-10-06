import type { GenerationSession } from './session.js';
import type { StandardSchemaV1 } from './standard-schema.js';

export type ValidationIssue = StandardSchemaV1.Issue;
export type ValidationResult<T> = StandardSchemaV1.Result<T>;
export type SchemaInput<S extends StandardSchemaV1> = StandardSchemaV1.InferInput<S>;
export type SchemaOutput<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>;
export type BuilderFactory<T, Args extends unknown[] = []> = (...args: Args) => T | PromiseLike<T>;
export type BuilderTransform<T, Args extends unknown[] = []> = (value: T, ...args: Args) => T;
export type AnyFactory = (...args: never[]) => unknown;
export type IsAsync<F extends AnyFactory> =
  unknown extends ReturnType<F>
    ? true
    : [Extract<ReturnType<F>, PromiseLike<unknown>>] extends [never]
      ? false
      : true;

type IsUnion<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;
type Atomic =
  | ReadonlyArray<unknown>
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | AnyFactory;
type SinglePatch<T> = T extends Atomic
  ? T
  : T extends object
    ? string extends keyof T
      ? T
      : number extends keyof T
        ? T
        : symbol extends keyof T
          ? T
          : Partial<T>
    : T;
/** Object unions (including nullable objects) require explicit whole-value replacement. */
export type BuilderPatch<T> =
  true extends IsUnion<T> ? ([Extract<T, object>] extends [never] ? T : never) : SinglePatch<T>;
export type OptionalKeys<T> =
  true extends IsUnion<T>
    ? never
    : T extends Atomic
      ? never
      : {
          [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
        }[keyof T];

export interface BuilderConfig {
  /** Clone composed input before transforms/validation. The default preserves references. */
  readonly cloneInput?: <T>(value: T) => T;
  /** Allocation budget checked before invoking any factory. Default: 10,000. */
  readonly maxListSize?: number;
}
export interface SchemaBuilderConfig extends BuilderConfig {
  /** Kept separate from the factory's argument list. */
  readonly validationOptions?: StandardSchemaV1.Options;
}
export interface DefaultSessionConfig {
  /**
   * Creates the session passed when a build omits its leading session argument. Each
   * top-level build or list call creates one, so list items draw successive values.
   */
  readonly defaultSession?: () => GenerationSession;
}
/** Only factories whose first parameter is an optional session accept a default session. */
export type DefaultSessionFor<F extends AnyFactory> =
  Parameters<F> extends []
    ? { readonly defaultSession?: never }
    : [] extends Parameters<F>
      ? [GenerationSession] extends [Parameters<F>[0]]
        ? DefaultSessionConfig
        : { readonly defaultSession?: never }
      : { readonly defaultSession?: never };
export interface BuilderDescription {
  readonly cloneInput: boolean;
  readonly maxListSize: number;
  readonly operations: ReadonlyArray<string>;
  readonly validation: boolean;
}

/**
 * PROTOTYPE (docs/proposals/class-instances.md): `Output` is what `build()` returns. It equals
 * the patched input `T` unless `map()` (or `createInstanceBuilder()`) changed it.
 * Patches always apply to `T`; transforms run in the order they were added and see the value
 * as it is at that point, so a transform added after `map()` receives the mapped value.
 */
export interface AsyncBuilder<T, Args extends unknown[] = [], Output = T> {
  with(patch: BuilderPatch<T>): AsyncBuilder<T, Args, Output>;
  replace(value: T): AsyncBuilder<T, Args, Output>;
  withFactory(factory: (...args: Args) => BuilderPatch<T>): AsyncBuilder<T, Args, Output>;
  replaceFactory(factory: (...args: Args) => T): AsyncBuilder<T, Args, Output>;
  omit(...keys: OptionalKeys<T>[]): AsyncBuilder<T, Args, Output>;
  transform(transformer: BuilderTransform<Output, Args>): AsyncBuilder<T, Args, Output>;
  transformAsync(
    transformer: (value: Output, ...args: Args) => Output | PromiseLike<Output>
  ): AsyncBuilder<T, Args, Output>;
  buildAsync(...args: Args): Promise<Output>;
  buildListAsync(count: number, ...args: Args): Promise<Array<Output>>;
  describe(): BuilderDescription;
}
export interface Builder<T, Args extends unknown[] = [], Output = T> extends AsyncBuilder<
  T,
  Args,
  Output
> {
  with(patch: BuilderPatch<T>): Builder<T, Args, Output>;
  replace(value: T): Builder<T, Args, Output>;
  withFactory(factory: (...args: Args) => BuilderPatch<T>): Builder<T, Args, Output>;
  replaceFactory(factory: (...args: Args) => T): Builder<T, Args, Output>;
  omit(...keys: OptionalKeys<T>[]): Builder<T, Args, Output>;
  transform(transformer: BuilderTransform<Output, Args>): Builder<T, Args, Output>;
  /**
   * PROTOTYPE: a transform that may change the built type. Patches keep their input type.
   * Typed on synchronous builders only for now; schema builders reject it at runtime.
   */
  map<Next>(mapper: (value: Output, ...args: Args) => Next): Builder<T, Args, Next>;
  build(...args: Args): Output;
  buildList(count: number, ...args: Args): Array<Output>;
}
export interface AsyncSchemaBuilder<
  Input,
  Output,
  Args extends unknown[] = [],
> extends AsyncBuilder<Input, Args> {
  with(patch: BuilderPatch<Input>): AsyncSchemaBuilder<Input, Output, Args>;
  replace(value: Input): AsyncSchemaBuilder<Input, Output, Args>;
  withFactory(
    factory: (...args: Args) => BuilderPatch<Input>
  ): AsyncSchemaBuilder<Input, Output, Args>;
  replaceFactory(factory: (...args: Args) => Input): AsyncSchemaBuilder<Input, Output, Args>;
  omit(...keys: OptionalKeys<Input>[]): AsyncSchemaBuilder<Input, Output, Args>;
  transform(transformer: BuilderTransform<Input, Args>): AsyncSchemaBuilder<Input, Output, Args>;
  transformAsync(
    transformer: (value: Input, ...args: Args) => Input | PromiseLike<Input>
  ): AsyncSchemaBuilder<Input, Output, Args>;
  usingValidation(options: StandardSchemaV1.Options): AsyncSchemaBuilder<Input, Output, Args>;
  buildValidatedAsync(...args: Args): Promise<Output>;
  buildValidatedListAsync(count: number, ...args: Args): Promise<Array<Output>>;
}
export interface SchemaBuilder<
  Input,
  Output,
  Args extends unknown[] = [],
> extends AsyncSchemaBuilder<Input, Output, Args> {
  with(patch: BuilderPatch<Input>): SchemaBuilder<Input, Output, Args>;
  replace(value: Input): SchemaBuilder<Input, Output, Args>;
  withFactory(factory: (...args: Args) => BuilderPatch<Input>): SchemaBuilder<Input, Output, Args>;
  replaceFactory(factory: (...args: Args) => Input): SchemaBuilder<Input, Output, Args>;
  omit(...keys: OptionalKeys<Input>[]): SchemaBuilder<Input, Output, Args>;
  transform(transformer: BuilderTransform<Input, Args>): SchemaBuilder<Input, Output, Args>;
  usingValidation(options: StandardSchemaV1.Options): SchemaBuilder<Input, Output, Args>;
  build(...args: Args): Input;
  buildList(count: number, ...args: Args): Array<Input>;
  buildValidated(...args: Args): Output;
  buildValidatedList(count: number, ...args: Args): Array<Output>;
}
export type BuilderFor<F extends AnyFactory> =
  IsAsync<F> extends true
    ? AsyncBuilder<Awaited<ReturnType<F>>, Parameters<F>>
    : Builder<ReturnType<F>, Parameters<F>>;
/** PROTOTYPE: builders that end in a class instance, see docs/proposals/class-instances.md. */
export type IntoBuilderFor<F extends AnyFactory, Input, Output> =
  IsAsync<F> extends true
    ? AsyncBuilder<Input, Parameters<F>, Output>
    : Builder<Input, Parameters<F>, Output>;
export type SchemaBuilderFor<S extends StandardSchemaV1, F extends AnyFactory> =
  IsAsync<F> extends true
    ? AsyncSchemaBuilder<SchemaInput<S>, SchemaOutput<S>, Parameters<F>>
    : SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, Parameters<F>>;
