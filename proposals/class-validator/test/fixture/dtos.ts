/** class-validator DTOs shaped like a typical NestJS API's commands and queries. */
import { Transform, Type } from 'class-transformer';
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
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

/** A `ValidateIf` wrapper, as validator libraries offer it: null skips the other constraints. */
export function IsNullable(options?: ValidationOptions): PropertyDecorator {
  return ValidateIf((_object, value) => value !== null, options);
}

/** An async constraint, as a uniqueness check against a database would be. */
export const takenEmails = new Set<string>(['taken@example.com']);
export function IsUnusedEmail(): PropertyDecorator {
  return (prototype, propertyName) => {
    registerDecorator({
      name: 'isUnusedEmail',
      target: prototype.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} is already in use` },
      validator: {
        validate: async (value: unknown) => {
          await Promise.resolve();
          return typeof value === 'string' && !takenEmails.has(value);
        },
      },
    });
  };
}

export enum Side {
  FRONT = 'front',
  BACK = 'back',
}
export enum Floor {
  GROUND = 'ground',
  FIRST = 'first',
}
export enum OrderStatus {
  NEW = 'new',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export class UpdateLocationCommand {
  @IsNullable()
  @IsEnum(Side)
  side: Side | null;

  @IsNullable()
  @IsEnum(Floor)
  floor: Floor | null;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateOrderCommand {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsNullable()
  @IsNumber()
  @Min(0)
  amountExcludingVat?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  productCount?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateLocationCommand)
  location?: UpdateLocationCommand;
}

/** An offset pagination query, as pagination libraries offer it: numbers arrive as strings. */
export class PaginatedOffsetQuery {
  @Type(() => Number)
  @Max(100)
  @IsPositive()
  @IsInt()
  limit: number;

  @Type(() => Number)
  @Min(0)
  @IsInt()
  offset: number;
}
export abstract class PaginatedOffsetSearchQuery {
  @IsOptional()
  @Type(() => PaginatedOffsetQuery)
  @ValidateNested()
  pagination?: PaginatedOffsetQuery;
}

export class ViewOrderIndexQuery extends PaginatedOffsetSearchQuery {
  @Equals(undefined)
  sort?: never;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  search?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];
}

export class RolePermissionsCommand {
  @IsUUID()
  roleUuid: string;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
export class UpdateRolesPermissionsCommand {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionsCommand)
  roles: RolePermissionsCommand[];
}

export class InviteUserCommand {
  @IsEmail()
  @IsUnusedEmail()
  email: string;

  @IsString()
  @IsNotEmpty({ groups: ['named'] })
  firstName: string;

  /** A method on a DTO is not part of its payload. */
  displayName(): string {
    return `${this.firstName} <${this.email}>`;
  }
}
