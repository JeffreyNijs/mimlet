/** Turns whatever a sandbox program threw into plain, bounded data for the page. */
import { formatPath, inspect } from './inspect.ts';
import { LIMITS, type ErrorReport, type IssueReport } from './protocol.ts';

function read(target: unknown, key: string): unknown {
  try {
    return (target as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
const clip = (value: unknown): string => String(value ?? '').slice(0, LIMITS.errorCharacters);

function issuesOf(error: unknown): IssueReport[] | undefined {
  // A scenario wraps the builder error that failed inside one of its nodes.
  for (let current = error, depth = 0; current && depth < 4; current = read(current, 'cause')) {
    const issues = read(current, 'issues');
    if (Array.isArray(issues)) {
      return issues.slice(0, LIMITS.issues).map((issue: unknown) => ({
        path: clip(formatPath(read(issue, 'path'))),
        message: clip(read(issue, 'message') ?? 'Invalid value'),
      }));
    }
    depth++;
  }
  return undefined;
}

export function describeError(error: unknown, line?: number): ErrorReport {
  if (!(error instanceof Error)) {
    return {
      name: 'Uncaught',
      message: clip(inspect(error, { depth: 2 })),
      ...(line ? { line } : {}),
    };
  }
  const code = read(error, 'code');
  const cause = read(error, 'cause');
  const issues = issuesOf(error);
  const causeCode = cause instanceof Error ? read(cause, 'code') : undefined;
  return {
    name: clip(read(error, 'name') || 'Error'),
    message: clip(read(error, 'message')),
    ...(typeof code === 'string' ? { code: clip(code) } : {}),
    ...(line ? { line } : {}),
    ...(issues ? { issues } : {}),
    ...(cause instanceof Error
      ? {
          cause: {
            name: clip(read(cause, 'name') || 'Error'),
            message: clip(read(cause, 'message')),
            ...(typeof causeCode === 'string' ? { code: clip(causeCode) } : {}),
          },
        }
      : {}),
  };
}
