import * as defaultTransformer from 'class-transformer';
import * as defaultValidator from 'class-validator';
import type { ClassTransformOptions } from 'class-transformer';
import type { ValidationError, ValidatorOptions } from 'class-validator';
import { createSchemaBuilder, schemaFields } from '@mimlet/core';
import type {
  AsyncSchemaBuilder,
  DefaultSessionFor,
  KnownFieldsConstraint,
  KnownNestedFieldsFactory,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaFields,
  StandardSchemaV1,
} from '@mimlet/core';

type AnyFunction = (...args: never[]) => unknown;
type Atomic =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | RegExp
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>;
/** Methods, and fields typed `never` (DTOs declare `sort?: never` to forbid a parameter). */
type PayloadKey<T, K extends keyof T> = T[K] extends AnyFunction
  ? never
  : [Exclude<T[K], undefined>] extends [never]
    ? never
    : K;

/**
 * The payload a client sends for a DTO class: its data fields, recursively for nested DTOs and
 * arrays, without methods and without fields typed `never`. `readonly` is removed; a readonly
 * field stays required. Dates stay `Date`: the default JSON wire sends them as ISO strings, as
 * a client would, and class-transformer turns them back into dates where the DTO says so.
 */
export type DtoInput<T> = T extends Atomic
  ? T
  : T extends ReadonlyArray<infer Item>
    ? Array<DtoInput<Item>>
    : T extends AnyFunction
      ? never
      : { -readonly [K in keyof T as PayloadKey<T, K>]: DtoInput<T[K]> };

/** A DTO class. class-transformer creates DTOs with `new Dto()`, without arguments. */
export type DtoClass<T extends object = object> = new (...args: never[]) => T;

/**
 * How a payload reaches the pipe: serialized, then parsed again, as a request would be. Any
 * object with `stringify` and `parse` works, such as `JSON` (a JSON body) or the `qs` module (a
 * query string parsed with `qs.parse`).
 */
export interface Wire {
  stringify(value: never): string | undefined;
  parse(text: string): unknown;
}

/** The class-validator functions the schema calls, as in ValidationPipe's `validatorPackage`. */
export interface ValidatorPackage {
  validate(
    object: object,
    options?: ValidatorOptions
  ): ValidationError[] | PromiseLike<ValidationError[]>;
  /** Required unless `async` is `true`. */
  validateSync?(object: object, options?: ValidatorOptions): ValidationError[];
}
/** The class-transformer functions the schema calls, as in ValidationPipe's `transformerPackage`. */
export interface TransformerPackage {
  plainToInstance(cls: DtoClass, plain: unknown, options?: ClassTransformOptions): unknown;
  /** ValidationPipe calls `classToPlain`; `instanceToPlain` is its current name. */
  classToPlain?(object: unknown, options?: ClassTransformOptions): unknown;
  instanceToPlain?(object: unknown, options?: ClassTransformOptions): unknown;
}

/**
 * NestJS `ValidationPipeOptions`, plus how the payload travels. Pass the options of the
 * application's global `ValidationPipe`, so tests validate the way the API does. The HTTP error
 * options (`exceptionFactory`, `errorHttpStatusCode`, `disableErrorMessages`) are accepted and
 * have no effect, because a failed build reports issues instead of an HTTP error.
 */
export interface ClassValidatorSchemaOptions extends ValidatorOptions {
  /**
   * `true` returns the DTO instance a controller receives, `false` the payload, as
   * ValidationPipe's option of the same name. **The default here is `true`**, unlike
   * ValidationPipe's `false`, because a unit test wants the instance.
   */
  readonly transform?: boolean;
  /** Passed to class-transformer's `plainToInstance`, for example `enableImplicitConversion`. */
  readonly transformOptions?: ClassTransformOptions;
  /**
   * How the payload reaches the pipe. Default `JSON`, a JSON body. Pass the `qs` module for a
   * query string parsed by `qs.parse`, or `false` to validate the built value as it is.
   */
  readonly wire?: Wire | false;
  /**
   * Validate with class-validator's async `validate()`, as ValidationPipe does, so async
   * constraints run; builds then need `buildValidatedAsync()`. Default `false`: `validateSync()`,
   * which skips async constraints.
   */
  readonly async?: boolean;
  /** The application's own class-validator, when the schema could load another copy. */
  readonly validatorPackage?: ValidatorPackage;
  /** The application's own class-transformer, when the schema could load another copy. */
  readonly transformerPackage?: TransformerPackage;
  /** Accepted for ValidationPipe compatibility; it has no effect here. */
  readonly exceptionFactory?: (errors: ValidationError[]) => unknown;
  /** Accepted for ValidationPipe compatibility; it has no effect here. */
  readonly errorHttpStatusCode?: number;
  /** Accepted for ValidationPipe compatibility; it has no effect here. */
  readonly disableErrorMessages?: boolean;
  /** Accepted for ValidationPipe compatibility; it has no effect here. */
  readonly validateCustomDecorators?: boolean;
  /** Accepted for ValidationPipe compatibility; the schema always validates its own class. */
  readonly expectedType?: unknown;
}
/** Options with `transform: false`: the validated output is the payload. */
export type UntransformedOptions = ClassValidatorSchemaOptions & { readonly transform: false };

/** Per-build validator options: `builder.usingValidation({ libraryOptions: { groups } })`. */
export type ClassValidatorLibraryOptions = ValidatorOptions;

/** A Standard Schema for the DTO `T`: payload input, `Output` (the DTO by default) output. */
export type ClassValidatorSchema<T extends object, Output = T> = StandardSchemaV1<
  DtoInput<T>,
  Output
>;

/** A factory that returns a DTO payload, with any arguments, sync or async. */
export type DtoFactory<T extends object> = (
  ...args: never[]
) => NoInfer<DtoInput<T>> | PromiseLike<NoInfer<DtoInput<T>>>;
/** What the factory type parameter's constraint accepts; see `KnownFieldsConstraint`. */
type DtoReturn<T> = NoInfer<KnownFieldsConstraint<DtoInput<T>>>;
/**
 * The constraint of the factory type parameter: a `DtoFactory`, or, when every payload field is
 * optional, a factory of a record with other keys, so that `KnownDtoFactory` names those keys
 * (`"sort is typed never in the class and cannot be set"`) instead of TypeScript rejecting the
 * factory with a message that names none.
 */
type CheckedDtoFactory<T> = (...args: never[]) => DtoReturn<T> | PromiseLike<DtoReturn<T>>;
/**
 * The check on a DTO factory without a return type annotation: a key that is not a payload
 * field, such as a misspelled field or a field typed `never`, is a compile error at any depth
 * of nested DTOs and arrays. TypeScript does not report excess keys of a returned object on
 * its own, and `build()` would send them.
 */
type KnownDtoFactory<F extends (...args: never[]) => unknown, T> = KnownNestedFieldsFactory<
  F,
  DtoInput<T>,
  T
>;

/**
 * The builder `fromClassValidator(Dto, factory, options)` returns for a factory of type `F`: the
 * factory's arguments, and synchronous build methods unless `F` returns a promise. Name it as a
 * generic helper's return type.
 */
export type ClassValidatorBuilder<
  T extends object,
  F extends CheckedDtoFactory<T>,
  Output = T,
> = SchemaBuilderFor<ClassValidatorSchema<T, Output>, F>;

/** The builder `fromClassValidatorAsync(Dto, factory, options)` returns. */
export type AsyncClassValidatorBuilder<
  T extends object,
  F extends CheckedDtoFactory<T>,
  Output = T,
> = AsyncSchemaBuilder<DtoInput<T>, Output, Parameters<F>>;

/** Builder options: the schema options plus `createSchemaBuilder`'s configuration. */
export type ClassValidatorBuilderOptions<F extends (...args: never[]) => unknown> = Omit<
  ClassValidatorSchemaOptions,
  'async'
> &
  SchemaBuilderConfig &
  DefaultSessionFor<F>;

const VENDOR = 'mimlet/class-validator';
/** The options ValidationPipe takes out before the rest goes to class-validator, and ours. */
const NOT_FOR_THE_VALIDATOR = new Set([
  'transform',
  'disableErrorMessages',
  'errorHttpStatusCode',
  'expectedType',
  'transformOptions',
  'validateCustomDecorators',
  'wire',
  'async',
]);
const BUILDER_OPTIONS = [
  'cloneInput',
  'maxListSize',
  'name',
  'validationOptions',
  'defaultSession',
];

/**
 * A Standard Schema for a class-validator DTO that validates the way NestJS's ValidationPipe
 * validates a request: the payload crosses the wire, an absent payload becomes `{}`,
 * `__proto__`, `prototype` and `constructor` keys are dropped, class-transformer creates the DTO
 * with `transformOptions`, and class-validator checks it with the remaining options
 * (`forbidUnknownValues` defaults to `false`, as in the pipe). The output is the DTO instance,
 * or the payload with `transform: false`. Each failed constraint is one issue whose path points
 * into the payload, with array indexes as numbers.
 */
export function classValidatorSchema<T extends object>(
  dto: DtoClass<T>,
  options: UntransformedOptions
): ClassValidatorSchema<T, DtoInput<T>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function classValidatorSchema<T extends object>(
  dto: DtoClass<T>,
  options?: ClassValidatorSchemaOptions
): ClassValidatorSchema<T>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function classValidatorSchema(
  dto: DtoClass,
  options: ClassValidatorSchemaOptions = {}
): StandardSchemaV1 {
  if (typeof dto !== 'function' || typeof dto.prototype !== 'object') {
    throw new TypeError('classValidatorSchema() requires a DTO class');
  }
  const wire = options.wire ?? JSON;
  if (
    wire !== false &&
    (typeof wire !== 'object' ||
      wire === null ||
      typeof wire.stringify !== 'function' ||
      typeof wire.parse !== 'function')
  ) {
    throw new TypeError('wire must be false or an object with stringify() and parse()');
  }
  const validator = options.validatorPackage ?? (defaultValidator as ValidatorPackage);
  const transformer = options.transformerPackage ?? (defaultTransformer as TransformerPackage);
  const asynchronous = options.async === true;
  if (!asynchronous && typeof validator.validateSync !== 'function') {
    throw new TypeError('validatorPackage needs validateSync() unless async is true');
  }
  const transform = options.transform ?? true;
  const transformOptions = options.transformOptions;
  // ValidationPipe passes every other option on to class-validator, with its own default.
  const configured: ValidatorOptions = { forbidUnknownValues: false };
  for (const [key, value] of Object.entries(options)) {
    if (!NOT_FOR_THE_VALIDATOR.has(key)) {
      Object.assign(configured, { [key]: value });
    }
  }
  const finish = (
    errors: readonly ValidationError[],
    entity: unknown,
    value: unknown,
    received: unknown,
    nil: boolean,
    validatorOptions: ValidatorOptions
  ): StandardSchemaV1.Result<unknown> => {
    if (errors.length > 0) {
      return { issues: issuesOf(errors) };
    }
    if (transform) {
      return { value: entity };
    }
    if (nil) {
      return { value: received };
    }
    // As the pipe: with more validator options than its default one, return classToPlain().
    if (Object.keys(validatorOptions).length > 1) {
      const toPlain = transformer.classToPlain ?? transformer.instanceToPlain;
      if (typeof toPlain !== 'function') {
        throw new TypeError('transformerPackage needs classToPlain() or instanceToPlain()');
      }
      return { value: Reflect.apply(toPlain, transformer, [entity, transformOptions]) };
    }
    return { value };
  };
  return {
    '~standard': {
      version: 1,
      vendor: VENDOR,
      validate(input, standardOptions) {
        const validatorOptions: ValidatorOptions = {
          ...configured,
          ...(standardOptions?.libraryOptions as ClassValidatorLibraryOptions | undefined),
        };
        const received = wire === false ? input : overTheWire(wire, input);
        // The pipe's steps, in its order: an absent payload becomes {} for a class.
        const nil = received === undefined || received === null;
        const value: unknown = nil ? {} : received;
        const primitive = ['number', 'boolean', 'string'].includes(typeof value);
        if (wire !== false) {
          // Only on the copy the wire made: the built value is never changed.
          stripProtoKeys(value);
        }
        const created = transformer.plainToInstance(dto, value, transformOptions);
        let entity: unknown = created;
        const constructor = (created as { constructor?: unknown } | null | undefined)?.constructor;
        if (constructor !== dto && !primitive && created !== null && created !== undefined) {
          Object.assign(created, { constructor: dto });
        } else if (constructor !== dto) {
          entity = { constructor: dto };
        }
        const target = entity as object;
        const output = primitive ? created : entity;
        if (asynchronous) {
          return Promise.resolve(validator.validate(target, validatorOptions)).then((errors) =>
            finish(errors, output, value, received, nil, validatorOptions)
          );
        }
        const errors = (validator.validateSync as NonNullable<ValidatorPackage['validateSync']>)(
          target,
          validatorOptions
        );
        return finish(errors, output, value, received, nil, validatorOptions);
      },
    },
  };
}

function overTheWire(wire: Wire, value: unknown): unknown {
  const text = wire.stringify(value as never);
  return text === undefined ? undefined : wire.parse(text);
}

const BUILT_IN = [Date, RegExp, Error, Map, Set, WeakMap, WeakSet];
/** ValidationPipe deletes these keys, recursively, before class-transformer sees the payload. */
function stripProtoKeys(value: unknown, depth = 0): void {
  if (
    depth > 256 ||
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    BUILT_IN.some((type) => value instanceof type)
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      stripProtoKeys(item, depth + 1);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    if (Object.hasOwn(record, key)) {
      delete record[key];
    }
  }
  for (const key of Object.keys(record)) {
    stripProtoKeys(record[key], depth + 1);
  }
}

/** class-validator's error tree as Standard Schema issues, one per failed constraint. */
function issuesOf(
  errors: readonly ValidationError[],
  path: readonly PropertyKey[] = [],
  parent?: unknown,
  depth = 0
): StandardSchemaV1.Issue[] {
  if (depth > 256) {
    return [{ message: 'Validation errors are nested too deeply', path: [...path] }];
  }
  const issues: StandardSchemaV1.Issue[] = [];
  for (const error of errors) {
    const property: unknown = error.property;
    const at =
      typeof property !== 'string' || property === ''
        ? path
        : [...path, Array.isArray(parent) && /^\d+$/.test(property) ? Number(property) : property];
    for (const message of Object.values(error.constraints ?? {})) {
      issues.push({ message, path: at });
    }
    issues.push(...issuesOf(error.children ?? [], at, error.value, depth + 1));
  }
  // An error without constraints or children still rejects the value.
  return issues.length > 0 || errors.length === 0
    ? issues
    : [{ message: 'class-validator rejected the value', path: [...path] }];
}

function split<F extends (...args: never[]) => unknown>(
  options: ClassValidatorBuilderOptions<F> | undefined
): [ClassValidatorSchemaOptions, SchemaBuilderConfig] {
  const schema: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    (BUILDER_OPTIONS.includes(key) ? builder : schema)[key] = value;
  }
  return [schema, builder];
}

/**
 * A builder for a DTO: `build()` returns the payload a client sends, `buildValidated()` what
 * ValidationPipe passes to the controller (the DTO instance by default). The factory's return
 * type comes from the class, so it needs no annotation; a key that is not a payload field,
 * such as a misspelled field or a field typed `never`, is a compile error, in nested DTOs too.
 * Validation is synchronous (`validateSync()`, which skips async constraints); see
 * `fromClassValidatorAsync()`.
 */
export function fromClassValidator<T extends object, F extends CheckedDtoFactory<T>>(
  dto: DtoClass<T>,
  factory: F & KnownDtoFactory<F, T>,
  options: ClassValidatorBuilderOptions<F> & { readonly transform: false }
): ClassValidatorBuilder<T, F, DtoInput<T>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromClassValidator<T extends object, F extends CheckedDtoFactory<T>>(
  dto: DtoClass<T>,
  factory: F & KnownDtoFactory<F, T>,
  options?: ClassValidatorBuilderOptions<F>
): ClassValidatorBuilder<T, F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromClassValidator<T extends object, F extends CheckedDtoFactory<T>>(
  dto: DtoClass<T>,
  factory: F,
  options?: ClassValidatorBuilderOptions<F>
): unknown {
  const [schema, builder] = split(options);
  if (schema.async === true) {
    throw new TypeError('Use fromClassValidatorAsync() for async validation');
  }
  return createSchemaBuilder(classValidatorSchema(dto, schema), factory, builder);
}

/**
 * The async form of `fromClassValidator()`: class-validator's `validate()` runs, as in
 * ValidationPipe, so async constraints (such as a uniqueness check) apply. Only the async
 * build methods are available. The factory is checked as in `fromClassValidator()`.
 */
export function fromClassValidatorAsync<T extends object, F extends CheckedDtoFactory<T>>(
  dto: DtoClass<T>,
  factory: F & KnownDtoFactory<F, T>,
  options: ClassValidatorBuilderOptions<F> & { readonly transform: false }
): AsyncClassValidatorBuilder<T, F, DtoInput<T>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromClassValidatorAsync<T extends object, F extends CheckedDtoFactory<T>>(
  dto: DtoClass<T>,
  factory: F & KnownDtoFactory<F, T>,
  options?: ClassValidatorBuilderOptions<F>
): AsyncClassValidatorBuilder<T, F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromClassValidatorAsync<T extends object, F extends CheckedDtoFactory<T>>(
  dto: DtoClass<T>,
  factory: F,
  options?: ClassValidatorBuilderOptions<F>
): unknown {
  const [schema, builder] = split(options);
  return createSchemaBuilder(
    classValidatorSchema(dto, { ...schema, async: true }),
    async (...args: never[]) => factory(...args),
    builder
  );
}

/** Fields a DTO types as `never` (or only `undefined`): no payload can set them. */
type NeverFields<T> = {
  [K in keyof T]-?: [Exclude<T[K], undefined>] extends [never] ? K : never;
}[keyof T];
/** The names `classValidatorFields(Dto, { exclude })` can return. */
export type ClassValidatorFieldNames<T, Excluded extends string = never> = Exclude<
  Extract<keyof DtoInput<T> | NeverFields<T>, string>,
  Excluded
>;
/** Options of `classValidatorFields()`. */
export interface ClassValidatorFieldsOptions<E extends string = string> {
  /**
   * Fields to leave out of the list. Name the fields the DTO types as `never`: class-validator
   * metadata cannot tell them from other fields, so the list holds them until they are named.
   */
  readonly exclude?: readonly E[];
}

function dtoName(dto: DtoClass): string {
  return typeof dto.name === 'string' && dto.name ? dto.name : 'the DTO';
}

/**
 * **Experimental.** The fields of a DTO, for a setter per field:
 * `fluent(fromClassValidator(Dto, factory), classValidatorFields(Dto))`. The list holds every
 * property with a class-validator decorator, inherited ones included, and the data fields that
 * `new Dto()` defines, without the names in `exclude`. Its type holds the payload fields and
 * the fields typed `never` that `exclude` does not name, because the runtime cannot see
 * TypeScript types: exclude those fields so the list matches the payload. `fluent()` gives a
 * field typed `never` no typed setter either way. A DTO without decorators and without
 * emitted fields throws, instead of returning an empty list that its type would not describe.
 */
export function classValidatorFields<
  T extends object,
  const E extends Extract<keyof T, string> = never,
>(
  dto: DtoClass<T>,
  options?: ClassValidatorFieldsOptions<E>
): SchemaFields<ClassValidatorFieldNames<T, E>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function classValidatorFields(
  dto: DtoClass,
  options: ClassValidatorFieldsOptions = {}
): unknown {
  if (typeof dto !== 'function' || typeof dto.prototype !== 'object') {
    throw new TypeError('classValidatorFields() requires a DTO class');
  }
  const exclude: unknown = options.exclude ?? [];
  if (!Array.isArray(exclude) || exclude.some((name) => typeof name !== 'string')) {
    throw new TypeError('exclude must be an array of field names');
  }
  const names = new Set<string>();
  for (const metadata of defaultValidator
    .getMetadataStorage()
    .getTargetValidationMetadatas(dto, '', true, false)) {
    names.add(metadata.propertyName);
  }
  let instance: object;
  try {
    instance = Reflect.construct(dto, []) as object;
  } catch (cause) {
    throw new TypeError(
      'classValidatorFields() creates the DTO without arguments, as class-transformer does',
      { cause }
    );
  }
  for (const name of Object.keys(instance)) {
    // A function is not payload data, as in DtoInput; accessors are not called.
    const field = Object.getOwnPropertyDescriptor(instance, name);
    if (!(field && 'value' in field && typeof field.value === 'function')) {
      names.add(name);
    }
  }
  const name = dtoName(dto);
  if (names.size === 0) {
    throw new TypeError(
      `classValidatorFields(${name}) found no fields: the class has no class-validator decorators and new ${name}() defines no fields (field declarations are not emitted when useDefineForClassFields is off). List the fields in fluent() instead`
    );
  }
  for (const excluded of exclude as string[]) {
    names.delete(excluded);
  }
  if (names.size === 0) {
    throw new TypeError(`classValidatorFields(${name}) excludes every field it found`);
  }
  return schemaFields([...names]);
}

/**
 * Options bound once with `withClassValidatorDefaults()`: the pipe's options, `wire`, the
 * package copies and the builder options every builder shares. `async` follows from the
 * function called; `name` and `defaultSession` belong to one builder and stay per call.
 */
export type ClassValidatorDefaults = Omit<ClassValidatorSchemaOptions, 'async'> &
  Omit<SchemaBuilderConfig, 'name'>;
/** What `buildValidated()` returns under the defaults `D`: the payload with `transform: false`. */
type DefaultOutput<D, T extends object> = D extends { readonly transform: false } ? DtoInput<T> : T;

/**
 * `fromClassValidator()`, `fromClassValidatorAsync()` and `classValidatorSchema()` with the
 * defaults `D` applied first. Per-call options override the defaults key by key. The builders
 * have the same types as the unbound functions return, so `ClassValidatorBuilder<T, F>` still
 * names them.
 */
export interface ClassValidatorWithDefaults<D extends ClassValidatorDefaults> {
  /** The bound defaults, frozen; spread them to derive other defaults. */
  readonly defaults: Readonly<D>;
  fromClassValidator<T extends object, F extends CheckedDtoFactory<T>>(
    dto: DtoClass<T>,
    factory: F & KnownDtoFactory<F, T>,
    options: ClassValidatorBuilderOptions<F> & { readonly transform: false }
  ): ClassValidatorBuilder<T, F, DtoInput<T>>;
  fromClassValidator<T extends object, F extends CheckedDtoFactory<T>>(
    dto: DtoClass<T>,
    factory: F & KnownDtoFactory<F, T>,
    options: ClassValidatorBuilderOptions<F> & { readonly transform: true }
  ): ClassValidatorBuilder<T, F>;
  fromClassValidator<T extends object, F extends CheckedDtoFactory<T>>(
    dto: DtoClass<T>,
    factory: F & KnownDtoFactory<F, T>,
    options?: ClassValidatorBuilderOptions<F>
  ): ClassValidatorBuilder<T, F, DefaultOutput<D, T>>;
  fromClassValidatorAsync<T extends object, F extends CheckedDtoFactory<T>>(
    dto: DtoClass<T>,
    factory: F & KnownDtoFactory<F, T>,
    options: ClassValidatorBuilderOptions<F> & { readonly transform: false }
  ): AsyncClassValidatorBuilder<T, F, DtoInput<T>>;
  fromClassValidatorAsync<T extends object, F extends CheckedDtoFactory<T>>(
    dto: DtoClass<T>,
    factory: F & KnownDtoFactory<F, T>,
    options: ClassValidatorBuilderOptions<F> & { readonly transform: true }
  ): AsyncClassValidatorBuilder<T, F>;
  fromClassValidatorAsync<T extends object, F extends CheckedDtoFactory<T>>(
    dto: DtoClass<T>,
    factory: F & KnownDtoFactory<F, T>,
    options?: ClassValidatorBuilderOptions<F>
  ): AsyncClassValidatorBuilder<T, F, DefaultOutput<D, T>>;
  classValidatorSchema<T extends object>(
    dto: DtoClass<T>,
    options: UntransformedOptions
  ): ClassValidatorSchema<T, DtoInput<T>>;
  classValidatorSchema<T extends object>(
    dto: DtoClass<T>,
    options: ClassValidatorSchemaOptions & { readonly transform: true }
  ): ClassValidatorSchema<T>;
  classValidatorSchema<T extends object>(
    dto: DtoClass<T>,
    options?: ClassValidatorSchemaOptions
  ): ClassValidatorSchema<T, DefaultOutput<D, T>>;
}

const PER_BUILDER = ['async', 'name', 'defaultSession'];

/**
 * Bind options once, such as the application's ValidationPipe options, or those plus
 * `wire: qs` for query DTOs: `const query = withClassValidatorDefaults({ ...validationPipeOptions,
 * wire: qs })`, then `query.fromClassValidator(ViewOrdersQuery, () => ({}))`. The returned
 * functions take the same arguments as the unbound ones and do not depend on `this`.
 */
export function withClassValidatorDefaults<const D extends ClassValidatorDefaults>(
  defaults: D
): ClassValidatorWithDefaults<D> {
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
    throw new TypeError('withClassValidatorDefaults() requires an options object');
  }
  for (const key of PER_BUILDER) {
    if (Object.hasOwn(defaults, key)) {
      throw new TypeError(
        `${key} is not a default: pass it to fromClassValidator() or fromClassValidatorAsync()`
      );
    }
  }
  const bound = Object.freeze({ ...defaults });
  /** Per-call options override the defaults key by key; an undefined value keeps the default. */
  const merged = (options: object | undefined): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...bound };
    for (const [key, value] of Object.entries(options ?? {})) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  };
  type Factory = CheckedDtoFactory<object>;
  return Object.freeze({
    defaults: bound,
    fromClassValidator: (dto: DtoClass, factory: Factory, options?: object) =>
      fromClassValidator(dto, factory, merged(options)),
    fromClassValidatorAsync: (dto: DtoClass, factory: Factory, options?: object) =>
      fromClassValidatorAsync(dto, factory, merged(options)),
    classValidatorSchema: (dto: DtoClass, options?: object) =>
      classValidatorSchema(dto, merged(options)),
  }) as unknown as ClassValidatorWithDefaults<D>;
}
