// class-transformer's @Type() reads decorator metadata through the reflect-metadata polyfill,
// and NestJS needs it too, as in every NestJS application.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import qs from 'qs';
import * as classTransformer from 'class-transformer';
import * as classValidator from 'class-validator';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
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
  createInstanceBuilder,
  createSchemaBuilder,
  createSession,
  fluent,
  formatValidationIssues,
} from '@mimlet/core';
import {
  classValidatorFields,
  classValidatorSchema,
  fromClassValidator,
  fromClassValidatorAsync,
} from '@mimlet/class-validator';

const require = createRequire(import.meta.url);
const nest11 = require('@nestjs/common');
const nest12 = await import('@nestjs/common-12');

/** Applies property decorators as TypeScript's legacy decorators do: bottom up. */
function decorate(target, fields) {
  for (const [key, decorators] of Object.entries(fields)) {
    for (const decorator of [...decorators].reverse()) decorator(target.prototype, key);
  }
}
/** A `ValidateIf` wrapper, as validator libraries offer it: null skips the other constraints. */
const IsNullable = () => ValidateIf((_object, value) => value !== null);
const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
const taken = new Set(['taken@example.com']);
const IsUnusedEmail = () => (prototype, propertyName) =>
  registerDecorator({
    name: 'isUnusedEmail',
    target: prototype.constructor,
    propertyName,
    options: { message: `${propertyName} is already in use` },
    validator: {
      validate: async (value) => {
        await Promise.resolve();
        return typeof value === 'string' && !taken.has(value);
      },
    },
  });

const Side = { FRONT: 'front', BACK: 'back' };
const Floor = { GROUND: 'ground', FIRST: 'first' };
const OrderStatus = { NEW: 'new', PAID: 'paid' };

class UpdateLocationCommand {
  side;
  floor;
}
decorate(UpdateLocationCommand, {
  side: [IsNullable(), IsEnum(Side)],
  floor: [IsNullable(), IsEnum(Floor)],
});
class CreateOrderCommand {
  title;
  amountExcludingVat;
  productCount;
  location;
  describe() {
    return `${this.title ?? 'untitled'} x${this.productCount ?? 0}`;
  }
}
decorate(CreateOrderCommand, {
  title: [Transform(trim), IsOptional(), IsString(), IsNotEmpty()],
  amountExcludingVat: [IsOptional(), IsNullable(), IsNumber(), Min(0)],
  productCount: [IsOptional(), IsInt(), Min(0)],
  location: [IsOptional(), IsObject(), ValidateNested(), Type(() => UpdateLocationCommand)],
});
class PaginatedOffsetQuery {
  limit;
  offset;
}
decorate(PaginatedOffsetQuery, {
  limit: [Type(() => Number), Max(100), IsPositive(), IsInt()],
  offset: [Type(() => Number), Min(0), IsInt()],
});
class PaginatedOffsetSearchQuery {
  pagination;
}
decorate(PaginatedOffsetSearchQuery, {
  pagination: [IsOptional(), Type(() => PaginatedOffsetQuery), ValidateNested()],
});
class ViewOrderIndexQuery extends PaginatedOffsetSearchQuery {
  sort;
  search;
  statuses;
}
decorate(ViewOrderIndexQuery, {
  sort: [Equals(undefined)],
  search: [IsOptional(), IsString(), IsNotEmpty()],
  statuses: [IsOptional(), IsArray(), ArrayMinSize(1), IsEnum(OrderStatus, { each: true })],
});
class RolePermissionsCommand {
  roleUuid;
  permissions;
}
decorate(RolePermissionsCommand, {
  roleUuid: [IsUUID()],
  permissions: [IsArray(), IsString({ each: true })],
});
class UpdateRolesPermissionsCommand {
  roles;
}
decorate(UpdateRolesPermissionsCommand, {
  roles: [IsArray(), ValidateNested({ each: true }), Type(() => RolePermissionsCommand)],
});
class InviteUserCommand {
  email;
  firstName;
  displayName() {
    return `${this.firstName} <${this.email}>`;
  }
}
decorate(InviteUserCommand, {
  email: [IsEmail(), IsUnusedEmail()],
  firstName: [IsString(), IsNotEmpty({ groups: ['named'] })],
});

/** ValidationPipe prefixes a nested message with the parent path, as `location.side ...`. */
const pipeMessage = (issue) => {
  const parents = (issue.path ?? []).slice(0, -1);
  return parents.length ? `${parents.map(String).join('.')}.${issue.message}` : issue.message;
};
async function throughPipe(nest, dto, payload, options, wire) {
  const pipe = new nest.ValidationPipe(options);
  const text = wire.stringify(payload);
  const received = text === undefined ? undefined : wire.parse(text);
  try {
    return {
      value: await pipe.transform(received, {
        type: wire === JSON ? 'body' : 'query',
        metatype: dto,
      }),
    };
  } catch (error) {
    assert.ok(error instanceof nest.BadRequestException, String(error));
    return { messages: [...error.getResponse().message].sort() };
  }
}
async function throughSchema(dto, payload, options, wire) {
  const result = await classValidatorSchema(dto, { ...options, wire, async: true })[
    '~standard'
  ].validate(payload);
  return result.issues
    ? { messages: result.issues.map(pipeMessage).sort() }
    : { value: result.value };
}

const withProtoKey = JSON.parse('{"__proto__": {"polluted": true}, "title": "Windows"}');
const cases = [
  ['nullable enums', UpdateLocationCommand, { side: 'front', floor: null }, true],
  ['an unknown enum value', UpdateLocationCommand, { side: 'left', floor: 'ground' }, false],
  [
    'a property that is not whitelisted',
    UpdateLocationCommand,
    { side: 'front', floor: null, extra: 1 },
    false,
  ],
  ['an empty optional command', CreateOrderCommand, {}, true],
  ['a trimmed title', CreateOrderCommand, { title: '  Windows  ', amountExcludingVat: null }, true],
  ['a title that is empty after trimming', CreateOrderCommand, { title: '   ' }, false],
  ['a nested command', CreateOrderCommand, { location: { side: 'back', floor: null } }, true],
  [
    'an invalid nested command',
    CreateOrderCommand,
    { location: { side: 'left', floor: null, extra: true } },
    false,
  ],
  [
    'dates and undefined fields',
    CreateOrderCommand,
    { title: 'Windows', productCount: undefined, createdAt: new Date(0) },
    false,
  ],
  ['prototype keys', CreateOrderCommand, withProtoKey, true],
  ['an absent payload', CreateOrderCommand, undefined, true],
  ['a primitive payload', CreateOrderCommand, 'text', true],
  ['a primitive payload for required fields', UpdateLocationCommand, 'text', false],
  ['an array payload', UpdateLocationCommand, [{ side: 'front', floor: null }], false],
  [
    'arrays of nested commands',
    UpdateRolesPermissionsCommand,
    { roles: [{ roleUuid: 'not-a-uuid', permissions: ['read', 1] }] },
    false,
  ],
  [
    'an async constraint',
    InviteUserCommand,
    { email: 'taken@example.com', firstName: 'Ada' },
    false,
  ],
  ['an empty query', ViewOrderIndexQuery, {}, true, qs],
  [
    'pagination through a query string',
    ViewOrderIndexQuery,
    { pagination: { limit: 5, offset: 10 }, statuses: ['new', 'paid'] },
    true,
    qs,
  ],
  ['an empty search', ViewOrderIndexQuery, { search: '' }, false, qs],
  [
    'invalid query values',
    ViewOrderIndexQuery,
    { sort: 'name', statuses: ['new', 'bogus'], pagination: { limit: 500, offset: -1 } },
    false,
    qs,
  ],
];
const trialPipe = { whitelist: true, forbidNonWhitelisted: true, transform: true };
const configurations = [
  ['a whitelisting transform pipe', trialPipe],
  ['the default pipe', { transform: false }],
  ['a whitelisting pipe without transform', { whitelist: true, transform: false }],
  [
    'a pipe with groups and an exception factory',
    { ...trialPipe, groups: ['named'], exceptionFactory: undefined },
  ],
  [
    'a pipe with implicit conversion',
    { transform: true, transformOptions: { enableImplicitConversion: true } },
  ],
];

for (const [version, nest] of [
  ['NestJS 11', nest11],
  ['NestJS 12', nest12],
]) {
  describe(`parity with ${version} ValidationPipe`, () => {
    for (const [label, options] of configurations) {
      describe(label, () => {
        for (const [name, dto, payload, valid, wire = JSON] of cases) {
          it(name, async () => {
            const expected = await throughPipe(nest, dto, payload, options, wire);
            const actual = await throughSchema(dto, payload, options, wire);
            // deepStrictEqual compares prototypes too: a DTO instance must match an instance.
            assert.deepStrictEqual(actual, expected);
            if (options === trialPipe) assert.equal('value' in actual, valid, name);
          });
        }
      });
    }
  });
}

const failure = (run) => {
  try {
    run();
  } catch (error) {
    if (error instanceof BuilderValidationError) return error;
    throw error;
  }
  assert.fail('Expected a validation failure');
};

describe('builders from the packed package', () => {
  const commands = fluent(
    fromClassValidator(
      CreateOrderCommand,
      () => ({ title: '  Windows  ', productCount: 2 }),
      trialPipe
    ),
    classValidatorFields(CreateOrderCommand)
  );

  it('builds payloads and the DTO instances the pipe passes on', () => {
    assert.deepEqual(commands.build(), { title: '  Windows  ', productCount: 2 });
    const command = commands.withProductCount(3).buildValidated();
    assert.ok(command instanceof CreateOrderCommand);
    assert.equal(command.describe(), 'Windows x3');
    assert.match(
      failure(() => commands.withTitle('   ').buildValidated()).message,
      /1 issue at title/
    );
    const nested = commands.withLocation({ side: 'left', floor: null });
    assert.match(failure(() => nested.buildValidated()).message, /location\.side/);
    assert.deepEqual([...classValidatorFields(CreateOrderCommand)].sort(), [
      'amountExcludingVat',
      'location',
      'productCount',
      'title',
    ]);
  });

  it('works next to entity builders from the core', () => {
    class Order {
      uuid;
      title;
      productCount;
      get label() {
        return `${this.title} x${this.productCount}`;
      }
    }
    const orders = fluent(
      createInstanceBuilder(Order, () => ({ uuid: 'o-1', title: 'Windows', productCount: 2 })),
      ['title', 'productCount']
    );
    const order = orders.withProductCount(5).build();
    const command = commands.withTitle(` ${order.title} `).buildValidated();
    assert.ok(order instanceof Order);
    assert.equal(order.label, 'Windows x5');
    assert.ok(command instanceof CreateOrderCommand);
    assert.equal(command.title, order.title);
    // Schema builders, including this adapter's, have no map(): the DTO is the output.
    assert.throws(() => fromClassValidator(CreateOrderCommand, () => ({})).map((value) => value));
  });

  it('reports array indexes as numbers', () => {
    const roles = fromClassValidator(UpdateRolesPermissionsCommand, () => ({
      roles: [{ roleUuid: 'nope', permissions: ['read', 1] }],
    }));
    const error = failure(() => roles.buildValidated());
    assert.deepEqual(
      error.issues.map((issue) => issue.path),
      [
        ['roles', 0, 'roleUuid'],
        ['roles', 0, 'permissions'],
      ]
    );
    assert.equal(
      formatValidationIssues(error),
      ['roles[0].roleUuid', 'roles[0].permissions'].join('\n')
    );
  });

  it('sends queries through qs', () => {
    const queries = fluent(
      fromClassValidator(ViewOrderIndexQuery, () => ({}), { ...trialPipe, wire: qs }),
      ['search', 'statuses', 'pagination']
    );
    const query = queries.withPagination({ limit: 5, offset: 10 }).buildValidated();
    assert.ok(query.pagination instanceof PaginatedOffsetQuery);
    assert.deepEqual({ ...query.pagination }, { limit: 5, offset: 10 });
    assert.match(failure(() => queries.withSearch('').buildValidated()).message, /at search/);
  });

  it('keeps payloads, transform: false, groups and default sessions', () => {
    const shared = { title: 'Windows', extra: true };
    const plain = fromClassValidator(CreateOrderCommand, () => shared, {
      transform: false,
      wire: false,
      maxListSize: 5,
    });
    assert.equal(plain.buildValidated(), shared);
    const whitelisted = fromClassValidator(CreateOrderCommand, () => shared, {
      transform: false,
      wire: false,
      whitelist: true,
    });
    // classToPlain() keeps the fields the DTO class declares, as the pipe returns them.
    assert.deepStrictEqual(whitelisted.buildValidated(), {
      title: 'Windows',
      amountExcludingVat: undefined,
      productCount: undefined,
      location: undefined,
    });
    const invite = fromClassValidator(
      InviteUserCommand,
      () => ({ email: 'ada@example.com', firstName: '' }),
      { strictGroups: true }
    );
    assert.ok(invite.buildValidated() instanceof InviteUserCommand);
    const named = invite.usingValidation({ libraryOptions: { groups: ['named'] } });
    assert.match(failure(() => named.buildValidated()).message, /firstName/);
    const identity = { fingerprint: 'class-validator/packed', provider: 'test@1', seed: 1 };
    const located = fromClassValidator(
      UpdateLocationCommand,
      (session) => ({ side: session.sequence('side') % 2 ? 'back' : 'front', floor: null }),
      { defaultSession: () => createSession(identity) }
    );
    assert.deepEqual(
      located.buildValidatedList(2).map((item) => item.side),
      ['front', 'back']
    );
    assert.throws(
      () => fromClassValidator(InviteUserCommand, () => ({}), { async: true }),
      /fromClassValidatorAsync/
    );
  });

  it('runs async constraints only in the async builder', async () => {
    const payload = () => ({ email: 'taken@example.com', firstName: 'Ada' });
    assert.ok(
      fromClassValidator(InviteUserCommand, payload).buildValidated() instanceof InviteUserCommand
    );
    const invites = fromClassValidatorAsync(InviteUserCommand, payload);
    await assert.rejects(invites.buildValidatedAsync(), /1 issue at email/);
    const free = await invites.with({ email: 'free@example.com' }).buildValidatedAsync();
    assert.equal(free.displayName(), 'Ada <free@example.com>');
    const schema = classValidatorSchema(InviteUserCommand, { async: true });
    assert.throws(
      () => createSchemaBuilder(schema, payload).buildValidated(),
      /buildValidatedAsync/
    );
  });

  it('validates as it is without a wire and leaves prototype keys of the built value alone', () => {
    const value = { title: 'Windows', constructor: 'kept' };
    const result = classValidatorSchema(CreateOrderCommand, { wire: false, transform: false })[
      '~standard'
    ].validate(value);
    assert.equal(result.value, value);
    assert.equal(value.constructor, 'kept');
    const absent = classValidatorSchema(CreateOrderCommand, { transform: false })['~standard'];
    assert.deepEqual(absent.validate(null), { value: null });
  });

  it('uses the application packages and checks what a configuration needs', async () => {
    const calls = [];
    const schema = classValidatorSchema(UpdateLocationCommand, {
      validatorPackage: {
        validate: classValidator.validate,
        validateSync(object, options) {
          calls.push('validateSync');
          return classValidator.validateSync(object, options);
        },
      },
      transformerPackage: {
        plainToInstance(cls, plain, options) {
          calls.push('plainToInstance');
          return classTransformer.plainToInstance(cls, plain, options);
        },
      },
    });
    createSchemaBuilder(schema, () => ({ side: null, floor: null })).buildValidated();
    assert.deepEqual(calls, ['plainToInstance', 'validateSync']);
    assert.throws(
      () =>
        classValidatorSchema(UpdateLocationCommand, {
          validatorPackage: { validate: classValidator.validate },
        }),
      /needs validateSync/
    );
    const asyncOnly = classValidatorSchema(UpdateLocationCommand, {
      async: true,
      validatorPackage: {
        validate: (object, options) => classValidator.validateSync(object, options),
      },
    });
    const resolved = await asyncOnly['~standard'].validate({ side: null, floor: null });
    assert.ok(resolved.value instanceof UpdateLocationCommand);
    const noPlain = classValidatorSchema(UpdateLocationCommand, {
      transform: false,
      whitelist: true,
      transformerPackage: { plainToInstance: classTransformer.plainToInstance },
    });
    assert.throws(() => noPlain['~standard'].validate({ side: null, floor: null }), /classToPlain/);
    const modern = classValidatorSchema(UpdateLocationCommand, {
      transform: false,
      whitelist: true,
      transformerPackage: {
        plainToInstance: classTransformer.plainToInstance,
        instanceToPlain: classTransformer.instanceToPlain,
      },
    });
    assert.deepEqual(modern['~standard'].validate({ side: null, floor: 'first' }), {
      value: { side: null, floor: 'first' },
    });
  });

  it('rejects invalid arguments and reports bare or deep error trees', () => {
    assert.throws(() => classValidatorSchema(undefined), /requires a DTO class/);
    assert.throws(() => classValidatorSchema(CreateOrderCommand, { wire: {} }), /wire must be/);
    assert.throws(() => classValidatorFields({}), /requires a DTO class/);
    class NeedsArguments {
      constructor(value) {
        if (value === undefined) throw new Error('value is required');
      }
    }
    assert.throws(() => classValidatorFields(NeedsArguments), /without arguments/);
    const rejecting = (errors) =>
      classValidatorSchema(UpdateLocationCommand, {
        validatorPackage: { validate: async () => errors, validateSync: () => errors },
      })['~standard'].validate({});
    const bare = Object.assign(new ValidationError(), { property: 'x', children: [] });
    assert.deepEqual(rejecting([bare]), {
      issues: [{ message: 'class-validator rejected the value', path: [] }],
    });
    let deep = Object.assign(new ValidationError(), {
      property: 'leaf',
      constraints: { a: 'bad' },
    });
    for (let depth = 0; depth < 300; depth++) {
      deep = Object.assign(new ValidationError(), { property: 'x', children: [deep] });
    }
    assert.equal(rejecting([deep]).issues[0].message, 'Validation errors are nested too deeply');
  });
});
