/**
 * Builders written the way an application would write them with the prototype: entities with
 * `createInstanceBuilder(Entity, factory)`, DTOs with `fromClassValidator()`. See
 * docs/proposals/class-instances.md.
 */
import { randomUUID } from 'node:crypto';
import qs from 'qs';
import {
  createInstanceBuilder,
  createScenario,
  createSession,
  fluent,
  type GenerationSession,
} from '@mimlet/core';
import { classValidatorFields, fromClassValidator } from '../../src/index.js';
import {
  CreateOrderCommand,
  Floor,
  Side,
  UpdateLocationCommand,
  ViewOrderIndexQuery,
} from './dtos.js';
import { ImportedCustomer, Money, Role, User, UserRole, UserStatus } from './entities.js';

export function testSession(seed: string | number = 1): GenerationSession {
  return createSession({ fingerprint: 'proposal/class-validator', provider: 'test@1', seed });
}

/** The options of the application's global ValidationPipe, shared with the tests. */
export const validationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
} as const;

export const roleBuilder = fluent(
  createInstanceBuilder(Role, () => ({
    uuid: randomUUID(),
    name: `role-${randomUUID()}`,
    permissions: ['read'],
    isDefault: false,
  })),
  ['uuid', 'name', 'permissions', 'isDefault']
);

export const userRoleBuilder = fluent(
  createInstanceBuilder(UserRole, () => ({
    uuid: randomUUID(),
    userUuid: randomUUID(),
    roleUuid: randomUUID(),
  })),
  ['userUuid', 'roleUuid', 'role']
);

export const userBuilder = fluent(
  createInstanceBuilder(User, () => ({
    uuid: randomUUID(),
    userId: randomUUID(),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    status: UserStatus.ACTIVE,
    email: `${randomUUID()}@mail.com`,
    firstName: 'John',
    lastName: 'Doe',
  })),
  {
    withUuid: 'uuid',
    withId: 'userId',
    withEmail: 'email',
    withFirstName: 'firstName',
    withLastName: 'lastName',
    withStatus: 'status',
    withDeletedAt: 'deletedAt',
    withUserRoles: 'userRoles',
  }
);

/** Loads `userRoles` (and each link's role) as a repository would, after the patches. */
export function withLoadedRoles(...roles: Role[]): (user: User) => User {
  return (user) =>
    Object.assign(user, {
      userRoles: roles.map((role) =>
        userRoleBuilder.withUserUuid(user.uuid).withRoleUuid(role.uuid).withRole(role).build()
      ),
    });
}

/** `externalId` is unique, so it comes from a session sequence. */
export const importedCustomerBuilder = fluent(
  createInstanceBuilder(
    ImportedCustomer,
    (session: GenerationSession = testSession()) => {
      const number = session.sequence('imported-customer', 1);
      return {
        uuid: randomUUID(),
        externalId: `customer-${number}`,
        reference: `C-${number}`,
        city: null,
        // A string-literal column: the class-first form keeps the literal type.
        source: 'import',
      };
    },
    { defaultSession: testSession }
  ),
  ['externalId', 'reference', 'city', 'source']
);

export const moneyBuilder = createInstanceBuilder(Money, () => ({ amount: 10, currency: 'EUR' }), {
  construct: 'prototype',
});

export const userWithRoleScenario = createScenario({ name: 'user-with-role' })
  .node('role', [], () => roleBuilder.build())
  .node('user', [], () => userBuilder.build())
  .node('userRole', ['user', 'role'], ({ user, role }) =>
    userRoleBuilder.withUserUuid(user.uuid).withRoleUuid(role.uuid).build()
  );

export const updateLocationCommandBuilder = fluent(
  fromClassValidator(
    UpdateLocationCommand,
    () => ({ side: Side.FRONT, floor: Floor.GROUND }),
    validationPipeOptions
  ),
  ['side', 'floor']
);

/** Every field is optional, so the default payload is empty. */
export const createOrderCommandBuilder = fluent(
  fromClassValidator(CreateOrderCommand, () => ({}), validationPipeOptions),
  classValidatorFields(CreateOrderCommand)
);

export const viewOrderIndexQueryBuilder = fluent(
  fromClassValidator(ViewOrderIndexQuery, () => ({}), { ...validationPipeOptions, wire: qs }),
  ['search', 'statuses', 'pagination']
);
