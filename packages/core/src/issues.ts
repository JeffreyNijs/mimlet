import type { ValidationIssue } from './types.js';

const GENERIC = 'Schema validation failed';
const SUMMARY_PATHS = 3;
const KEY_LIMIT = 32;
const PATH_LIMIT = 80;
const MESSAGE_LIMIT = 200;

export interface ValidationIssueFormatOptions {
  /** Maximum number of issues listed. Defaults to 10. */
  readonly limit?: number;
  /**
   * Include each native issue message. Messages can repeat the rejected fixture
   * value, so they are only shown when requested. Defaults to `false`.
   */
  readonly messages?: boolean;
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

/** Only the key of a Standard Schema path segment is read, never its value fields. */
function segment(part: unknown, first: boolean): string {
  const key =
    typeof part === 'object' && part !== null && 'key' in part
      ? (part as { readonly key: unknown }).key
      : part;
  if (typeof key === 'number') {
    return `[${key}]`;
  }
  if (typeof key === 'symbol') {
    return `[Symbol(${clip(key.description ?? '', KEY_LIMIT)})]`;
  }
  if (typeof key !== 'string') {
    return '[?]';
  }
  // JSON Pointer based validators (TypeBox, JSON Schema) report array indexes as strings.
  if (/^(?:0|[1-9][0-9]{0,14})$/.test(key)) {
    return `[${key}]`;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `${first ? '' : '.'}${clip(key, KEY_LIMIT)}`;
  }
  return `[${JSON.stringify(clip(key, KEY_LIMIT))}]`;
}

/** A bounded path such as `owner.email` or `items[0].price`; `(root)` for an empty path. */
export function formatPath(path: unknown): string {
  if (!Array.isArray(path) || path.length === 0) {
    return '(root)';
  }
  const text = path.map((part, index) => segment(part, index === 0)).join('');
  if (text.length <= PATH_LIMIT) {
    return text;
  }
  const half = Math.floor((PATH_LIMIT - 3) / 2);
  return `${text.slice(0, half)}...${text.slice(-half)}`;
}

function pathOf(issue: unknown): unknown {
  return typeof issue === 'object' && issue !== null
    ? (issue as { readonly path?: unknown }).path
    : undefined;
}

/**
 * Error message for rejected values: the issue count and the first distinct paths.
 * Native messages and inputs are never read, because they can contain the fixture.
 */
export function summarizeValidationIssues(issues: unknown): string {
  try {
    if (!Array.isArray(issues) || issues.length === 0) {
      return GENERIC;
    }
    const seen = new Set<string>();
    const listed: string[] = [];
    for (const issue of issues) {
      const path = formatPath(pathOf(issue));
      if (!seen.has(path)) {
        seen.add(path);
        if (listed.length < SUMMARY_PATHS) {
          listed.push(path);
        }
      }
    }
    const more = seen.size - listed.length;
    const count = `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`;
    const rest = more ? ` and ${more} more ${more === 1 ? 'path' : 'paths'}` : '';
    return `${GENERIC}: ${count} at ${listed.join(', ')}${rest}`;
  } catch {
    // An exotic issue object must not replace the validation failure itself.
    return GENERIC;
  }
}

/**
 * One line per issue, for deliberate inspection in a test helper or setup file.
 * Paths are formatted and bounded as in the error message; native messages are
 * included only with `messages: true` because they can contain fixture values.
 */
export function formatValidationIssues(
  source: ReadonlyArray<ValidationIssue> | { readonly issues: ReadonlyArray<ValidationIssue> },
  options: ValidationIssueFormatOptions = {}
): string {
  const issues = Array.isArray(source)
    ? (source as ReadonlyArray<ValidationIssue>)
    : (source as { readonly issues: ReadonlyArray<ValidationIssue> }).issues;
  if (!Array.isArray(issues)) {
    throw new TypeError('Expected validation issues or an error with an issues array');
  }
  const limit = options.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('The issue limit must be a positive integer');
  }
  const lines = issues.slice(0, limit).map((issue: unknown) => {
    const path = formatPath(pathOf(issue));
    if (!options.messages) {
      return path;
    }
    const message =
      typeof issue === 'object' && issue !== null
        ? (issue as { readonly message?: unknown }).message
        : undefined;
    return `${path}: ${clip(String(message).replace(/\s+/g, ' ').trim(), MESSAGE_LIMIT)}`;
  });
  if (issues.length > limit) {
    lines.push(`... and ${issues.length - limit} more`);
  }
  return lines.join('\n');
}
