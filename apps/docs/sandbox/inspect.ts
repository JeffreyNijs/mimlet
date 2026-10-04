/**
 * A small, bounded value formatter in the style of Node's `util.inspect`, so sandbox output
 * reads like the docs (`{ name: 'Ada', age: 42 }`). It never invokes getters and stops after
 * fixed depth, length and node budgets, so a large or cyclic value cannot stall the output.
 */
import { LIMITS } from './protocol.ts';

export interface InspectOptions {
  readonly depth?: number;
  readonly maxArrayLength?: number;
  readonly maxProperties?: number;
  readonly maxStringLength?: number;
  readonly maxNodes?: number;
  readonly breakLength?: number;
}

const defaults = {
  depth: 6,
  maxArrayLength: 100,
  maxProperties: 100,
  maxStringLength: 10_000,
  maxNodes: 5_000,
  breakLength: 80,
} satisfies Required<InspectOptions>;

const identifier = /^[A-Za-z_$][\w$]*$/;

function quote(value: string): string {
  const escaped = JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"');
  return value.includes("'") && !value.includes('"')
    ? `"${escaped.replace(/"/g, '\\"')}"`
    : `'${escaped.replace(/'/g, "\\'")}'`;
}

function clip(value: string, limit: number): string {
  return value.length > limit
    ? `${value.slice(0, limit)}... ${value.length - limit} more characters`
    : value;
}

function constructorName(value: object): string | undefined {
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === null) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    const name: unknown =
      descriptor && 'value' in descriptor ? (descriptor.value as { name?: unknown })?.name : '';
    return typeof name === 'string' && name ? name : 'Object';
  } catch {
    return 'Object';
  }
}

/** Formats an issue path such as `['lines', 1, 'quantity']` as `lines[1].quantity`. */
export function formatPath(path: unknown): string {
  if (!Array.isArray(path)) {
    return '';
  }
  let result = '';
  for (const raw of path.slice(0, 64)) {
    const segment: unknown =
      typeof raw === 'object' && raw !== null && 'key' in raw ? (raw as { key: unknown }).key : raw;
    if (typeof segment === 'number') {
      result += `[${segment}]`;
    } else if (typeof segment === 'string' && identifier.test(segment)) {
      result += result ? `.${segment}` : segment;
    } else if (typeof segment === 'string') {
      result += `[${quote(segment)}]`;
    } else {
      result += `[${String(segment)}]`;
    }
  }
  return result;
}

function errorHeading(error: Error): string {
  let name = 'Error';
  let message = '';
  let code: unknown;
  try {
    name = String(error.name || 'Error');
    message = String(error.message ?? '');
    code = (error as { code?: unknown }).code;
  } catch {
    // An accessor on the error threw. Keep the defaults.
  }
  return `${name}${typeof code === 'string' ? ` [${code}]` : ''}${message ? `: ${message}` : ''}`;
}

function issueLines(error: Error): string[] {
  let issues: unknown;
  try {
    issues = (error as { issues?: unknown }).issues;
  } catch {
    return [];
  }
  if (!Array.isArray(issues)) {
    return [];
  }
  return issues.slice(0, LIMITS.issues).map((issue: unknown) => {
    const record = (issue ?? {}) as { path?: unknown; message?: unknown };
    const path = formatPath(record.path);
    return `  - ${path || '(root)'}: ${String(record.message ?? 'Invalid value')}`;
  });
}

export function inspect(value: unknown, options: InspectOptions = {}): string {
  const settings = { ...defaults, ...options };
  const seen: object[] = [];
  let nodes = 0;

  const format = (current: unknown, depth: number, indent: string): string => {
    switch (typeof current) {
      case 'string':
        return quote(clip(current, settings.maxStringLength));
      case 'number':
        return Object.is(current, -0) ? '-0' : String(current);
      case 'bigint':
        return `${current}n`;
      case 'boolean':
      case 'undefined':
        return String(current);
      case 'symbol':
        return current.toString();
      case 'function': {
        const name = current.name;
        if (/^class\b/.test(Function.prototype.toString.call(current))) {
          return `[class ${name || '(anonymous)'}]`;
        }
        return `[Function: ${name || '(anonymous)'}]`;
      }
    }
    if (current === null) {
      return 'null';
    }
    const object = current as object;
    if (seen.includes(object)) {
      return '[Circular]';
    }
    if (++nodes > settings.maxNodes) {
      return '...';
    }
    if (object instanceof Date) {
      return Number.isNaN(object.getTime()) ? 'Invalid Date' : object.toISOString();
    }
    if (object instanceof RegExp) {
      return String(object);
    }
    if (object instanceof Error) {
      return [errorHeading(object), ...issueLines(object)].join('\n' + indent);
    }
    if (object instanceof Promise) {
      return 'Promise { <pending or settled> }';
    }
    if (object instanceof WeakMap || object instanceof WeakSet) {
      return `${constructorName(object)} { <items unknown> }`;
    }
    if (depth > settings.depth) {
      return Array.isArray(object) ? '[Array]' : `[${constructorName(object) ?? 'Object'}]`;
    }
    seen.push(object);
    try {
      const inner = indent + '  ';
      const items: string[] = [];
      let prefix = '';
      let open = '{';
      let close = '}';
      if (Array.isArray(object) || ArrayBuffer.isView(object)) {
        const list = object as unknown as ArrayLike<unknown>;
        const length = list.length;
        open = '[';
        close = ']';
        if (!Array.isArray(object)) {
          prefix = `${constructorName(object)}(${length}) `;
        }
        const shown = Math.min(length, settings.maxArrayLength);
        for (let index = 0; index < shown; index++) {
          items.push(
            Array.isArray(object) && !(index in object)
              ? '<empty item>'
              : format(list[index], depth + 1, inner)
          );
        }
        if (length > shown) {
          items.push(`... ${length - shown} more item${length - shown === 1 ? '' : 's'}`);
        }
      } else if (object instanceof Map) {
        prefix = `Map(${object.size}) `;
        let count = 0;
        for (const [key, entry] of object) {
          if (count++ >= settings.maxArrayLength) {
            items.push(`... ${object.size - settings.maxArrayLength} more items`);
            break;
          }
          items.push(`${format(key, depth + 1, inner)} => ${format(entry, depth + 1, inner)}`);
        }
      } else if (object instanceof Set) {
        prefix = `Set(${object.size}) `;
        let count = 0;
        for (const entry of object) {
          if (count++ >= settings.maxArrayLength) {
            items.push(`... ${object.size - settings.maxArrayLength} more items`);
            break;
          }
          items.push(format(entry, depth + 1, inner));
        }
      } else {
        const name = constructorName(object);
        prefix =
          name === undefined ? '[Object: null prototype] ' : name === 'Object' ? '' : `${name} `;
      }
      if (!(object instanceof Map) && !(object instanceof Set)) {
        const keys = Reflect.ownKeys(object).filter((key) => {
          if (
            (Array.isArray(object) || ArrayBuffer.isView(object)) &&
            typeof key === 'string' &&
            (/^(?:0|[1-9]\d*)$/.test(key) || key === 'length')
          ) {
            return false;
          }
          return Object.getOwnPropertyDescriptor(object, key)?.enumerable ?? false;
        });
        const shown = keys.slice(0, settings.maxProperties);
        for (const key of shown) {
          const label =
            typeof key === 'symbol'
              ? `[${key.toString()}]`
              : identifier.test(key)
                ? key
                : quote(key);
          const descriptor = Object.getOwnPropertyDescriptor(object, key);
          if (descriptor && !('value' in descriptor)) {
            const kind =
              descriptor.get && descriptor.set
                ? 'Getter/Setter'
                : descriptor.get
                  ? 'Getter'
                  : 'Setter';
            items.push(`${label}: [${kind}]`);
          } else {
            items.push(`${label}: ${format(descriptor?.value, depth + 1, inner)}`);
          }
        }
        if (keys.length > shown.length) {
          items.push(`... ${keys.length - shown.length} more properties`);
        }
      }
      if (!items.length) {
        return `${prefix}${open}${close}`;
      }
      const single = `${prefix}${open} ${items.join(', ')} ${close}`;
      if (single.length <= settings.breakLength && !single.includes('\n')) {
        return single;
      }
      return `${prefix}${open}\n${items.map((item) => inner + item).join(',\n')}\n${indent}${close}`;
    } finally {
      seen.pop();
    }
  };

  return format(value, 0, '');
}

/** Formats console arguments the way `console.log` does: strings as-is, other values inspected. */
export function formatLogArguments(args: readonly unknown[]): string {
  const values = [...args];
  let head = '';
  if (typeof values[0] === 'string' && values[0].includes('%')) {
    const template = values.shift() as string;
    head = template.replace(/%([sdifoOjc%])/g, (token, kind: string) => {
      if (kind === '%') {
        return '%';
      }
      if (!values.length) {
        return token;
      }
      const next = values.shift();
      switch (kind) {
        case 's':
          return typeof next === 'string' ? next : inspect(next, { depth: 1 });
        case 'd':
        case 'i':
          return typeof next === 'bigint'
            ? `${next}n`
            : String(kind === 'i' ? Math.trunc(Number(next)) : Number(next));
        case 'f':
          return String(Number(next));
        case 'j':
          try {
            return JSON.stringify(next) ?? 'undefined';
          } catch {
            return '[Circular]';
          }
        case 'c':
          return '';
        default:
          return inspect(next);
      }
    });
  }
  const rest = values.map((value) => (typeof value === 'string' ? value : inspect(value)));
  return clip([...(head ? [head] : []), ...rest].join(' '), LIMITS.entryCharacters);
}
