import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as transformer from 'class-transformer';
import * as validator from 'class-validator';
import { BuilderValidationError, createSchemaBuilder, formatValidationIssues } from '@mimlet/core';
import { classValidatorSchema, fromClassValidator, toIssues } from '../src/index.js';
import {
  createOrderCommandBuilder,
  updateLocationCommandBuilder,
  validationPipeOptions,
  viewOrderIndexQueryBuilder,
} from './fixture/builders.js';
import {
  CreateOrderCommand,
  InviteUserCommand,
  OrderStatus,
  PaginatedOffsetQuery,
  Side,
  UpdateLocationCommand,
  UpdateRolesPermissionsCommand,
  ViewOrderIndexQuery,
} from './fixture/dtos.js';

describe('DTO builders', () => {
  it('builds the payload for e2e tests and the DTO instance for unit tests', () => {
    const builder = updateLocationCommandBuilder.withSide(Side.BACK);
    assert.deepStrictEqual(builder.build(), { side: 'back', floor: 'ground' });
    const command = builder.buildValidated();
    assert.ok(command instanceof UpdateLocationCommand);
    assert.equal(command.side, Side.BACK);
    // The base builder is unchanged.
    assert.equal(updateLocationCommandBuilder.build().side, 'front');
  });

  it('names the rejected fields in BuilderValidationError', () => {
    const blank = viewOrderIndexQueryBuilder.withSearch('');
    assert.doesNotThrow(() => blank.build());
    assert.throws(() => blank.buildValidated(), BuilderValidationError);
    assert.throws(() => blank.buildValidated(), /1 issue at search/);
    const nested = createOrderCommandBuilder.withLocation({
      side: 'left' as Side,
      floor: null,
    });
    assert.throws(() => nested.buildValidated(), /1 issue at location\.side/);
    const extra = updateLocationCommandBuilder.with({ unknown: 1 } as never);
    assert.throws(() => extra.buildValidated(), /1 issue at unknown/);
  });

  it('maps nested arrays to indexed paths', () => {
    const roles = fromClassValidator(UpdateRolesPermissionsCommand, () => ({
      roles: [
        { roleUuid: '0b9f6c1e-8a4d-4c55-9a39-0f3d1a2b3c4d', permissions: ['read'] },
        { roleUuid: 'nope', permissions: ['read', 1 as unknown as string] },
      ],
    }));
    let caught: unknown;
    try {
      roles.buildValidated();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof BuilderValidationError);
    assert.equal(
      formatValidationIssues(caught, { messages: true }),
      [
        'roles[1].roleUuid: roleUuid must be a UUID',
        'roles[1].permissions: each value in permissions must be a string',
      ].join('\n')
    );
  });

  it('sends queries through the query string before validating', () => {
    const query = viewOrderIndexQueryBuilder
      .withPagination({ limit: 5, offset: 10 })
      .withStatuses([OrderStatus.NEW])
      .buildValidated();
    assert.ok(query instanceof ViewOrderIndexQuery);
    assert.ok(query.pagination instanceof PaginatedOffsetQuery);
    assert.deepStrictEqual({ ...query.pagination }, { limit: 5, offset: 10 });
    // On the JSON wire, the same numbers stay numbers; class-transformer converts nothing.
    const body = fromClassValidator(ViewOrderIndexQuery, () => ({
      pagination: { limit: 5, offset: 10 },
    }));
    assert.equal(body.buildValidated().pagination?.limit, 5);
  });

  it('keeps fields generated from the class-validator metadata', () => {
    const command = createOrderCommandBuilder
      .withTitle('  Windows  ')
      .withProductCount(2)
      .buildValidated();
    assert.ok(command instanceof CreateOrderCommand);
    assert.equal(command.title, 'Windows');
    assert.equal(createOrderCommandBuilder.withTitle('  Windows  ').build().title, '  Windows  ');
  });

  it('runs async constraints only in async mode', async () => {
    const payload = () => ({ email: 'taken@example.com', firstName: 'Ada' });
    const sync = fromClassValidator(InviteUserCommand, payload);
    assert.equal(sync.buildValidated().displayName(), 'Ada <taken@example.com>');
    const asynchronous = fromClassValidator(InviteUserCommand, payload, { async: true });
    assert.throws(() => asynchronous.buildValidated(), /buildValidatedAsync/);
    await assert.rejects(asynchronous.buildValidatedAsync(), /1 issue at email/);
    const free = await asynchronous.with({ email: 'free@example.com' }).buildValidatedAsync();
    assert.ok(free instanceof InviteUserCommand);
  });

  it('takes validation groups per build', () => {
    // As in class-validator, constraints with groups run when no groups are given...
    const payload = () => ({ email: 'ada@example.com', firstName: '' });
    assert.throws(
      () => fromClassValidator(InviteUserCommand, payload).buildValidated(),
      /firstName/
    );
    // ...unless strictGroups skips them; then usingValidation() selects groups per build.
    const invite = fromClassValidator(InviteUserCommand, payload, { strictGroups: true });
    assert.doesNotThrow(() => invite.buildValidated());
    const named = invite.usingValidation({ libraryOptions: { groups: ['named'] } });
    assert.throws(() => named.buildValidated(), /1 issue at firstName/);
  });

  it('validates the value as it is without a wire', () => {
    const date = new Date(0);
    const schema = classValidatorSchema(CreateOrderCommand, { wire: false });
    const payload = { title: 'Windows', [Symbol('kept')]: true };
    const result = schema['~standard'].validate(payload);
    assert.ok(!(result instanceof Promise) && result.issues === undefined);
    assert.ok(result.value instanceof CreateOrderCommand);
    // With the JSON wire, a Date is an ISO string by the time the pipe sees it.
    const viaJson = classValidatorSchema(CreateOrderCommand)['~standard'].validate({
      title: date,
    });
    assert.ok(!(viaJson instanceof Promise) && viaJson.issues === undefined);
    assert.equal(viaJson.value.title, '1970-01-01T00:00:00.000Z');
    // A primitive payload is not a DTO.
    const primitive = classValidatorSchema(CreateOrderCommand, { wire: false })[
      '~standard'
    ].validate('text');
    assert.ok(!(primitive instanceof Promise) && primitive.issues?.length === 1);
  });

  it('uses the packages the application passes', () => {
    const calls: string[] = [];
    const schema = classValidatorSchema(UpdateLocationCommand, {
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
        instanceToPlain: transformer.instanceToPlain,
      },
    });
    createSchemaBuilder(schema, () => ({ side: null, floor: null })).buildValidated();
    assert.deepEqual(calls, ['plainToInstance', 'validateSync']);
  });

  it('rejects a missing class and reports errors without constraints', () => {
    assert.throws(() => classValidatorSchema(undefined as never), /requires a DTO class/);
    assert.deepEqual(toIssues([]), []);
    const bare = Object.assign(new validator.ValidationError(), { property: 'x', children: [] });
    assert.deepEqual(toIssues([bare]), [
      { message: 'class-validator rejected the value', path: [] },
    ]);
    assert.equal(validationPipeOptions.transform, true);
  });
});
