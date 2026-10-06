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
  type SchemaFields,
  type StandardSchemaV1,
} from '../../packages/core/src/index.js';
import {
  classValidatorFields,
  classValidatorSchema,
  fromClassValidator,
  fromClassValidatorAsync,
  withClassValidatorDefaults,
  type AsyncClassValidatorBuilder,
  type ClassValidatorBuilder,
  type ClassValidatorFieldNames,
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

class ReportQuery {
  format?: 'csv' | 'json';
  range?: { from: string; to: string };
  meta?: Record<string, unknown>;
  filter?: object;
  sort?: never;
}
class OrderBatch {
  orders?: CreateOrderCommand[];
}

describe('keys the payload does not have', () => {
  it('reports misspelled keys and fields typed never in factories without an annotation', () => {
    // build() would send the misspelled key; only the pipe's forbidNonWhitelisted rejects it.
    const misspelled = fromClassValidator(
      CreateOrderCommand,
      // @ts-expect-error A misspelled field.
      () => ({ title: 'Windows', titel: 'Doors' })
    );
    const sent = misspelled.build();
    expect(sent).toEqual({ title: 'Windows', titel: 'Doors' });
    const piped = fromClassValidator(CreateOrderCommand, () => sent, pipe);
    expect(failure(() => piped.buildValidated()).message).toMatch(/at titel/);
    // @ts-expect-error A field typed never cannot be set.
    fromClassValidator(ViewOrdersQuery, () => ({ search: 'ramp', sort: 'name' }));
    // @ts-expect-error Nor can a method.
    fromClassValidator(CreateOrderCommand, () => ({ title: 'x', describe: () => 'x' }));
    // @ts-expect-error The same in an async factory.
    fromClassValidatorAsync(InviteUser, async () => ({
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
    }));
    // @ts-expect-error The same in an async factory of the sync builder.
    fromClassValidator(InviteUser, async () => ({ email: 'a@b.c', firstName: 'A', emial: '' }));
    // @ts-expect-error The same for a query with its wire.
    fromClassValidator(ViewOrdersQuery, () => ({ statuses: [Side.BACK], serach: 'ramp' }), {
      ...pipe,
      wire: queryLike,
    });
    fromClassValidator(
      LocationCommand,
      // @ts-expect-error The same with factory arguments and a default session.
      (session?: GenerationSession) => ({ side: Side.BACK, floor: session ? 1 : 0, flor: 1 }),
      { defaultSession: () => createSession({ fingerprint: 'f', provider: 'p@1', seed: 1 }) }
    );
    // @ts-expect-error The same after a spread, in a block body.
    fromClassValidator(CreateOrderCommand, () => {
      const base = { title: 'Windows' };
      return { ...base, productCont: 2 };
    });
    // @ts-expect-error The same in one branch of a conditional.
    fromClassValidator(CreateOrderCommand, (doors?: boolean) =>
      doors ? { title: 'Doors', count: 1 } : { title: 'Windows' }
    );
  });

  it('checks nested DTOs and arrays of them', () => {
    // @ts-expect-error A misspelled field of a nested DTO.
    fromClassValidator(CreateOrderCommand, () => ({
      location: { side: Side.FRONT, floor: 1, flor: 1 },
    }));
    const roles = [{ roleUuid: 'r-1', permissions: ['read'], permission: [] }];
    // @ts-expect-error A misspelled field in an array of nested DTOs.
    fromClassValidator(UpdateRoles, () => ({ roles }));
    // @ts-expect-error A nested plain object type is checked too.
    fromClassValidator(ReportQuery, () => ({ range: { from: 'a', to: 'b', until: 'c' } }));
    // Nested types without known keys (object, records) accept any key.
    const report = fromClassValidator(ReportQuery, () => ({
      format: 'csv',
      range: { from: '2026-01-01', to: '2026-02-01' },
      meta: { source: 'test' },
      filter: { anything: true },
    }));
    expect(report.build().format).toBe('csv');
    // A nested class instance has methods: function-valued keys are not checked.
    const order = Object.assign(new CreateOrderCommand(), { title: 'x' });
    const batches = fromClassValidator(OrderBatch, () => ({ orders: [order] }));
    expect(batches.build().orders?.[0]).toBe(order);
  });

  it('keeps literal types, annotated factories and generic helpers', () => {
    // Literals need no `as const`, and a wrong literal is still an error.
    fromClassValidator(ReportQuery, () => ({ format: 'json' }));
    // @ts-expect-error A literal outside the union.
    fromClassValidator(ReportQuery, () => ({ format: 'xml' }));
    const annotated = (): DtoInput<CreateOrderCommand> => ({ title: 'Windows' });
    expect(fromClassValidator(CreateOrderCommand, annotated).build()).toEqual({ title: 'Windows' });
    const asyncHelper = <T extends object>(dto: DtoClass<T>, make: () => Promise<DtoInput<T>>) =>
      fromClassValidatorAsync(dto, make);
    expectTypeOf(
      asyncHelper(LocationCommand, async () => ({ side: null, floor: 1 }))
    ).toEqualTypeOf<AsyncSchemaBuilder<DtoInput<LocationCommand>, LocationCommand, []>>();
  });

  it('rejects unknown keys in with() and has no setters for them', () => {
    const commands = fluent(
      fromClassValidator(CreateOrderCommand, () => ({ title: 'Windows' })),
      ['title', 'location']
    );
    // @ts-expect-error with() checks its object literal.
    commands.with({ titel: 'Doors' });
    // @ts-expect-error Nested object literals too.
    commands.with({ location: { side: Side.FRONT, floor: 1, flor: 2 } });
    // @ts-expect-error A setter exists only for a listed field.
    expect(commands.withTitel).toBeUndefined();
    // @ts-expect-error Setter values keep the nested type.
    commands.withLocation({ side: Side.FRONT, floor: 1, flor: 2 });
  });
});

describe('bound defaults', () => {
  it('applies the defaults to every builder and lets each call override them', () => {
    const body = withClassValidatorDefaults(pipe);
    expect(body.defaults).toEqual(pipe);
    expect(Object.isFrozen(body.defaults)).toBe(true);
    const query = withClassValidatorDefaults({ ...body.defaults, wire: queryLike });
    const queries = query.fromClassValidator(ViewOrdersQuery, () => ({
      pagination: { limit: 5, offset: 10 },
    }));
    expectTypeOf(queries).toEqualTypeOf<
      SchemaBuilder<DtoInput<ViewOrdersQuery>, ViewOrdersQuery, []>
    >();
    const factory = () => ({ title: 'Windows' });
    expectTypeOf(body.fromClassValidator(CreateOrderCommand, factory)).toEqualTypeOf<
      ClassValidatorBuilder<CreateOrderCommand, typeof factory>
    >();
    const value = queries.buildValidated();
    expect(value).toBeInstanceOf(ViewOrdersQuery);
    // The query wire sent strings, which @Type(() => Number) converted back.
    expect(value.pagination).toEqual(Object.assign(new Pagination(), { limit: 5, offset: 10 }));
    // The pipe's whitelisting comes from the defaults.
    expect(failure(() => queries.with({ extra: 1 } as never).buildValidated()).message).toMatch(
      /at extra/
    );
    // A call's options override the defaults, and its types follow them.
    const plain = query.fromClassValidator(ViewOrdersQuery, () => ({}), { transform: false });
    expectTypeOf(plain.buildValidated()).toEqualTypeOf<DtoInput<ViewOrdersQuery>>();
    expect(plain.buildValidated()).not.toBeInstanceOf(ViewOrdersQuery);
    const { fromClassValidator: bodyBuilder } = body;
    expect(bodyBuilder(CreateOrderCommand, factory).buildValidated()).toBeInstanceOf(
      CreateOrderCommand
    );
    // @ts-expect-error Bound builders check the factory's keys too.
    body.fromClassValidator(CreateOrderCommand, () => ({ title: 'x', titel: 'y' }));
  });

  it('types outputs from transform: false in the defaults', async () => {
    const plain = withClassValidatorDefaults({ transform: false, wire: false });
    const located = plain.fromClassValidator(LocationCommand, () => ({ side: null, floor: 1 }));
    expectTypeOf(located.buildValidated()).toEqualTypeOf<DtoInput<LocationCommand>>();
    expect(located.buildValidated()).toEqual({ side: null, floor: 1 });
    const instances = plain.fromClassValidator(LocationCommand, () => ({ side: null, floor: 1 }), {
      transform: true,
    });
    expectTypeOf(instances.buildValidated()).toEqualTypeOf<LocationCommand>();
    expect(instances.buildValidated()).toBeInstanceOf(LocationCommand);
    const invites = plain.fromClassValidatorAsync(InviteUser, () => ({
      email: 'taken@example.com',
      firstName: 'Ada',
    }));
    expectTypeOf(invites).toEqualTypeOf<
      AsyncSchemaBuilder<DtoInput<InviteUser>, DtoInput<InviteUser>, []>
    >();
    await expect(invites.buildValidatedAsync()).rejects.toThrow(/1 issue at email/);
    const asInstances = plain.fromClassValidatorAsync(
      InviteUser,
      () => ({ email: 'free@example.com', firstName: 'Ada' }),
      { transform: true }
    );
    expect(await asInstances.buildValidatedAsync()).toBeInstanceOf(InviteUser);
    const schema = plain.classValidatorSchema(LocationCommand);
    expectTypeOf(schema).toEqualTypeOf<
      StandardSchemaV1<DtoInput<LocationCommand>, DtoInput<LocationCommand>>
    >();
    expect(schema['~standard'].validate({ side: null, floor: 2 })).toEqual({
      value: { side: null, floor: 2 },
    });
    const transformed = plain.classValidatorSchema(LocationCommand, { transform: true });
    expectTypeOf(transformed).toEqualTypeOf<
      StandardSchemaV1<DtoInput<LocationCommand>, LocationCommand>
    >();
    expectTypeOf(
      plain.classValidatorSchema(LocationCommand, { transform: false, whitelist: true })
    ).toEqualTypeOf<StandardSchemaV1<DtoInput<LocationCommand>, DtoInput<LocationCommand>>>();
  });

  it('keeps per-builder options per call and rejects invalid defaults', () => {
    for (const key of ['async', 'name', 'defaultSession']) {
      expect(() => withClassValidatorDefaults({ [key]: undefined } as never)).toThrow(
        new RegExp(`${key} is not a default`)
      );
    }
    expect(() => withClassValidatorDefaults(null as never)).toThrow(/requires an options object/);
    expect(() => withClassValidatorDefaults([] as never)).toThrow(/requires an options object/);
    let sent = 0;
    const counting: Wire = {
      stringify: (value: unknown) => {
        sent++;
        return JSON.stringify(value);
      },
      parse: (text) => JSON.parse(text) as unknown,
    };
    const bound = withClassValidatorDefaults({ wire: counting });
    // An undefined option keeps the default.
    bound.classValidatorSchema(Pagination, { wire: undefined } as never)['~standard'].validate({
      limit: 1,
      offset: 0,
    });
    expect(sent).toBe(1);
    const named = bound.fromClassValidator(LocationCommand, () => ({ side: null, floor: 1 }), {
      name: 'locations',
    });
    expect(named.describe().name).toBe('locations');
    expect(() =>
      bound.fromClassValidator(LocationCommand, () => ({ side: null, floor: 1 }), {
        async: true,
      } as never)
    ).toThrow(/fromClassValidatorAsync/);
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

  it('gives a builder name to the builder, not to class-validator', () => {
    const shared = { title: 'Windows' };
    const named = fromClassValidator(CreateOrderCommand, () => shared, {
      transform: false,
      wire: false,
      name: 'orders',
    });
    expect(named.describe().name).toBe('orders');
    // With no validator option set, the pipe returns the payload itself.
    expect(named.buildValidated()).toBe(shared);
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

  it('types the fields typed never it may list, and leaves out the excluded fields', () => {
    // class-validator metadata cannot see types: sort is typed never and decorated.
    expectTypeOf(classValidatorFields(ViewOrdersQuery)).toEqualTypeOf<
      SchemaFields<'pagination' | 'search' | 'statuses' | 'sort'>
    >();
    expectTypeOf<ClassValidatorFieldNames<ViewOrdersQuery, 'sort'>>().toEqualTypeOf<
      'pagination' | 'search' | 'statuses'
    >();
    const fields = classValidatorFields(ViewOrdersQuery, { exclude: ['sort'] });
    expectTypeOf(fields).toEqualTypeOf<SchemaFields<'pagination' | 'search' | 'statuses'>>();
    expect([...fields].sort()).toEqual(['pagination', 'search', 'statuses']);
    const queries = fluent(
      fromClassValidator(ViewOrdersQuery, () => ({})),
      fields
    );
    // @ts-expect-error No setter, at runtime either.
    expect(queries.withSort).toBeUndefined();
    expect(queries.withSearch('ramp').build()).toEqual({ search: 'ramp' });
    // @ts-expect-error Excluded names are fields of the DTO.
    classValidatorFields(ViewOrdersQuery, { exclude: ['sortt'] });
    // A field that holds a function is not payload data, as in DtoInput.
    class Handler {
      name!: string;
      handle = (): string => this.name;
    }
    decorate(Handler, { name: [IsString()] });
    expectTypeOf(classValidatorFields(Handler)).toEqualTypeOf<SchemaFields<'name'>>();
    expect([...classValidatorFields(Handler)]).toEqual(['name']);
  });

  it('throws instead of returning a list its type does not describe', () => {
    class Undecorated {
      declare title: string;
      declare productCount: number;
    }
    expect(() => classValidatorFields(Undecorated)).toThrow(
      /classValidatorFields\(Undecorated\) found no fields/
    );
    expect(() => classValidatorFields(Profile, { exclude: ['name', 'note'] })).toThrow(
      /excludes every field it found/
    );
    expect(() => classValidatorFields(Profile, { exclude: 'name' } as never)).toThrow(
      /exclude must be an array of field names/
    );
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
