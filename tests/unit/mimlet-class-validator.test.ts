// class-transformer's @Type() reads decorator metadata through the reflect-metadata polyfill.
import 'reflect-metadata';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as transformer from 'class-transformer';
import * as validator from 'class-validator';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
  ValidationError,
  registerDecorator,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  BuilderValidationError,
  createSchemaBuilder,
  createSession,
  fluent,
  formatValidationIssues,
  type AsyncSchemaBuilder,
  type GenerationSession,
  type SchemaBuilder,
} from '../../packages/core/src/index.js';
import {
  classValidatorFields,
  classValidatorSchema,
  fromClassValidator,
  fromClassValidatorAsync,
  type AsyncClassValidatorBuilder,
  type ClassValidatorBuilder,
  type DtoClass,
  type DtoInput,
  type Wire,
} from '../../packages/class-validator/src/index.js';

/** Applies property decorators the way TypeScript's legacy decorators do (bottom up). */
function decorate(
  target: { prototype: object },
  fields: Record<string, readonly PropertyDecorator[]>
): void {
  for (const [key, decorators] of Object.entries(fields)) {
    for (const decorator of [...decorators].reverse()) {
      decorator(target.prototype, key);
    }
  }
}
const IsNullable = () => ValidateIf((_object, value) => value !== null);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

enum Side {
  FRONT = 'front',
  BACK = 'back',
}
class LocationCommand {
  side!: Side | null;
  floor!: number | null;
}
decorate(LocationCommand, {
  side: [IsNullable(), IsEnum(Side)],
  floor: [IsNullable(), IsInt(), Min(0)],
});
class CreateOrderCommand {
  title?: string;
  productCount?: number;
  location?: LocationCommand;
  /** A method is not part of the payload. */
  describe(): string {
    return `${this.title ?? 'untitled'} x${this.productCount ?? 0}`;
  }
}
decorate(CreateOrderCommand, {
  title: [Transform(trim), IsOptional(), IsString(), IsNotEmpty()],
  productCount: [IsOptional(), IsInt(), Min(0)],
  location: [IsOptional(), ValidateNested(), Type(() => LocationCommand)],
});
class Pagination {
  limit!: number;
  offset!: number;
}
decorate(Pagination, {
  limit: [Type(() => Number), IsInt(), Min(1), Max(100)],
  offset: [Type(() => Number), IsInt(), Min(0)],
});
abstract class PaginatedQuery {
  pagination?: Pagination;
}
decorate(PaginatedQuery, {
  pagination: [IsOptional(), ValidateNested(), Type(() => Pagination)],
});
class ViewOrdersQuery extends PaginatedQuery {
  sort?: never;
  search?: string;
  statuses?: Side[];
}
decorate(ViewOrdersQuery, {
  sort: [Equals(undefined)],
  search: [IsOptional(), IsString(), IsNotEmpty()],
  statuses: [IsOptional(), IsArray(), ArrayMinSize(1), IsEnum(Side, { each: true })],
});
/** `note` has no decorator: only `new Profile()` reveals it, as an own class field. */
class Profile {
  name!: string;
  note?: string = undefined;
}
decorate(Profile, { name: [IsString()] });
class RolePermissions {
  roleUuid!: string;
  permissions!: string[];
}
decorate(RolePermissions, {
  roleUuid: [IsUUID()],
  permissions: [IsArray(), IsString({ each: true })],
});
class UpdateRoles {
  roles!: RolePermissions[];
}
decorate(UpdateRoles, {
  roles: [IsArray(), ValidateNested({ each: true }), Type(() => RolePermissions)],
});
const taken = new Set(['taken@example.com']);
class InviteUser {
  email!: string;
  firstName!: string;
}
decorate(InviteUser, {
  email: [
    IsEmail(),
    (prototype, propertyName) =>
      registerDecorator({
        name: 'isUnusedEmail',
        target: prototype.constructor,
        propertyName: String(propertyName),
        options: { message: 'email is already in use' },
        validator: {
          validate: async (value: unknown) => typeof value === 'string' && !taken.has(value),
        },
      }),
  ],
  firstName: [IsString(), IsNotEmpty({ groups: ['named'] })],
});

const pipe = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
/** A query string turns every scalar into a string, as this wire does. */
const queryLike: Wire = {
  stringify: (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'number' || typeof item === 'boolean' ? String(item) : item
    ),
  parse: (text) => JSON.parse(text) as unknown,
};
const failure = (run: () => unknown): BuilderValidationError => {
  try {
    run();
  } catch (error) {
    if (error instanceof BuilderValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a validation failure');
};

describe('payload and validated DTO', () => {
  const commands = fluent(
    fromClassValidator(CreateOrderCommand, () => ({ title: '  Windows  ', productCount: 2 }), pipe),
    ['title', 'productCount', 'location']
  );

  it('builds the payload and the DTO instance the pipe would pass on', () => {
    expect(commands.build()).toEqual({ title: '  Windows  ', productCount: 2 });
    const command = commands.withProductCount(3).buildValidated();
    expect(command).toBeInstanceOf(CreateOrderCommand);
    expect(command.title).toBe('Windows');
    expect(command.describe()).toBe('Windows x3');
    expect(commands.build().productCount).toBe(2);
    expectTypeOf(commands.build()).toEqualTypeOf<DtoInput<CreateOrderCommand>>();
    expectTypeOf(commands.buildValidated()).toEqualTypeOf<CreateOrderCommand>();
  });

  it('names rejected fields, nested paths and array indexes', () => {
    expect(failure(() => commands.withTitle('   ').buildValidated()).message).toBe(
      'Schema validation failed: 1 issue at title'
    );
    const nested = commands.withLocation({ side: 'left' as Side, floor: null });
    expect(failure(() => nested.buildValidated()).message).toMatch(/1 issue at location\.side/);
    const extra = commands.with({ unknown: 1 } as never);
    expect(failure(() => extra.buildValidated()).message).toMatch(/1 issue at unknown/);
    const roles = fromClassValidator(UpdateRoles, () => ({
      roles: [
        { roleUuid: '0b9f6c1e-8a4d-4c55-9a39-0f3d1a2b3c4d', permissions: ['read'] },
        { roleUuid: 'nope', permissions: ['read', 1 as unknown as string] },
      ],
    }));
    expect(
      formatValidationIssues(
        failure(() => roles.buildValidated()),
        { messages: true }
      )
    ).toBe(
      [
        'roles[1].roleUuid: roleUuid must be a UUID',
        'roles[1].permissions: each value in permissions must be a string',
      ].join('\n')
    );
  });

  it('types the payload from the class', () => {
    expectTypeOf<DtoInput<ViewOrdersQuery>>().toEqualTypeOf<{
      pagination?: { limit: number; offset: number };
      search?: string;
      statuses?: Side[];
    }>();
    expectTypeOf<DtoInput<CreateOrderCommand>>().toEqualTypeOf<{
      title?: string;
      productCount?: number;
      location?: { side: Side | null; floor: number | null };
    }>();
    expectTypeOf<DtoInput<{ readonly at: Date; tags: readonly string[] }>>().toEqualTypeOf<{
      at: Date;
      tags: string[];
    }>();
    // @ts-expect-error The factory is checked against the payload.
    fromClassValidator(LocationCommand, () => ({ side: 'left', floor: null }));
    // @ts-expect-error Methods are not payload fields.
    commands.with({ describe: () => '' });
  });

  it('names the builder types for generic helpers', () => {
    const factory = () => ({ side: Side.FRONT, floor: 1 });
    expectTypeOf(fromClassValidator(LocationCommand, factory)).toEqualTypeOf<
      ClassValidatorBuilder<LocationCommand, typeof factory>
    >();
    expectTypeOf(fromClassValidator(LocationCommand, factory)).toEqualTypeOf<
      SchemaBuilder<DtoInput<LocationCommand>, LocationCommand, []>
    >();
    expectTypeOf(fromClassValidatorAsync(LocationCommand, factory)).toEqualTypeOf<
      AsyncClassValidatorBuilder<LocationCommand, typeof factory>
    >();
    const helper = <T extends object>(dto: DtoClass<T>, make: () => DtoInput<T>) =>
      fluent(fromClassValidator(dto, make), classValidatorFields(dto));
    expect(helper(LocationCommand, factory).withFloor(2).buildValidated().floor).toBe(2);
  });
});

describe('the wire', () => {
  it('sends query strings as strings, which @Type() converts back', () => {
    const queries = fluent(
      fromClassValidator(ViewOrdersQuery, () => ({}), { ...pipe, wire: queryLike }),
      ['search', 'statuses', 'pagination']
    );
    const query = queries.withPagination({ limit: 5, offset: 10 }).buildValidated();
    expect(query).toBeInstanceOf(ViewOrdersQuery);
    expect(query.pagination).toBeInstanceOf(Pagination);
    expect({ ...query.pagination }).toEqual({ limit: 5, offset: 10 });
    expect(failure(() => queries.withSearch('').buildValidated()).message).toMatch(/at search/);
    expect(failure(() => queries.with({ sort: 'x' } as never).buildValidated()).message).toMatch(
      /at sort/
    );
  });

  it('sends JSON by default, so dates arrive as strings and undefined fields disappear', () => {
    const result = classValidatorSchema(CreateOrderCommand)['~standard'].validate({
      title: new Date(0),
      productCount: undefined,
    });
    expect(result).toEqual({ value: expect.any(CreateOrderCommand) });
    const command = (result as { value: CreateOrderCommand }).value;
    expect(command.title).toBe('1970-01-01T00:00:00.000Z');
    expect(command.productCount).toBeUndefined();
  });

  it('validates the value as it is without a wire, and never changes it', () => {
    const value = { title: 'Windows', constructor: 'kept' };
    const result = classValidatorSchema(CreateOrderCommand, { wire: false, transform: false })[
      '~standard'
    ].validate(value);
    expect(result).toEqual({ value });
    expect((result as { value: unknown }).value).toBe(value);
    expect(value.constructor).toBe('kept');
  });

  it('drops prototype keys from the wire copy, as the pipe does', () => {
    const payload = JSON.parse('{"__proto__": {"admin": true}, "title": "Windows"}') as object;
    const built = createSchemaBuilder(
      classValidatorSchema(CreateOrderCommand, pipe),
      () => payload
    );
    expect(built.buildValidated()).toEqual(
      Object.assign(new CreateOrderCommand(), { title: 'Windows' })
    );
    expect(Object.hasOwn(payload, '__proto__')).toBe(true);
  });

  it('turns an absent payload into {} and validates primitives against an empty DTO', () => {
    const absent = classValidatorSchema(CreateOrderCommand)['~standard'].validate(undefined);
    expect(absent).toEqual({ value: new CreateOrderCommand() });
    const plain = classValidatorSchema(CreateOrderCommand, { transform: false })['~standard'];
    expect(plain.validate(null)).toEqual({ value: null });
    expect(plain.validate('text')).toEqual({ value: 'text' });
    const strict = classValidatorSchema(LocationCommand)['~standard'].validate('text');
    expect((strict as { issues: unknown[] }).issues).toHaveLength(3);
    const list = classValidatorSchema(CreateOrderCommand)['~standard'].validate([{}]);
    expect(Array.isArray((list as { value: unknown }).value)).toBe(true);
  });

  it('rejects a wire without stringify() and parse()', () => {
    expect(() => classValidatorSchema(CreateOrderCommand, { wire: {} as Wire })).toThrow(
      /wire must be false or an object/
    );
  });
});

describe('pipe options', () => {
  it('returns the payload with transform: false, through classToPlain when options are set', () => {
    const shared = { title: 'Windows', extra: true } as DtoInput<CreateOrderCommand>;
    const plain = fromClassValidator(CreateOrderCommand, () => shared, {
      transform: false,
      wire: false,
      maxListSize: 5,
      cloneInput: <T>(value: T) => value,
    });
    // Builder options are not validator options, so the pipe returns the payload itself.
    expect(plain.buildValidated()).toBe(shared);
    expectTypeOf(plain.buildValidated()).toEqualTypeOf<DtoInput<CreateOrderCommand>>();
    const whitelisted = fromClassValidator(CreateOrderCommand, () => shared, {
      transform: false,
      wire: false,
      whitelist: true,
    });
    expect(whitelisted.buildValidated()).toEqual({ title: 'Windows' });
    // As in the pipe, its HTTP options count as options and are otherwise ignored.
    const piped = classValidatorSchema(CreateOrderCommand, {
      transform: false,
      wire: false,
      exceptionFactory: () => new Error('unused'),
      errorHttpStatusCode: 422,
      disableErrorMessages: true,
      validateCustomDecorators: true,
      expectedType: CreateOrderCommand,
    })['~standard'].validate(shared);
    expect((piped as { value: unknown }).value).not.toBe(shared);
    expect((piped as { value: unknown }).value).toEqual(shared);
  });

  it('passes transformOptions to class-transformer', () => {
    const converted = classValidatorSchema(Pagination, {
      transformOptions: { enableImplicitConversion: true },
      wire: queryLike,
    })['~standard'].validate({ limit: 2, offset: 0 });
    expect(converted).toEqual({ value: Object.assign(new Pagination(), { limit: 2, offset: 0 }) });
  });

  it('selects validation groups per build', () => {
    const payload = () => ({ email: 'ada@example.com', firstName: '' });
    expect(failure(() => fromClassValidator(InviteUser, payload).buildValidated()).message).toMatch(
      /firstName/
    );
    const invite = fromClassValidator(InviteUser, payload, { strictGroups: true });
    expect(invite.buildValidated()).toBeInstanceOf(InviteUser);
    const named = invite.usingValidation({ libraryOptions: { groups: ['named'] } });
    expect(failure(() => named.buildValidated()).message).toMatch(/1 issue at firstName/);
  });

  it('keeps factory arguments and default sessions', () => {
    const identity = { fingerprint: 'class-validator/unit', provider: 'test@1', seed: 1 };
    const located = fromClassValidator(
      LocationCommand,
      (session?: GenerationSession) => ({
        side: Side.BACK,
        floor: session ? session.sequence('floor') : 0,
      }),
      { defaultSession: () => createSession(identity) }
    );
    expect(located.buildValidatedList(2).map((item) => item.floor)).toEqual([0, 1]);
  });
});

describe('async validation', () => {
  const payload = () => ({ email: 'taken@example.com', firstName: 'Ada' });

  it('skips async constraints in the sync builder, as validateSync() does', () => {
    expect(fromClassValidator(InviteUser, payload).buildValidated()).toBeInstanceOf(InviteUser);
    expect(() => fromClassValidator(InviteUser, payload, { async: true } as never)).toThrow(
      /fromClassValidatorAsync/
    );
  });

  it('runs async constraints with fromClassValidatorAsync()', async () => {
    const invites = fromClassValidatorAsync(InviteUser, payload);
    expectTypeOf(invites).toEqualTypeOf<AsyncSchemaBuilder<DtoInput<InviteUser>, InviteUser, []>>();
    await expect(invites.buildValidatedAsync()).rejects.toThrow(/1 issue at email/);
    const free = await invites.with({ email: 'free@example.com' }).buildValidatedAsync();
    expect(free).toBeInstanceOf(InviteUser);
    expect(await invites.buildAsync()).toEqual(payload());
    const plain = fromClassValidatorAsync(InviteUser, payload, {
      transform: false,
      wire: false,
    }).with({ email: 'free@example.com' });
    expect(await plain.buildValidatedAsync()).toEqual({
      email: 'free@example.com',
      firstName: 'Ada',
    });
  });

  it('makes a sync schema reject async use in a sync build', () => {
    const schema = classValidatorSchema(InviteUser, { async: true });
    expect(() => createSchemaBuilder(schema, payload).buildValidated()).toThrow(
      /buildValidatedAsync/
    );
  });
});

describe('package copies and errors', () => {
  it('uses the packages the application passes', () => {
    const calls: string[] = [];
    const schema = classValidatorSchema(LocationCommand, {
      validatorPackage: {
        validate: validator.validate,
        validateSync(object, options) {
          calls.push('validateSync');
          return validator.validateSync(object, options);
        },
      },
      transformerPackage: {
        plainToInstance(cls, plain, options) {
          calls.push('plainToInstance');
          return transformer.plainToInstance(cls as never, plain, options);
        },
      },
    });
    createSchemaBuilder(schema, () => ({ side: null, floor: null })).buildValidated();
    expect(calls).toEqual(['plainToInstance', 'validateSync']);
  });

  it('requires the functions a configuration calls', async () => {
    expect(() =>
      classValidatorSchema(LocationCommand, { validatorPackage: { validate: validator.validate } })
    ).toThrow(/needs validateSync/);
    const asyncOnly = classValidatorSchema(LocationCommand, {
      async: true,
      validatorPackage: { validate: (object, options) => validator.validateSync(object, options) },
    });
    await expect(asyncOnly['~standard'].validate({ side: null, floor: null })).resolves.toEqual({
      value: expect.any(LocationCommand),
    });
    const noPlain = classValidatorSchema(LocationCommand, {
      transform: false,
      whitelist: true,
      transformerPackage: { plainToInstance: transformer.plainToInstance as never },
    });
    expect(() => noPlain['~standard'].validate({ side: null, floor: null })).toThrow(
      /classToPlain\(\) or instanceToPlain\(\)/
    );
    const modern = classValidatorSchema(LocationCommand, {
      transform: false,
      whitelist: true,
      transformerPackage: {
        plainToInstance: transformer.plainToInstance as never,
        instanceToPlain: transformer.instanceToPlain,
      },
    });
    expect(modern['~standard'].validate({ side: null, floor: 1 })).toEqual({
      value: { side: null, floor: 1 },
    });
    expect(() => classValidatorSchema(undefined as never)).toThrow(/requires a DTO class/);
  });

  it('reports errors without constraints and bounds deep error trees', () => {
    const bare = Object.assign(new ValidationError(), { property: 'x', children: [] });
    const rejecting = (errors: ValidationError[]) =>
      classValidatorSchema(LocationCommand, {
        validatorPackage: { validate: async () => errors, validateSync: () => errors },
      })['~standard'].validate({});
    expect(rejecting([bare])).toEqual({
      issues: [{ message: 'class-validator rejected the value', path: [] }],
    });
    let deep: ValidationError = Object.assign(new ValidationError(), {
      property: 'leaf',
      constraints: { a: 'bad' },
    });
    for (let depth = 0; depth < 300; depth++) {
      deep = Object.assign(new ValidationError(), { property: 'x', children: [deep] });
    }
    const result = rejecting([deep]) as { issues: { message: string }[] };
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toBe('Validation errors are nested too deeply');
    const unknownValue = Object.assign(new ValidationError(), {
      constraints: { unknownValue: 'an unknown value was passed to the validate function' },
    });
    expect(rejecting([unknownValue])).toEqual({
      issues: [{ message: 'an unknown value was passed to the validate function', path: [] }],
    });
  });
});

describe('classValidatorFields (experimental)', () => {
  it('lists decorated, inherited and declared fields as typed setters', () => {
    const fields = classValidatorFields(ViewOrdersQuery);
    expect([...fields].sort()).toEqual(['pagination', 'search', 'sort', 'statuses']);
    const queries = fluent(
      fromClassValidator(ViewOrdersQuery, () => ({})),
      fields
    );
    expect(queries.withSearch('ramp').withStatuses([Side.BACK]).build()).toEqual({
      search: 'ramp',
      statuses: ['back'],
    });
    // @ts-expect-error A field typed never has no typed setter.
    expect(queries.withSort).toBeTypeOf('function');
    // @ts-expect-error Setters keep the field type.
    queries.withSearch(1);
    const profiles = fluent(
      fromClassValidator(Profile, () => ({ name: 'Ada' })),
      classValidatorFields(Profile)
    );
    expect([...classValidatorFields(Profile)]).toEqual(['name', 'note']);
    expect(profiles.withNote('n').buildValidated().note).toBe('n');
  });

  it('rejects classes it cannot create', () => {
    class NeedsArguments {
      constructor(readonly value: string) {
        if (value === undefined) {
          throw new Error('value is required');
        }
      }
    }
    expect(() => classValidatorFields(NeedsArguments)).toThrow(/without arguments/);
    expect(() => classValidatorFields({} as never)).toThrow(/requires a DTO class/);
  });
});
