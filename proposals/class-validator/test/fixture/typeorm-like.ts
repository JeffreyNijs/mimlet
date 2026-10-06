/**
 * Decorators shaped like TypeORM's: they record metadata about a class and never touch its
 * instances. The tests check that building into a class keeps this metadata intact and that
 * the built instances look like the ones TypeORM creates (`new Entity()`, then the columns).
 */
/** Any class, as TypeORM's metadata storage records it. */
type Target = object;
interface ColumnArgs {
  readonly target: Target;
  readonly propertyName: string;
  readonly kind: string;
  readonly options: Readonly<Record<string, unknown>>;
}
interface RelationArgs {
  readonly target: Target;
  readonly propertyName: string;
  readonly kind: 'one-to-many' | 'many-to-one';
  readonly type: () => Target;
}
export const metadataArgs = {
  tables: [] as Target[],
  columns: [] as ColumnArgs[],
  relations: [] as RelationArgs[],
};

export function Entity(): ClassDecorator {
  return (target) => {
    metadataArgs.tables.push(target);
  };
}
function column(kind: string, options: Record<string, unknown> = {}): PropertyDecorator {
  return (prototype, propertyName) => {
    metadataArgs.columns.push({
      target: prototype.constructor,
      propertyName: String(propertyName),
      kind,
      options,
    });
  };
}
export const Column = (options?: Record<string, unknown>) => column('regular', options);
export const PrimaryGeneratedColumn = (strategy = 'uuid') => column('primary', { strategy });
export const CreateDateColumn = () => column('createDate');
export const UpdateDateColumn = () => column('updateDate');
export const DeleteDateColumn = () => column('deleteDate');
export const Index = (): PropertyDecorator => () => {};
function relation(kind: RelationArgs['kind'], type: () => Target): PropertyDecorator {
  return (prototype, propertyName) => {
    metadataArgs.relations.push({
      target: prototype.constructor,
      propertyName: String(propertyName),
      kind,
      type,
    });
  };
}
export const OneToMany = (type: () => Target, _inverse?: (entity: never) => unknown) =>
  relation('one-to-many', type);
export const ManyToOne = (type: () => Target) => relation('many-to-one', type);
/** TypeORM's `Relation<T>` wrapper type, which exists for ESM circular imports. */
export type Relation<T> = T;

export function columnsOf(target: Target): string[] {
  return metadataArgs.columns
    .filter((column) => column.target === target)
    .map((column) => column.propertyName);
}
