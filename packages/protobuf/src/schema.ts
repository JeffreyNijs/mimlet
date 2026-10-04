import type { Type } from 'protobufjs';
import protobuf from 'protobufjs';
import type { ProtobufFixtureOptions } from './types.js';
import { ProtobufFixtureError, fail, own, virtualPath } from './values.js';

const clip = (path: string): string => (path.length > 200 ? `${path.slice(0, 197)}...` : path);
/** Internal schema operations; prepared once for each native adapter. */
export function prepareProtobufSchema({
  source,
  messageName,
  options,
  maxDepth,
  maxNodes,
  maxSchemaCharacters,
}: {
  source: string | Readonly<Record<string, unknown>>;
  messageName: string;
  options: ProtobufFixtureOptions;
  maxDepth: number;
  maxNodes: number;
  maxSchemaCharacters: number;
}) {
  const imports = { ...options.imports };
  const filename = virtualPath(options.filename ?? 'schema.proto');
  let characters = 0;
  const checkedText = (text: string): string => {
    if (typeof text !== 'string' || (characters += text.length) > maxSchemaCharacters) {
      return fail('Protobuf schema character budget exhausted');
    }
    return text;
  };
  const root = new protobuf.Root();
  try {
    if (typeof source === 'string') {
      const seen = new Set<string>();
      const load = (name: string, text: string, depth: number): void => {
        if (seen.has(name)) {
          return;
        }
        if (depth > maxDepth || seen.size >= maxNodes) {
          return fail('Import budget exhausted');
        }
        seen.add(name);
        const parsed = protobuf.parse(checkedText(text), root, {
          keepCase: options.keepCase ?? true,
        });
        for (const imported of [...(parsed.imports ?? []), ...(parsed.weakImports ?? [])]) {
          const target = virtualPath(imported, name);
          if (!Object.hasOwn(imports, target)) {
            // Name the resolved key the caller must add, and the file that imports it.
            return fail(
              `Imported schema was not supplied in memory: add ${JSON.stringify(clip(target))} to imports (imported by ${JSON.stringify(clip(name))})`
            );
          }
          load(target, imports[target]!, depth + 1);
        }
      };
      load(filename, source, 0);
    } else {
      if (Object.keys(imports).length) {
        return fail('Reflection JSON must contain its own referenced definitions');
      }
      let nodes = 0;
      const active = new Set<object>();
      const json = (value: unknown, depth: number): unknown => {
        if (++nodes > maxNodes || depth > Math.max(maxDepth, 1)) {
          return fail('Reflection schema budget exhausted');
        }
        if (typeof value === 'string') {
          return checkedText(value);
        }
        if (
          value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
        ) {
          return value;
        }
        if (!value || typeof value !== 'object' || active.has(value)) {
          return fail('Reflection schemas must be acyclic JSON');
        }
        if (!Array.isArray(value)) {
          own(value);
        }
        active.add(value);
        const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
        for (const key of Reflect.ownKeys(value)) {
          if (Array.isArray(value) && key === 'length') {
            continue;
          }
          const entry = Object.getOwnPropertyDescriptor(value, key)!;
          if (typeof key !== 'string' || !entry.enumerable || !('value' in entry)) {
            return fail('Reflection schemas require JSON data properties');
          }
          checkedText(key);
          Object.defineProperty(output, key, {
            value: json(entry.value, depth + 1),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        active.delete(value);
        return output;
      };
      protobuf.Root.fromJSON(own(json(source, 0)), root);
    }
    root.resolveAll();
  } catch (cause) {
    if (cause instanceof ProtobufFixtureError) {
      throw cause;
    }
    throw new ProtobufFixtureError('Protobuf schema preparation failed', [], { cause });
  }
  let type: Type;
  try {
    type = root.lookupType(messageName);
  } catch (cause) {
    throw new ProtobufFixtureError('Message type does not exist', [], { cause });
  }
  const shape = root.toJSON();
  return { root, type, shape };
}
