import qs from 'qs';
import {
  createSchemaBuilder,
  fluent,
  type AsyncSchemaBuilder,
  type SchemaBuilder,
} from '@mimlet/core';
import {
  classValidatorFields,
  classValidatorSchema,
  fromClassValidator,
  fromClassValidatorAsync,
  type AsyncClassValidatorBuilder,
  type ClassValidatorBuilder,
  type DtoClass,
  type DtoInput,
} from '@mimlet/class-validator';

declare function expectType<T>(value: T): void;
type Equal<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
declare function expectExact<A, B>(proof: Equal<A, B>): void;

enum Side {
  FRONT = 'front',
  BACK = 'back',
}
class UpdateLocationCommand {
  side!: Side | null;
  floor!: number | null;
}
class CreateOrderCommand {
  readonly title?: string;
  productCount?: number;
  location?: UpdateLocationCommand;
  tags?: readonly string[];
  sort?: never;
  describe(): string {
    return String(this.title);
  }
}

// The payload: data fields only, recursively, without `readonly`, methods or `never` fields.
expectExact<
  DtoInput<CreateOrderCommand>,
  {
    title?: string;
    productCount?: number;
    location?: { side: Side | null; floor: number | null };
    tags?: string[];
  }
>(true);

const factory = () => ({ title: 'Windows', productCount: 2 });
const orders = fromClassValidator(CreateOrderCommand, factory, { whitelist: true });
expectExact<typeof orders, ClassValidatorBuilder<CreateOrderCommand, typeof factory>>(true);
expectExact<typeof orders, SchemaBuilder<DtoInput<CreateOrderCommand>, CreateOrderCommand, []>>(
  true
);
expectType<DtoInput<CreateOrderCommand>>(orders.build());
expectType<CreateOrderCommand>(orders.buildValidated());
orders.buildValidated().describe();
// @ts-expect-error The factory is checked against the payload.
fromClassValidator(UpdateLocationCommand, () => ({ side: 'left', floor: null }));
// @ts-expect-error Patches cannot set methods.
orders.with({ describe: () => '' });
// @ts-expect-error Async validation has its own entry point.
fromClassValidator(CreateOrderCommand, factory, { async: true });

const plain = fromClassValidator(CreateOrderCommand, factory, { transform: false });
expectExact<ReturnType<typeof plain.buildValidated>, DtoInput<CreateOrderCommand>>(true);
const schema = classValidatorSchema(CreateOrderCommand, { transform: false, wire: qs });
expectExact<
  ReturnType<typeof createSchemaBuilder<typeof schema, typeof factory>>['buildValidated'],
  () => DtoInput<CreateOrderCommand>
>(true);

const invites = fromClassValidatorAsync(CreateOrderCommand, factory);
expectExact<typeof invites, AsyncClassValidatorBuilder<CreateOrderCommand, typeof factory>>(true);
expectExact<
  typeof invites,
  AsyncSchemaBuilder<DtoInput<CreateOrderCommand>, CreateOrderCommand, []>
>(true);
// @ts-expect-error Only async build methods exist.
invites.buildValidated();

// Factory arguments and setters from the metadata.
const located = fluent(
  fromClassValidator(UpdateLocationCommand, (side: Side = Side.FRONT) => ({ side, floor: null })),
  classValidatorFields(UpdateLocationCommand)
);
expectType<UpdateLocationCommand>(located.withFloor(2).buildValidated(Side.BACK));
// @ts-expect-error Setters keep the field type.
located.withFloor('2');

// A generic helper keeps its types.
function commandBuilder<T extends object>(dto: DtoClass<T>, make: () => DtoInput<T>) {
  return fluent(fromClassValidator(dto, make), classValidatorFields(dto));
}
expectType<UpdateLocationCommand>(
  commandBuilder(UpdateLocationCommand, () => ({ side: null, floor: 1 })).buildValidated()
);
classValidatorSchema(CreateOrderCommand, { wire: JSON });
classValidatorSchema(CreateOrderCommand, { wire: false });
