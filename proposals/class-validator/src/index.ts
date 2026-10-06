/**
 * PROTOTYPE (docs/proposals/class-instances.md). Not published.
 *
 * class-validator DTOs as Standard Schemas, so Mimlet builders validate command and query
 * fixtures with an API's own rules: `build()` returns the payload a client sends,
 * `buildValidated()` returns what NestJS's ValidationPipe hands to the controller.
 */
import {
  createSchemaBuilder,
  schemaFields,
  type DefaultSessionFor,
  type SchemaBuilderConfig,
  type SchemaBuilderFor,
  type SchemaFields,
  type StandardSchemaV1,
} from '@mimlet/core';
import * as defaultTransformer from 'class-transformer';
import * as defaultValidator from 'class-validator';
import type { ClassTransformOptions } from 'class-transformer';
import type { ValidationError, ValidatorOptions } from 'class-validator';

type AnyFunction = (...args: never[]) => unknown;
type Atomic = string | number | boolean | bigint | symbol | null | undefined | Date;
/** Methods and fields typed `never` (DTOs use `search?: never` to forbid a parameter). */
type DtoKey<T, K extends keyof T> = T[K] extends AnyFunction
  ? never
  : [Exclude<T[K], undefined>] extends [never]
    ? never
    : K;

/**
 * The payload a client sends for a DTO class: its data fields, recursively, without methods
 * and without fields typed `never`. `readonly` is removed; a readonly DTO field stays required.
 * Dates stay `Date`: the JSON wire turns them into ISO strings, as a real client would.
 */
export type DtoInput<T> = T extends Atomic
  ? T
  : T extends ReadonlyArray<infer Item>
    ? Array<DtoInput<Item>>
    : T extends AnyFunction
      ? never
      : { -readonly [K in keyof T as DtoKey<T, K>]: DtoInput<T[K]> };

/** A DTO class. class-transformer creates it with `new Dto()`, without arguments. */
export type DtoClass<T extends object = object> = new (...args: never[]) => T;

/**
 * How a payload reaches the pipe. Anything with `stringify` and `parse` works: `JSON` (the
 * default, a JSON body), the `qs` module for a query string parsed by `qs.parse` (configure the
 * same parser as the application), or `false` to validate the value as it is.
 */
export interface Wire {
  stringify(value: never): string | undefined;
  parse(text: string): unknown;
}

/** The subset of class-validator and class-transformer that the bridge calls. */
export interface ValidatorPackage {
  validate(object: object, options?: ValidatorOptions): Promise<ValidationError[]>;
  validateSync(object: object, options?: ValidatorOptions): ValidationError[];
}
export interface TransformerPackage {
  plainToInstance(cls: DtoClass, plain: unknown, options?: ClassTransformOptions): unknown;
  instanceToPlain(object: unknown, options?: ClassTransformOptions): unknown;
}

/**
 * NestJS `ValidationPipeOptions`, minus the HTTP error options, plus how the payload travels.
 * Pass the options of the application's global pipe so tests validate as the API does.
 */
export interface ClassValidatorSchemaOptions extends ValidatorOptions {
  /**
   * As in ValidationPipe: `true` returns the DTO instance, `false` the plain payload. The
   * default is `true` here (ValidationPipe defaults to `false`), because a unit test wants
   * the instance a controller passes on.
   */
  readonly transform?: boolean;
  readonly transformOptions?: ClassTransformOptions;
  /** Default `JSON`. Use the `qs` module for query DTOs, or `false` for no round trip. */
  readonly wire?: Wire | false;
  /**
   * Run class-validator's async `validate()`, as the pipe does, so async constraints run too.
   * `buildValidated()` then throws; use `buildValidatedAsync()`. Default `false`
   * (`validateSync()`, which skips async constraints).
   */
  readonly async?: boolean;
  /** The application's own copies, when the bridge could resolve different ones (bundlers). */
  readonly validatorPackage?: ValidatorPackage;
  readonly transformerPackage?: TransformerPackage;
}
type Untransformed = ClassValidatorSchemaOptions & { readonly transform: false };

/** Per-call class-validator options, through `builder.usingValidation({ libraryOptions })`. */
export type ClassValidatorLibraryOptions = Pick<
  ValidatorOptions,
  'groups' | 'always' | 'strictGroups' | 'skipMissingProperties'
>;

const VENDOR = 'class-validator';
const PIPE_ONLY = new Set([
  'transform',
  'transformOptions',
  'wire',
  'async',
  'validatorPackage',
  'transformerPackage',
]);

/**
 * A Standard Schema for a class-validator DTO that mirrors NestJS's ValidationPipe:
 * the payload crosses the wire, an absent payload becomes `{}`, `__proto__`, `prototype` and
 * `constructor` keys are dropped, class-transformer creates the DTO with `transformOptions`,
 * class-validator checks it with the validator options (`forbidUnknownValues` defaults to
 * `false`, as in the pipe), and the result is the instance or, with `transform: false`, the
 * plain payload. Validation errors become issues with paths into the payload.
 */
export function classValidatorSchema<T extends object>(
  dto: DtoClass<T>,
  options: Untransformed
): StandardSchemaV1<DtoInput<T>, DtoInput<T>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function classValidatorSchema<T extends object>(
  dto: DtoClass<T>,
  options?: ClassValidatorSchemaOptions
): StandardSchemaV1<DtoInput<T>, T>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function classValidatorSchema(
  dto: DtoClass,
  options: ClassValidatorSchemaOptions = {}
): StandardSchemaV1 {
  if (typeof dto !== 'function') {
    throw new TypeError('classValidatorSchema() requires a DTO class');
  }
  const wire = options.wire ?? JSON;
  const validator = options.validatorPackage ?? defaultValidator;
  const transformer = options.transformerPackage ?? defaultTransformer;
  const transform = options.transform ?? true;
  const pipeValidatorOptions: ValidatorOptions = { forbidUnknownValues: false };
  for (const [key, value] of Object.entries(options)) {
    if (!PIPE_ONLY.has(key)) {
      Object.assign(pipeValidatorOptions, { [key]: value });
    }
  }
  const finish = (
    errors: ValidationError[],
    entity: object,
    payload: unknown,
    original: unknown,
    validatorOptions: ValidatorOptions
  ): StandardSchemaV1.Result<unknown> => {
    if (errors.length > 0) {
      return { issues: toIssues(errors) };
    }
    if (transform) {
      return { value: entity };
    }
    if (original === undefined || original === null) {
      return { value: original };
    }
    // As the pipe: with more validator options than its default, return classToPlain(entity).
    return {
      value:
        Object.keys(validatorOptions).length > 1
          ? transformer.instanceToPlain(entity, options.transformOptions)
          : payload,
    };
  };
  return {
    '~standard': {
      version: 1,
      vendor: VENDOR,
      validate(value, standardOptions) {
        const validatorOptions = {
          ...pipeValidatorOptions,
          ...(standardOptions?.libraryOptions as ClassValidatorLibraryOptions | undefined),
        };
        const received = wire === false ? value : overTheWire(wire, value);
        const payload = received === undefined || received === null ? {} : received;
        if (wire !== false) {
          stripProtoKeys(payload);
        }
        const entity = transformer.plainToInstance(dto, payload, options.transformOptions);
        if (typeof entity !== 'object' || entity === null) {
          return { issues: [{ message: `Expected an object for ${dto.name || 'the DTO'}` }] };
        }
        if (options.async) {
          return validator
            .validate(entity, validatorOptions)
            .then((errors) => finish(errors, entity, payload, received, validatorOptions));
        }
        return finish(
          validator.validateSync(entity, validatorOptions),
          entity,
          payload,
          received,
          validatorOptions
        );
      },
    },
  };
}

function overTheWire(wire: Wire, value: unknown): unknown {
  const text = wire.stringify(value as never);
  return text === undefined ? undefined : wire.parse(text);
}

const BUILT_IN = [Date, RegExp, Error, Map, Set, WeakMap, WeakSet];
/** ValidationPipe deletes these keys before class-transformer sees the payload. */
function stripProtoKeys(value: unknown, depth = 0): void {
  if (
    depth > 64 ||
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    BUILT_IN.some((type) => value instanceof type)
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => stripProtoKeys(item, depth + 1));
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
export function toIssues(
  errors: readonly ValidationError[],
  path: readonly PropertyKey[] = [],
  parent?: unknown
): StandardSchemaV1.Issue[] {
  const issues = errors.flatMap((error): StandardSchemaV1.Issue[] => {
    const property: unknown = error.property;
    const at =
      typeof property !== 'string' || property === ''
        ? path
        : [...path, Array.isArray(parent) && /^\d+$/.test(property) ? Number(property) : property];
    const own = Object.values(error.constraints ?? {}).map((message) => ({ message, path: at }));
    return [...own, ...toIssues(error.children ?? [], at, error.value)];
  });
  return issues.length > 0 || errors.length === 0
    ? issues
    : [{ message: 'class-validator rejected the value', path: [...path] }];
}

/**
 * A schema builder for a DTO: `build()` returns the payload, `buildValidated()` the result of
 * the pipe. The factory's return type comes from the class, so it needs no annotation.
 */
export function fromClassValidator<
  T extends object,
  F extends (...args: never[]) => NoInfer<DtoInput<T>>,
>(
  dto: DtoClass<T>,
  factory: F,
  options?: Omit<ClassValidatorSchemaOptions, 'transform'> & {
    readonly transform?: true;
    readonly builder?: SchemaBuilderConfig & DefaultSessionFor<F>;
  }
): SchemaBuilderFor<StandardSchemaV1<DtoInput<T>, T>, F> {
  const { builder, ...schemaOptions } = options ?? {};
  return createSchemaBuilder(classValidatorSchema(dto, schemaOptions), factory, builder);
}

/**
 * EXPERIMENTAL: the payload fields of a DTO for `fluent()`: every property with a
 * class-validator decorator (including inherited ones) plus the fields `new Dto()` defines.
 * TypeScript cannot check this list against the class, so a DTO field that has no decorator
 * and is not emitted as a class field gets a typed setter that does not exist at runtime.
 */
export function classValidatorFields<T extends object>(
  dto: DtoClass<T>
): SchemaFields<Extract<keyof DtoInput<T>, string>> {
  const storage = defaultValidator.getMetadataStorage();
  const names = new Set<string>();
  for (const metadata of storage.getTargetValidationMetadatas(dto, '', true, false)) {
    names.add(metadata.propertyName);
  }
  for (const name of Object.keys(Reflect.construct(dto, []) as object)) {
    names.add(name);
  }
  return schemaFields([...names] as Extract<keyof DtoInput<T>, string>[]);
}
