import { createTestSession } from './session.js';
import type { GenerationSession } from './session.js';
import type { BuiltList } from './types.js';

export interface ScenarioOptions {
  readonly name?: string;
  readonly maxNodes?: number;
  readonly maxListSize?: number;
}
export interface ScenarioDescription {
  readonly name: string;
  readonly nodes: ReadonlyArray<{
    readonly name: string;
    readonly dependencies: ReadonlyArray<string>;
    /** What builds the node: `'definition'`, `'override'` or `'trait:<name>'`. */
    readonly origin: string;
    /** How many `patch()` calls change the node's value after its factory. */
    readonly patches: number;
  }>;
  readonly traits: ReadonlyArray<string>;
}
export class ScenarioError extends Error {
  constructor(
    readonly code: 'SCENARIO_DEFINITION' | 'SCENARIO_CONFLICT' | 'SCENARIO_EXECUTION',
    message: string,
    readonly node?: string,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'ScenarioError';
  }
}
type MayBeAsync<T> = unknown extends T
  ? true
  : [Extract<T, PromiseLike<unknown>>] extends [never]
    ? false
    : true;
type Either<A extends boolean, B extends boolean> = true extends A | B ? true : false;
type Names<T> = Extract<keyof T, string>;
type Add<T, N extends string, V> = {
  [K in keyof T | N]: K extends N ? V : K extends keyof T ? T[K] : never;
};
/**
 * The dependencies a replacement for node `K` receives: the values of the nodes it declared.
 * A scenario type written without its dependency map gives every node as optional.
 */
type DependenciesOf<T, D, K> = K extends keyof D
  ? Readonly<Pick<T, Extract<D[K], keyof T>>>
  : Readonly<Partial<T>>;
type Replacements<T, D> = {
  [K in keyof T]?: (
    session: GenerationSession,
    dependencies: DependenciesOf<T, D, K>
  ) => T[K] | PromiseLike<T[K]>;
};
type ReplacementResult<P> = {
  [K in keyof P]: P[K] extends (...args: never[]) => infer R ? R : never;
}[keyof P];

interface ScenarioOperations<T extends object, Async extends boolean, D> {
  /** Dependencies must already exist, making cycles and forward references impossible. */
  node<
    N extends string,
    const Deps extends ReadonlyArray<Names<T>>,
    F extends (
      dependencies: Readonly<Pick<T, Deps[number]>>,
      session: GenerationSession
    ) => unknown,
  >(
    name: N extends keyof T | 'then' ? never : N,
    dependencies: Deps,
    factory: F
  ): Scenario<
    Add<T, N, Awaited<ReturnType<F>>>,
    Either<Async, MayBeAsync<ReturnType<F>>>,
    Add<D, N, Deps[number]>
  >;
  /**
   * Replace at the node, before any dependent node runs. The factory receives the node's
   * session and its declared dependencies, so a replacement can keep their relations.
   */
  override<
    K extends Names<T>,
    F extends (
      session: GenerationSession,
      dependencies: DependenciesOf<T, D, K>
    ) => NoInfer<T[K]> | PromiseLike<NoInfer<T[K]>>,
  >(
    name: K,
    factory: F
  ): Scenario<T, Either<Async, MayBeAsync<ReturnType<F>>>, D>;
  /**
   * Change the value a node builds and keep its derivation: the patcher runs after the node's
   * factory (or its override or trait) and before any dependent node, which sees the patched
   * value. It receives the value, the node's declared dependencies and the node's session, and
   * returns the node's value, such as `(deal) => ({ ...deal, status: 'lost' })`. Patches run
   * in the order they were added; a later override or trait replaces the node and its patches.
   */
  patch<
    K extends Names<T>,
    F extends (
      value: T[K],
      dependencies: DependenciesOf<T, D, K>,
      session: GenerationSession
    ) => NoInfer<T[K]> | PromiseLike<NoInfer<T[K]>>,
  >(
    name: K,
    patcher: F
  ): Scenario<T, Either<Async, MayBeAsync<ReturnType<F>>>, D>;
  /** Named presets reject conflicting node replacements unless explicitly authorized. */
  trait<P extends Replacements<T, D>>(
    name: string,
    replacements: P & Record<Exclude<keyof P, keyof T>, never>,
    options?: { readonly replaceConflicts?: boolean }
  ): Scenario<T, Either<Async, MayBeAsync<ReplacementResult<P>>>, D>;
  /** Without a session, uses a fresh `createTestSession()` (seed 1) for this call. */
  buildAsync(session?: GenerationSession): Promise<T>;
  /** Without a session, the items share one fresh `createTestSession()`. */
  buildListAsync<N extends number>(count: N, session?: GenerationSession): Promise<BuiltList<T, N>>;
  describe(): ScenarioDescription;
}
/**
 * `T` maps each node name to its value, `Async` is true once a node, override, patch or trait
 * is async, and `D` maps each node name to the names of its dependencies.
 */
export type Scenario<
  T extends object = Record<never, never>,
  Async extends boolean = false,
  D = Record<never, never>,
> = ScenarioOperations<T, Async, D> &
  (Async extends true
    ? Record<never, never>
    : {
        /** Without a session, uses a fresh `createTestSession()` (seed 1) for this call. */
        build(session?: GenerationSession): T;
        /** Without a session, the items share one fresh `createTestSession()`. */
        buildList<N extends number>(count: N, session?: GenerationSession): BuiltList<T, N>;
      });

type Factory = (
  dependencies: Readonly<Record<string, unknown>>,
  session: GenerationSession
) => unknown;
type Replacement = (
  session: GenerationSession,
  dependencies: Readonly<Record<string, unknown>>
) => unknown;
type Patcher = (
  value: unknown,
  dependencies: Readonly<Record<string, unknown>>,
  session: GenerationSession
) => unknown;
interface NodeDefinition {
  readonly name: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly factory: Factory;
  readonly origin: string;
  /** Applied in order to the factory's value; a replacement of the node clears them. */
  readonly patches: ReadonlyArray<Patcher>;
}
interface Definition {
  readonly name: string;
  readonly maxNodes: number;
  readonly maxListSize: number;
  readonly nodes: ReadonlyArray<NodeDefinition>;
  readonly traits: ReadonlyArray<string>;
}
function fail(message: string, node?: string): never {
  throw new ScenarioError('SCENARIO_DEFINITION', message, node);
}
function validName(name: string): void {
  if (typeof name !== 'string' || !name || name.length > 1024 || name === 'then') {
    fail('Scenario names must be nonempty strings of at most 1024 characters other than "then"');
  }
}
function callable(factory: unknown): asserts factory is (...args: unknown[]) => unknown {
  if (typeof factory !== 'function') {
    fail('Scenario factories must be functions');
  }
}
function checkedCount(count: number, maximum: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
    throw new RangeError(`Scenario count must be an integer between 0 and ${maximum}`);
  }
}
function install(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
function synchronous(value: unknown): unknown {
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new TypeError('Asynchronous scenario nodes require buildAsync()');
  }
  return value;
}
function makeScenario(definition: Definition) {
  const indexOf = (name: string) => {
    const index = definition.nodes.findIndex((node) => node.name === name);
    if (index < 0) {
      fail('Scenario dependency or replacement names an unknown node', name);
    }
    return index;
  };
  /** The node's frozen dependency container and its scoped session, shared by its patches. */
  const inputs = (
    node: NodeDefinition,
    values: Record<string, unknown>,
    session: GenerationSession
  ) => {
    const dependencies: Record<string, unknown> = {};
    for (const name of node.dependencies) {
      install(dependencies, name, values[name]);
    }
    return [
      Object.freeze(dependencies),
      session.scope('scenario', definition.name, 'node', node.name),
    ] as const;
  };
  const build = (session: GenerationSession = createTestSession()) => {
    const values: Record<string, unknown> = {};
    for (const node of definition.nodes) {
      try {
        const [dependencies, scoped] = inputs(node, values, session);
        let value = synchronous(Reflect.apply(node.factory, undefined, [dependencies, scoped]));
        for (const patcher of node.patches) {
          value = synchronous(Reflect.apply(patcher, undefined, [value, dependencies, scoped]));
        }
        install(values, node.name, value);
      } catch (cause) {
        throw new ScenarioError('SCENARIO_EXECUTION', 'Scenario node failed', node.name, cause);
      }
    }
    return values;
  };
  const buildAsync = async (session: GenerationSession = createTestSession()) => {
    const values: Record<string, unknown> = {};
    for (const node of definition.nodes) {
      try {
        const [dependencies, scoped] = inputs(node, values, session);
        let value: unknown = await Reflect.apply(node.factory, undefined, [dependencies, scoped]);
        for (const patcher of node.patches) {
          value = await Reflect.apply(patcher, undefined, [value, dependencies, scoped]);
        }
        install(values, node.name, value);
      } catch (cause) {
        throw new ScenarioError('SCENARIO_EXECUTION', 'Scenario node failed', node.name, cause);
      }
    }
    return values;
  };
  return Object.freeze({
    node(name: string, dependencies: ReadonlyArray<string>, factory: Factory) {
      validName(name);
      callable(factory);
      if (definition.nodes.some((node) => node.name === name)) {
        fail('Duplicate scenario node', name);
      }
      if (definition.nodes.length >= definition.maxNodes) {
        fail('Scenario exceeds the node budget', name);
      }
      if (!Array.isArray(dependencies) || new Set(dependencies).size !== dependencies.length) {
        fail('Dependencies must be a unique array of existing node names', name);
      }
      for (const dependency of dependencies) {
        indexOf(dependency);
      }
      return makeScenario({
        ...definition,
        nodes: [
          ...definition.nodes,
          { name, dependencies: [...dependencies], factory, origin: 'definition', patches: [] },
        ],
      });
    },
    override(name: string, factory: Replacement) {
      callable(factory);
      const index = indexOf(name);
      return makeScenario({
        ...definition,
        nodes: definition.nodes.map((node, at) =>
          at === index
            ? {
                ...node,
                origin: 'override',
                factory: (dependencies, session) =>
                  Reflect.apply(factory, undefined, [session, dependencies]),
                patches: [],
              }
            : node
        ),
      });
    },
    patch(name: string, patcher: Patcher) {
      callable(patcher);
      const index = indexOf(name);
      return makeScenario({
        ...definition,
        nodes: definition.nodes.map((node, at) =>
          at === index ? { ...node, patches: [...node.patches, patcher] } : node
        ),
      });
    },
    trait(
      name: string,
      replacements: Record<string, Replacement>,
      options: { readonly replaceConflicts?: boolean } = {}
    ) {
      validName(name);
      if (definition.traits.includes(name)) {
        throw new ScenarioError('SCENARIO_CONFLICT', 'A named trait cannot be applied twice');
      }
      if (
        !replacements ||
        (Object.getPrototypeOf(replacements) !== Object.prototype &&
          Object.getPrototypeOf(replacements) !== null)
      ) {
        fail('Trait replacements must be a plain record');
      }
      const factories = new Map<string, Replacement>();
      for (const key of Reflect.ownKeys(replacements)) {
        if (typeof key !== 'string') {
          fail('Trait keys must be string node names');
        }
        const descriptor = Object.getOwnPropertyDescriptor(replacements, key);
        if (!descriptor || !('value' in descriptor)) {
          fail('Trait replacements must be data properties');
        }
        callable(descriptor.value);
        indexOf(key);
        factories.set(key, descriptor.value);
      }
      const nodes = definition.nodes.map((node) => {
        const factory = factories.get(node.name);
        if (!factory) {
          return node;
        }
        if (
          (node.origin !== 'definition' || node.patches.length > 0) &&
          !options.replaceConflicts
        ) {
          throw new ScenarioError(
            'SCENARIO_CONFLICT',
            node.origin === 'definition'
              ? 'Trait conflicts with an existing node patch'
              : 'Trait conflicts with an existing node override',
            node.name
          );
        }
        return {
          ...node,
          origin: `trait:${name}`,
          factory: (dependencies: Readonly<Record<string, unknown>>, session: GenerationSession) =>
            Reflect.apply(factory, undefined, [session, dependencies]),
          patches: [],
        };
      });
      return makeScenario({ ...definition, nodes, traits: [...definition.traits, name] });
    },
    build,
    buildAsync,
    // List items share one default session, so they continue its streams instead of restarting.
    buildList(count: number, session?: GenerationSession) {
      checkedCount(count, definition.maxListSize);
      const shared = session === undefined ? createTestSession() : session;
      return Array.from({ length: count }, () => build(shared));
    },
    async buildListAsync(count: number, session?: GenerationSession) {
      checkedCount(count, definition.maxListSize);
      const shared = session === undefined ? createTestSession() : session;
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(await buildAsync(shared));
      }
      return values;
    },
    describe(): ScenarioDescription {
      return Object.freeze({
        name: definition.name,
        traits: Object.freeze([...definition.traits]),
        nodes: Object.freeze(
          definition.nodes.map(({ name, dependencies, origin, patches }) =>
            Object.freeze({
              name,
              dependencies: Object.freeze([...dependencies]),
              origin,
              patches: patches.length,
            })
          )
        ),
      });
    },
  });
}
export function createScenario(options: ScenarioOptions = {}): Scenario {
  const name = options.name ?? 'default';
  validName(name);
  const maxNodes = options.maxNodes ?? 1000;
  const maxListSize = options.maxListSize ?? 1000;
  checkedCount(maxNodes, 100_000);
  checkedCount(maxListSize, 100_000);
  return makeScenario({
    name,
    maxNodes,
    maxListSize,
    nodes: [],
    traits: [],
  }) as unknown as Scenario;
}
