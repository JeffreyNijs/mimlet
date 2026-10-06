import { BuilderValidationError, createSchemaBuilder, createSession } from '@mimlet/core';
import type {
  GenerationSession,
  SchemaBuilder,
  SessionKey,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import { object, snapshot, type ContractOptions } from './document.js';
export interface FixturePart {
  readonly group: string;
  readonly name?: string;
  readonly required: boolean;
  readonly adapter: {
    readonly identity: { readonly fingerprint: string; readonly provider: string };
    create(session?: GenerationSession): unknown;
    issues(value: unknown): readonly ValidationIssue[];
  };
}
/** API envelopes have known groups, not invented application-model types. */
export function envelope<I extends object>(
  parts: readonly FixturePart[],
  identityName: string,
  options: ContractOptions,
  copy: (value: unknown) => unknown = (value) => snapshot(value, options)
) {
  const identity = Object.freeze({
    fingerprint: JSON.stringify(
      parts.map((p) => [p.group, p.name ?? null, p.required, p.adapter.identity])
    ),
    provider: `test-builders/api-v1/${identityName}`,
  });
  const session = (seed: SessionKey = 1) => createSession({ ...identity, seed });
  const inspect = (value: unknown): StandardSchemaV1.Result<I> => {
    let input: Record<string, unknown>;
    try {
      input = object(copy(value));
    } catch {
      return { issues: [{ message: 'Expected a bounded data envelope' }] };
    }
    const issues: ValidationIssue[] = [];
    const groups = new Set(parts.map((p) => p.group));
    for (const key of Object.keys(input)) {
      if (!groups.has(key)) {
        issues.push({ message: 'Unexpected envelope group', path: [key] });
      }
    }
    for (const group of groups) {
      const entries = parts.filter((part) => part.group === group && part.name !== undefined);
      if (!entries.length || !Object.hasOwn(input, group)) {
        continue;
      }
      let fields: Record<string, unknown>;
      try {
        fields = object(input[group]);
      } catch {
        issues.push({ message: 'Expected a parameter object', path: [group] });
        continue;
      }
      const known = new Set(entries.map((part) => part.name));
      for (const key of Object.keys(fields)) {
        if (!known.has(key)) {
          issues.push({ message: 'Unexpected parameter', path: [group, key] });
        }
      }
    }
    for (const part of parts) {
      const path = part.name === undefined ? [part.group] : [part.group, part.name];
      const parent = part.name === undefined ? input : input[part.group];
      if (
        !parent ||
        typeof parent !== 'object' ||
        !Object.hasOwn(parent, part.name ?? part.group)
      ) {
        if (part.required) {
          issues.push({ message: 'Required value is missing', path });
        }
        continue;
      }
      const item = (parent as Record<string, unknown>)[part.name ?? part.group];
      issues.push(
        ...part.adapter
          .issues(item)
          .map((issue) => ({ ...issue, path: [...path, ...(issue.path ?? [])] }))
      );
    }
    return issues.length ? { issues } : { value: input as I };
  };
  const standard: StandardSchemaV1<I> = {
    '~standard': { version: 1, vendor: 'test-builders/api', validate: inspect },
  };
  const create = (execution: GenerationSession = session()): I => {
    const result: Record<string, unknown> = {};
    for (const part of parts) {
      if (
        !part.required &&
        options.profile !== 'boundary' &&
        options.profile !== 'realistic' &&
        !(
          options.profile === 'random' &&
          execution.scope('presence', part.group, part.name ?? '').boolean()
        )
      ) {
        continue;
      }
      const value = part.adapter.create(execution.scope('value', part.group, part.name ?? ''));
      if (part.name === undefined) {
        Object.defineProperty(result, part.group, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      } else {
        if (!Object.hasOwn(result, part.group)) {
          Object.defineProperty(result, part.group, {
            value: {},
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        Object.defineProperty(result[part.group], part.name, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return result as I;
  };
  const checked = (value: unknown): I => {
    const result = inspect(value);
    if (result.issues) {
      throw new BuilderValidationError(result.issues);
    }
    return result.value!;
  };
  const builder = () =>
    createSchemaBuilder(standard, create, {
      ...options,
      defaultSession: session,
    }) as unknown as SchemaBuilder<
      I,
      I,
      [session?: GenerationSession],
      [session: GenerationSession]
    >;
  return Object.freeze({
    identity,
    session,
    create,
    standard,
    check: (value: unknown) => inspect(value).issues === undefined,
    issues: (value: unknown) => inspect(value).issues ?? [],
    checked,
    builder,
  });
}
