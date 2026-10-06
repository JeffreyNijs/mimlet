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
  /**
   * Names the builder, as reported by `describe()`. A builder with a default session draws
   * its session-less builds from `defaultSession().scope('builder', name)`, so two builders
   * with different names produce different values even for identical schemas. A session
   * passed to a build is used unchanged. A nonempty string of at most 1024 characters.
   */
  readonly name?: string;
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
/**
 * A configured default session, for a factory whose first parameter takes a session and whose
 * other parameters are optional. The first parameter may be required: the factory and every
 * patch factory or transform always receive a session, and builds may omit it.
 */
export type DefaultedSessionFor<F extends AnyFactory> =
  Parameters<F> extends []
    ? never
    : Parameters<F> extends [unknown?, ...infer Rest]
      ? [] extends Rest
        ? [GenerationSession] extends [Parameters<F>[0]]
          ? { readonly defaultSession: () => GenerationSession }
          : never
        : never
      : never;
/** Build arguments when a default session fills an omitted leading session. */
export type OptionalSessionArgs<Args extends unknown[]> = Args extends [unknown?, ...infer Rest]
  ? [session?: GenerationSession, ...Rest]
  : Args;
/** What the factory, patch factories and transforms then receive: always a session. */
export type SessionArgs<Args extends unknown[]> = Args extends [unknown?, ...infer Rest]
  ? [session: GenerationSession, ...Rest]
  : Args;
type TupleOf<T, N extends number, Items extends T[]> = Items['length'] extends N
  ? Items
  : Items['length'] extends 64
    ? T[]
    : TupleOf<T, N, [...Items, T]>;
/**
 * The result of a list build: a tuple for a literal count up to 64, so `const [a, b] =
 * builder.buildList(2)` types both items under `noUncheckedIndexedAccess`; an array otherwise.
 */
export type BuiltList<T, N extends number> = number extends N
  ? T[]
  : N extends number
    ? TupleOf<T, N, []>
    : never;
export interface BuilderDescription {
  readonly cloneInput: boolean;
  readonly maxListSize: number;
  readonly operations: ReadonlyArray<string>;
  readonly validation: boolean;
  /** Present when the builder was configured with a name. */
  readonly name?: string;
}

/**
 * `Args` are the build arguments. `Received` are the arguments the factory, patch factories
 * and transforms receive; they differ only when a default session fills an omitted session.
 */
export interface AsyncBuilder<T, Args extends unknown[] = [], Received extends unknown[] = Args> {
  with(patch: BuilderPatch<T>): AsyncBuilder<T, Args, Received>;
  replace(value: T): AsyncBuilder<T, Args, Received>;
  withFactory(factory: (...args: Received) => BuilderPatch<T>): AsyncBuilder<T, Args, Received>;
  replaceFactory(factory: (...args: Received) => T): AsyncBuilder<T, Args, Received>;
  omit(...keys: OptionalKeys<T>[]): AsyncBuilder<T, Args, Received>;
  transform(transformer: BuilderTransform<T, Received>): AsyncBuilder<T, Args, Received>;
  transformAsync(
    transformer: (value: T, ...args: Received) => T | PromiseLike<T>
  ): AsyncBuilder<T, Args, Received>;
  buildAsync(...args: Args): Promise<T>;
  buildListAsync<N extends number>(count: N, ...args: Args): Promise<BuiltList<T, N>>;
  describe(): BuilderDescription;
}
export interface Builder<
  T,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncBuilder<T, Args, Received> {
  with(patch: BuilderPatch<T>): Builder<T, Args, Received>;
  replace(value: T): Builder<T, Args, Received>;
  withFactory(factory: (...args: Received) => BuilderPatch<T>): Builder<T, Args, Received>;
  replaceFactory(factory: (...args: Received) => T): Builder<T, Args, Received>;
  omit(...keys: OptionalKeys<T>[]): Builder<T, Args, Received>;
  transform(transformer: BuilderTransform<T, Received>): Builder<T, Args, Received>;
  build(...args: Args): T;
  buildList<N extends number>(count: N, ...args: Args): BuiltList<T, N>;
}
export interface AsyncSchemaBuilder<
  Input,
  Output,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncBuilder<Input, Args, Received> {
  with(patch: BuilderPatch<Input>): AsyncSchemaBuilder<Input, Output, Args, Received>;
  replace(value: Input): AsyncSchemaBuilder<Input, Output, Args, Received>;
  withFactory(
    factory: (...args: Received) => BuilderPatch<Input>
  ): AsyncSchemaBuilder<Input, Output, Args, Received>;
  replaceFactory(
    factory: (...args: Received) => Input
  ): AsyncSchemaBuilder<Input, Output, Args, Received>;
  omit(...keys: OptionalKeys<Input>[]): AsyncSchemaBuilder<Input, Output, Args, Received>;
  transform(
    transformer: BuilderTransform<Input, Received>
  ): AsyncSchemaBuilder<Input, Output, Args, Received>;
  transformAsync(
    transformer: (value: Input, ...args: Received) => Input | PromiseLike<Input>
  ): AsyncSchemaBuilder<Input, Output, Args, Received>;
  usingValidation(
    options: StandardSchemaV1.Options
  ): AsyncSchemaBuilder<Input, Output, Args, Received>;
  buildValidatedAsync(...args: Args): Promise<Output>;
  buildValidatedListAsync<N extends number>(count: N, ...args: Args): Promise<BuiltList<Output, N>>;
}
export interface SchemaBuilder<
  Input,
  Output,
  Args extends unknown[] = [],
  Received extends unknown[] = Args,
> extends AsyncSchemaBuilder<Input, Output, Args, Received> {
  with(patch: BuilderPatch<Input>): SchemaBuilder<Input, Output, Args, Received>;
  replace(value: Input): SchemaBuilder<Input, Output, Args, Received>;
  withFactory(
    factory: (...args: Received) => BuilderPatch<Input>
  ): SchemaBuilder<Input, Output, Args, Received>;
  replaceFactory(
    factory: (...args: Received) => Input
  ): SchemaBuilder<Input, Output, Args, Received>;
  omit(...keys: OptionalKeys<Input>[]): SchemaBuilder<Input, Output, Args, Received>;
  transform(
    transformer: BuilderTransform<Input, Received>
  ): SchemaBuilder<Input, Output, Args, Received>;
  usingValidation(options: StandardSchemaV1.Options): SchemaBuilder<Input, Output, Args, Received>;
  build(...args: Args): Input;
  buildList<N extends number>(count: N, ...args: Args): BuiltList<Input, N>;
  buildValidated(...args: Args): Output;
  buildValidatedList<N extends number>(count: N, ...args: Args): BuiltList<Output, N>;
}
/**
 * The builder for factory `F`. With `Defaulted` (a configured default session), builds may
 * omit the leading session and the factory and callbacks always receive one.
 */
export type BuilderFor<
  F extends AnyFactory,
  Defaulted extends boolean = false,
> = Defaulted extends true
  ? IsAsync<F> extends true
    ? AsyncBuilder<
        Awaited<ReturnType<F>>,
        OptionalSessionArgs<Parameters<F>>,
        SessionArgs<Parameters<F>>
      >
    : Builder<ReturnType<F>, OptionalSessionArgs<Parameters<F>>, SessionArgs<Parameters<F>>>
  : IsAsync<F> extends true
    ? AsyncBuilder<Awaited<ReturnType<F>>, Parameters<F>>
    : Builder<ReturnType<F>, Parameters<F>>;
export type SchemaBuilderFor<
  S extends StandardSchemaV1,
  F extends AnyFactory,
  Defaulted extends boolean = false,
> = Defaulted extends true
  ? IsAsync<F> extends true
    ? AsyncSchemaBuilder<
        SchemaInput<S>,
        SchemaOutput<S>,
        OptionalSessionArgs<Parameters<F>>,
        SessionArgs<Parameters<F>>
      >
    : SchemaBuilder<
        SchemaInput<S>,
        SchemaOutput<S>,
        OptionalSessionArgs<Parameters<F>>,
        SessionArgs<Parameters<F>>
      >
  : IsAsync<F> extends true
    ? AsyncSchemaBuilder<SchemaInput<S>, SchemaOutput<S>, Parameters<F>>
    : SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, Parameters<F>>;
