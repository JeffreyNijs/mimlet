/** Entities shaped like a NestJS + TypeORM application: decorators, a getter, relations. */
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from './typeorm-like.js';

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

@Entity()
export class Role {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'varchar', array: true })
  permissions: string[];

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;
}

@Entity()
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'uuid' })
  userUuid: string;

  @ManyToOne(() => User)
  user?: Relation<User>;

  @Column({ type: 'uuid' })
  roleUuid: string;

  @ManyToOne(() => Role)
  role?: Relation<Role>;
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', unique: true })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @OneToMany(() => UserRole, (role: UserRole) => role.user)
  userRoles?: Array<Relation<UserRole>>;

  get fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(' ');
  }

  hasPermission(permission: string): boolean {
    return (this.userRoles ?? []).some((link) => link.role?.permissions.includes(permission));
  }
}

/** A row imported from another system, with a unique external id. */
@Entity()
export class ImportedCustomer {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', unique: true })
  externalId: string;

  @Column({ type: 'varchar' })
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', default: 'import' })
  source: 'import' | 'manual';
}

/** A value object whose constructor requires its arguments. */
export class Money {
  constructor(
    readonly amount: number,
    readonly currency: string
  ) {
    if (!Number.isFinite(amount)) {
      throw new TypeError('amount must be a finite number');
    }
  }

  format(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }
}
