import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  importedCustomerBuilder,
  moneyBuilder,
  roleBuilder,
  testSession,
  userBuilder,
  userWithRoleScenario,
  withLoadedRoles,
} from './fixture/builders.js';
import { ImportedCustomer, Money, Role, User, UserRole, UserStatus } from './fixture/entities.js';
import { columnsOf, metadataArgs } from './fixture/typeorm-like.js';

describe('entity builders that build into classes', () => {
  it('builds entity instances whose getters and methods work', () => {
    const user = userBuilder.withFirstName('Ada').withLastName('Lovelace').build();
    assert.ok(user instanceof User);
    assert.equal(user.fullName, 'Ada Lovelace');
    assert.equal(user.hasPermission('read'), false);
    // Like TypeORM's `new User()`, every declared field exists, also those left unset.
    assert.deepEqual(Object.keys(user), [
      'uuid',
      'userId',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'status',
      'email',
      'firstName',
      'lastName',
      'userRoles',
    ]);
    assert.equal(user.userRoles, undefined);
  });

  it('keeps the decorator metadata and the base builder unchanged', () => {
    const blocked = userBuilder.withStatus(UserStatus.BLOCKED).build();
    assert.equal(blocked.status, UserStatus.BLOCKED);
    assert.equal(userBuilder.build().status, UserStatus.ACTIVE);
    assert.ok(metadataArgs.tables.includes(User));
    assert.ok(columnsOf(User).includes('email'));
    assert.equal(columnsOf(User).includes('fullName'), false);
  });

  it('rejects a value for a computed getter', () => {
    assert.throws(
      () => userBuilder.with({ fullName: 'Ada' }).build(),
      /fullName is computed by User/
    );
  });

  it('runs transforms on the instance after every patch', () => {
    const admin = roleBuilder.withPermissions(['read', 'write']).build();
    const user = userBuilder
      .transform(withLoadedRoles(admin))
      .withUuid('3a0b8f0e-0000-4000-8000-000000000001')
      .build();
    assert.ok(user.userRoles?.[0] instanceof UserRole);
    assert.equal(user.userRoles[0].userUuid, '3a0b8f0e-0000-4000-8000-000000000001');
    assert.ok(user.userRoles[0].role instanceof Role);
    assert.equal(user.hasPermission('write'), true);
  });

  it('draws sequences from the default or a shared session', () => {
    const listed = importedCustomerBuilder.buildList(2);
    assert.ok(listed.every((customer) => customer instanceof ImportedCustomer));
    assert.deepEqual(
      listed.map((customer) => customer.externalId),
      ['customer-1', 'customer-2']
    );
    const session = testSession('distinct');
    assert.notEqual(
      importedCustomerBuilder.build(session).externalId,
      importedCustomerBuilder.build(session).externalId
    );
    assert.equal(importedCustomerBuilder.withSource('manual').build().source, 'manual');
  });

  it('creates value objects without running their constructor', () => {
    const money = moneyBuilder.with({ amount: 12.5 }).build();
    assert.ok(money instanceof Money);
    assert.equal(money.format(), '12.50 EUR');
  });

  it('composes class builders in scenarios', () => {
    const { user, role, userRole } = userWithRoleScenario.build(testSession());
    assert.ok(user instanceof User && role instanceof Role && userRole instanceof UserRole);
    assert.equal(userRole.userUuid, user.uuid);
    assert.equal(userRole.roleUuid, role.uuid);
  });
});
