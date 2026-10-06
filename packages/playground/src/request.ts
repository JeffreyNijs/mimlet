import { Buffer } from 'node:buffer';
import type { SessionSnapshot } from '@mimlet/core';
import type { GenerationProfile, JsonSchema, SchemaDialect } from '@mimlet/json-schema';

export interface GenerationRequest {
  readonly schema: JsonSchema;
  readonly references?: Readonly<Record<string, JsonSchema>>;
  readonly profile?: GenerationProfile;
  readonly dialect?: SchemaDialect;
  readonly seed?: string | number;
  readonly count?: number;
  /** Checkpoint captured BEFORE the requested fixture batch. Schema/provider identity is verified. */
  readonly replay?: SessionSnapshot;
}
export const MAX_REQUEST_BYTES = 256_000;
export const MAX_RESULT_BYTES = 1_000_000;
export class PlaygroundError extends Error {
  constructor(
    readonly code:
      'INVALID_REQUEST' | 'GENERATION_TIMEOUT' | 'GENERATION_ABORTED' | 'GENERATION_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'PlaygroundError';
  }
}
export function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== 'number' ||
    !Number.isSafeInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    throw new PlaygroundError(
      'INVALID_REQUEST',
      `Expected an integer between ${minimum} and ${maximum}`
    );
  }
  return result;
}
/** Snapshot data before crossing the worker boundary; never evaluate accessor properties. */
export function snapshotRequest(input: unknown): GenerationRequest {
  let nodes = 0;
  let bytes = 0;
  const active = new Set<object>();
  const invalid = (): never => {
    throw new PlaygroundError(
      'INVALID_REQUEST',
      'Expected a bounded, acyclic, data-only JSON request'
    );
  };
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 20_000 || depth > 64) {
      return invalid();
    }
    if (value === null || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return invalid();
      }
      return value;
    }
    if (typeof value === 'string') {
      bytes += Buffer.byteLength(value);
      if (bytes > MAX_REQUEST_BYTES) {
        return invalid();
      }
      return value;
    }
    if (!value || typeof value !== 'object' || active.has(value)) {
      return invalid();
    }
    const array = Array.isArray(value);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      return invalid();
    }
    active.add(value);
    const output: unknown[] | Record<string, unknown> = array ? [] : {};
    const keys = Reflect.ownKeys(value).filter((key) => !(array && key === 'length'));
    if (array && keys.length !== value.length) {
      return invalid();
    }
    for (const key of keys) {
      if (typeof key !== 'string') {
        return invalid();
      }
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        return invalid();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !('value' in descriptor)) {
        return invalid();
      }
      bytes += Buffer.byteLength(key);
      if (bytes > MAX_REQUEST_BYTES) {
        return invalid();
      }
      Object.defineProperty(output, key, {
        enumerable: true,
        writable: true,
        configurable: true,
        value: visit(descriptor.value, depth + 1),
      });
    }
    active.delete(value);
    return output;
  };
  const result = visit(input, 0) as GenerationRequest;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return invalid();
  }
  if (
    Object.keys(result).some(
      (key) =>
        !['schema', 'references', 'profile', 'dialect', 'seed', 'count', 'replay'].includes(key)
    )
  ) {
    return invalid();
  }
  if (
    typeof result.schema !== 'boolean' &&
    (!result.schema || typeof result.schema !== 'object' || Array.isArray(result.schema))
  ) {
    return invalid();
  }
  if (
    result.references !== undefined &&
    (!result.references ||
      typeof result.references !== 'object' ||
      Array.isArray(result.references))
  ) {
    return invalid();
  }
  if (
    result.profile !== undefined &&
    !['minimal', 'defaults', 'examples', 'random', 'boundary', 'realistic'].includes(result.profile)
  ) {
    return invalid();
  }
  if (
    result.dialect !== undefined &&
    !['draft-07', 'draft-2019-09', 'draft-2020-12'].includes(result.dialect)
  ) {
    return invalid();
  }
  if (
    result.seed !== undefined &&
    typeof result.seed !== 'string' &&
    (typeof result.seed !== 'number' || !Number.isSafeInteger(result.seed))
  ) {
    return invalid();
  }
  if (typeof result.seed === 'string' && (!result.seed || result.seed.length > 256)) {
    return invalid();
  }
  if (
    result.replay !== undefined &&
    (!result.replay || typeof result.replay !== 'object' || Array.isArray(result.replay))
  ) {
    return invalid();
  }
  if (result.seed !== undefined && result.replay !== undefined) {
    return invalid();
  }
  integer(result.count, 3, 0, 50);
  // Includes JSON syntax/escaping overhead, not just character payloads.
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_REQUEST_BYTES) {
    return invalid();
  }
  return result;
}
