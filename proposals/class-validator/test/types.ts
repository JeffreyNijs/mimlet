// Compile-only checks (tsc -p tsconfig.test.json). Nothing here runs.
import qs from 'qs';
import { createSchemaBuilder, fluent } from '@mimlet/core';
import {
  classValidatorFields,
  classValidatorSchema,
  fromClassValidator,
  type DtoInput,
} from '../src/index.js';
import {
  CreateOrderCommand,
  InviteUserCommand,
  Side,
  UpdateLocationCommand,
  ViewOrderIndexQuery,
  type Floor,
  type OrderStatus,
} from './fixture/dtos.js';

type Equal<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
declare function expectExact<A, B>(proof: Equal<A, B>): void;
declare function expectType<T>(value: T): void;

// Methods and `never` fields are not part of the payload; nested DTOs become payloads too.
expectExact<DtoInput<InviteUserCommand>, { email: string; firstName: string }>(true);
expectExact<
  DtoInput<ViewOrderIndexQuery>,
  {
    search?: string;
    statuses?: OrderStatus[];
    pagination?: { limit: number; offset: number };
  }
>(true);
expectExact<
  DtoInput<CreateOrderCommand>['location'],
  { side: Side | null; floor: Floor | null } | undefined
>(true);

// build() is the payload, buildValidated() the DTO instance.
const location = fromClassValidator(UpdateLocationCommand, () => ({
  side: Side.FRONT,
  floor: null,
}));
expectType<DtoInput<UpdateLocationCommand>>(location.build());
expectType<UpdateLocationCommand>(location.buildValidated());
// @ts-expect-error The factory is checked against the payload type.
fromClassValidator(UpdateLocationCommand, () => ({ side: 'left', floor: null }));
fromClassValidator(UpdateLocationCommand, () => ({ side: null, floor: null }), {
  // @ts-expect-error fromClassValidator() always returns the instance.
  transform: false,
});

// With transform: false, the validated output is the plain payload.
const _plain = createSchemaBuilder(
  classValidatorSchema(InviteUserCommand, { transform: false }),
  () => ({ email: 'ada@example.com', firstName: 'Ada' })
).buildValidated();
expectExact<typeof _plain, DtoInput<InviteUserCommand>>(true);

// qs is a wire; so is JSON.
classValidatorSchema(ViewOrderIndexQuery, { wire: qs });
classValidatorSchema(ViewOrderIndexQuery, { wire: JSON, whitelist: true });

// Setters from the class-validator metadata are typed by the payload.
const created = fluent(
  fromClassValidator(CreateOrderCommand, () => ({})),
  classValidatorFields(CreateOrderCommand)
);
created.withTitle('Windows').withProductCount(2).withLocation({ side: null, floor: null });
// @ts-expect-error Setters keep the field type.
created.withProductCount('2');
