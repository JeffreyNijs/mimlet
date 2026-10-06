/**
 * The bridge must accept and reject exactly what NestJS 11's ValidationPipe does, and return
 * the same value. Each case runs the real pipe (configured as a typical global pipe, and with
 * its defaults) and the Standard Schema on the same payload.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import qs from 'qs';
import type * as Nest from '@nestjs/common';
import type { StandardSchemaV1 } from '@mimlet/core';
import { classValidatorSchema, type ClassValidatorSchemaOptions, type Wire } from '../src/index.js';
import {
  CreateOrderCommand,
  InviteUserCommand,
  UpdateLocationCommand,
  UpdateRolesPermissionsCommand,
  ViewOrderIndexQuery,
} from './fixture/dtos.js';
import { validationPipeOptions } from './fixture/builders.js';

const require = createRequire(import.meta.url);
const nest = require('@nestjs/common') as typeof Nest;

type Outcome = { readonly value: unknown } | { readonly messages: readonly string[] };
type PipeOptions = ConstructorParameters<typeof nest.ValidationPipe>[0];

async function throughPipe(
  dto: new () => object,
  payload: unknown,
  options: PipeOptions,
  wire: Wire
): Promise<Outcome> {
  const pipe = new nest.ValidationPipe(options);
  const text = wire.stringify(payload as never);
  const received = text === undefined ? undefined : wire.parse(text);
  try {
    return {
      value: await pipe.transform(received, {
        type: wire === JSON ? 'body' : 'query',
        metatype: dto as never,
      }),
    };
  } catch (error) {
    const response = (error as InstanceType<typeof nest.BadRequestException>).getResponse() as {
      message: string[];
    };
    return { messages: [...response.message].sort() };
  }
}

/** ValidationPipe prefixes a nested message with the parent path, as `location.facade ...`. */
function pipeMessage(issue: StandardSchemaV1.Issue): string {
  const parents = (issue.path ?? []).slice(0, -1);
  return parents.length ? `${parents.map(String).join('.')}.${issue.message}` : issue.message;
}

async function throughSchema(
  dto: new () => object,
  payload: unknown,
  options: ClassValidatorSchemaOptions
): Promise<Outcome> {
  const result = await classValidatorSchema(dto, { ...options, async: true })['~standard'].validate(
    payload
  );
  return result.issues
    ? { messages: result.issues.map(pipeMessage).sort() }
    : { value: result.value };
}

interface Case {
  readonly name: string;
  readonly dto: new () => object;
  readonly payload: unknown;
  readonly valid: boolean;
  readonly wire?: Wire;
}
const withProtoKey = JSON.parse('{"__proto__": {"polluted": true}, "title": "Windows"}') as object;
const cases: readonly Case[] = [
  {
    name: 'nullable enums',
    dto: UpdateLocationCommand,
    payload: { side: 'front', floor: null },
    valid: true,
  },
  {
    name: 'an unknown enum value',
    dto: UpdateLocationCommand,
    payload: { side: 'left', floor: 'ground' },
    valid: false,
  },
  {
    name: 'a property that is not whitelisted',
    dto: UpdateLocationCommand,
    payload: { side: 'front', floor: null, extra: 1 },
    valid: false,
  },
  { name: 'an empty optional command', dto: CreateOrderCommand, payload: {}, valid: true },
  {
    name: 'a trimmed title',
    dto: CreateOrderCommand,
    payload: { title: '  Windows  ', amountExcludingVat: null },
    valid: true,
  },
  {
    name: 'a title that is empty after trimming',
    dto: CreateOrderCommand,
    payload: { title: '   ' },
    valid: false,
  },
  {
    name: 'a nested command',
    dto: CreateOrderCommand,
    payload: { location: { side: 'back', floor: null } },
    valid: true,
  },
  {
    name: 'an invalid nested command',
    dto: CreateOrderCommand,
    payload: { location: { side: 'left', floor: null, extra: true } },
    valid: false,
  },
  {
    name: 'dates and undefined fields on the JSON wire',
    dto: CreateOrderCommand,
    payload: { title: 'Windows', productCount: undefined, createdAt: new Date(0) },
    valid: false,
  },
  { name: 'prototype keys', dto: CreateOrderCommand, payload: withProtoKey, valid: true },
  { name: 'an absent payload', dto: CreateOrderCommand, payload: undefined, valid: true },
  {
    name: 'arrays of nested commands',
    dto: UpdateRolesPermissionsCommand,
    payload: { roles: [{ roleUuid: 'not-a-uuid', permissions: ['read', 1] }] },
    valid: false,
  },
  { name: 'an empty query', dto: ViewOrderIndexQuery, payload: {}, valid: true, wire: qs },
  {
    name: 'pagination through a query string',
    dto: ViewOrderIndexQuery,
    payload: { pagination: { limit: 5, offset: 10 }, statuses: ['new', 'paid'] },
    valid: true,
    wire: qs,
  },
  {
    name: 'an empty search',
    dto: ViewOrderIndexQuery,
    payload: { search: '' },
    valid: false,
    wire: qs,
  },
  {
    name: 'invalid query values',
    dto: ViewOrderIndexQuery,
    payload: { sort: 'name', statuses: ['new', 'bogus'], pagination: { limit: 500, offset: -1 } },
    valid: false,
    wire: qs,
  },
  {
    name: 'an async constraint',
    dto: InviteUserCommand,
    payload: { email: 'taken@example.com', firstName: 'Ada' },
    valid: false,
  },
];
const configurations: readonly [string, PipeOptions & ClassValidatorSchemaOptions][] = [
  ['a whitelisting transform pipe', validationPipeOptions],
  ['the default pipe', { transform: false }],
  ['a whitelisting pipe without transform', { whitelist: true, transform: false }],
];

describe('parity with NestJS ValidationPipe', () => {
  for (const [label, options] of configurations) {
    describe(label, () => {
      for (const { name, dto, payload, valid, wire = JSON } of cases) {
        it(name, async () => {
          const expected = await throughPipe(dto, payload, options, wire);
          const actual = await throughSchema(dto, payload, { ...options, wire });
          // deepStrictEqual also compares prototypes, so a DTO instance must match an instance.
          assert.deepStrictEqual(actual, expected);
          if (label === 'a whitelisting transform pipe') {
            assert.equal('value' in actual, valid);
          }
        });
      }
    });
  }
});
