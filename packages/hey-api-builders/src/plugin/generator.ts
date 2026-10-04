import { $, applyNaming, toCase } from '@hey-api/openapi-ts';
import type { IR } from '@hey-api/openapi-ts';

import type { BuildersPlugin, Config } from './types';

type PluginInstance = BuildersPlugin['Instance'];
type SymbolRef = NonNullable<ReturnType<PluginInstance['querySymbol']>>;

export interface RuntimeSymbols {
  builderOptions: SymbolRef;
  builderPatch: SymbolRef;
  builderSetterValue: SymbolRef;
  builderTransform: SymbolRef;
  createBuilderClass: SymbolRef;
}

interface BuilderTarget {
  anchor: string;
  factorySymbol: SymbolRef;
  modelSymbol: SymbolRef;
  naming: Config['definitions'];
  properties?: ReadonlyArray<string>;
  resource: 'definition' | 'operation';
  resourceId: string;
  role?: 'request' | 'response';
  statusCode?: string;
}

/** Reference the canonical runtime instead of maintaining an emitted implementation. */
export function emitRuntime(plugin: PluginInstance): RuntimeSymbols {
  const module = plugin.config.runtimeModule;
  if (typeof module !== 'string' || !module.trim() || /[\r\n\0]/.test(module)) {
    throw new TypeError('runtimeModule must be a nonempty module specifier');
  }
  const createBuilderClass = plugin.symbol('createBuilderClass', {
    external: module,
    kind: 'function',
  });
  const patch = plugin.symbol('BuilderPatch', { external: module, kind: 'type' });
  const transform = plugin.symbol('BuilderTransform', { external: module, kind: 'type' });
  const utility = (name: string) =>
    plugin.symbol(name, {
      kind: 'type',
      meta: { category: 'utility', resource: 'builder' },
    });
  const builderOptions = utility('BuilderOptions');
  const callable = $.type
    .func()
    .param('_argument', (p) => p.optional().type('never'))
    .returns('unknown');
  const parameters = () => $.type('Parameters').generic('TFactory');
  plugin.node(
    $.type
      .alias(builderOptions)
      .export()
      .generic('TFactory', (p) => p.extends(callable))
      .type(
        $.type
          .ternary(parameters())
          .extends($.type.tuple())
          .do('undefined')
          .otherwise(parameters().idx(0))
      )
  );
  const builderPatch = utility('BuilderPatch');
  const builderTransform = utility('BuilderTransform');
  plugin.node($.type.alias(builderPatch).export().generic('T').type($.type(patch).generic('T')));
  plugin.node(
    $.type.alias(builderTransform).export().generic('T').type($.type(transform).generic('T'))
  );
  // What a `withX()` helper accepts: never for object unions, which need a whole `replace()`.
  // Otherwise exactly what `with()` accepts for that key, as in core `fluent()`: indexed
  // access adds `undefined` to every optional key, so keep it only where the property
  // accepts it (respecting `exactOptionalPropertyTypes`). Not exported: no new public name.
  const builderSetterValue = utility('BuilderSetterValue');
  const property = () => $.type.idx('T', 'K');
  plugin.node(
    $.type
      .alias(builderSetterValue)
      .generic('T')
      .generic('K', (p) => p.extends($.type.operator().keyof('T')))
      .type(
        $.type
          .ternary($.type(builderPatch).generic('T'))
          .extends('never')
          .do('never')
          .otherwise(
            $.type
              .ternary($.type.mapped('P').key('K').type('undefined'))
              .extends($.type('Pick').generics('T', 'K'))
              .do(property())
              .otherwise($.type('Exclude').generics(property(), 'undefined'))
          )
      )
  );
  return { builderOptions, builderPatch, builderSetterValue, builderTransform, createBuilderClass };
}

/** Emit a builder for a reusable OpenAPI schema. */
export function emitDefinitionBuilder({
  event,
  naming,
  plugin,
  runtime,
}: {
  event: {
    name: string;
    pointer: string;
    schema: IR.SchemaObject;
  };
  naming: Config['definitions'];
  plugin: PluginInstance;
  runtime: RuntimeSymbols;
}): void {
  const factorySymbol = plugin.querySymbol({
    artifact: '@faker-js/faker',
    category: 'schema',
    resource: 'definition',
    resourceId: event.pointer,
  });
  const modelSymbol = plugin.querySymbol({
    artifact: 'types',
    category: 'type',
    resource: 'definition',
    resourceId: event.pointer,
  });

  if (!factorySymbol || !modelSymbol) {
    return;
  }

  emitBuilder({
    plugin,
    runtime,
    target: {
      anchor: event.name,
      factorySymbol,
      modelSymbol,
      naming,
      properties: collectDefinitionProperties(event.schema, plugin, new Set()),
      resource: 'definition',
      resourceId: event.pointer,
    },
  });
}

/** Emit request and response builders from the factories produced by Faker. */
export function emitOperationBuilders({
  operation,
  plugin,
  requests,
  responses,
  runtime,
}: {
  operation: IR.OperationObject;
  plugin: PluginInstance;
  requests: Config['requests'];
  responses: Config['responses'];
  runtime: RuntimeSymbols;
}): void {
  if (requests.enabled) {
    const requestFactory = plugin.querySymbol({
      artifact: '@faker-js/faker',
      category: 'schema',
      resource: 'operation',
      resourceId: operation.id,
      role: 'request',
    });

    if (requestFactory) {
      const requestModel = emitFactoryReturnType({
        anchor: `${operation.id}Request`,
        factorySymbol: requestFactory,
        plugin,
        resourceId: operation.id,
        role: 'request',
      });
      emitBuilder({
        plugin,
        runtime,
        target: {
          anchor: `${operation.id}Request`,
          factorySymbol: requestFactory,
          modelSymbol: requestModel,
          naming: requests,
          properties: collectRequestProperties(operation),
          resource: 'operation',
          resourceId: operation.id,
          role: 'request',
        },
      });
    }
  }

  if (!responses.enabled) {
    return;
  }

  const responseFactories = plugin.symbolFactory.queryAll({
    artifact: '@faker-js/faker',
    category: 'schema',
    resource: 'operation',
    resourceId: operation.id,
    role: 'response',
  });

  responseFactories.forEach((factorySymbol, index) => {
    const rawStatusCode = factorySymbol.meta?.statusCode;
    const statusCode =
      typeof rawStatusCode === 'string' || typeof rawStatusCode === 'number'
        ? String(rawStatusCode)
        : undefined;
    const suffix = statusCode ?? String(index + 1);
    const anchor = `${operation.id}Response${suffix}`;
    const responseModel = emitFactoryReturnType({
      anchor,
      factorySymbol,
      plugin,
      resourceId: operation.id,
      role: 'response',
      statusCode,
    });
    emitBuilder({
      plugin,
      runtime,
      target: {
        anchor,
        factorySymbol,
        modelSymbol: responseModel,
        naming: responses,
        properties: collectResponseProperties({
          operation,
          plugin,
          statusCode,
        }),
        resource: 'operation',
        resourceId: operation.id,
        role: 'response',
        statusCode,
      },
    });
  });
}

function collectResponseProperties({
  operation,
  plugin,
  statusCode,
}: {
  operation: IR.OperationObject;
  plugin: PluginInstance;
  statusCode?: string;
}): ReadonlyArray<string> {
  if (!statusCode) {
    return [];
  }
  const schema = operation.responses?.[statusCode]?.schema;
  return schema ? collectSchemaProperties(schema, plugin, new Set()) : [];
}

/**
 * Object properties of a model, including `allOf` members and references. Unlike responses,
 * `oneOf`/`anyOf` models get no setters: a shared discriminant setter would allow a partial
 * variant transition, which builders require as a complete `replace()`.
 */
function collectDefinitionProperties(
  schema: IR.SchemaObject,
  plugin: PluginInstance,
  seen: Set<string>
): ReadonlyArray<string> {
  if (schema.properties) {
    return Object.keys(schema.properties);
  }
  if (schema.$ref && !seen.has(schema.$ref)) {
    seen.add(schema.$ref);
    const referenced = plugin.context.resolveIrRef<IR.SchemaObject>(schema.$ref);
    return collectDefinitionProperties(referenced, plugin, seen);
  }
  if (schema.logicalOperator !== 'and' || !schema.items?.length) {
    return [];
  }
  return [
    ...new Set(
      schema.items.flatMap((item) => collectDefinitionProperties(item, plugin, new Set(seen)))
    ),
  ];
}

function collectSchemaProperties(
  schema: IR.SchemaObject,
  plugin: PluginInstance,
  seen: Set<string>
): ReadonlyArray<string> {
  // The IR also stores array and tuple element schemas in `items`. Those
  // elements are not properties of the response value itself.
  if (schema.type === 'array' || schema.type === 'tuple') {
    return [];
  }

  if (schema.properties) {
    return Object.keys(schema.properties);
  }

  if (schema.$ref && !seen.has(schema.$ref)) {
    seen.add(schema.$ref);
    const referenced = plugin.context.resolveIrRef<IR.SchemaObject>(schema.$ref);
    return collectSchemaProperties(referenced, plugin, seen);
  }

  if (!schema.logicalOperator || !schema.items?.length) {
    return [];
  }

  const childProperties = schema.items.map((item) =>
    collectSchemaProperties(item, plugin, new Set(seen))
  );
  if (schema.logicalOperator === 'and') {
    return [...new Set(childProperties.flat())];
  }

  const [first = [], ...rest] = childProperties;
  return first.filter((property) => rest.every((properties) => properties.includes(property)));
}

function collectRequestProperties(operation: IR.OperationObject): ReadonlyArray<string> {
  const properties: Array<string> = [];
  if (operation.body) {
    properties.push('body');
  }
  if (operation.parameters?.header && Object.keys(operation.parameters.header).length > 0) {
    properties.push('headers');
  }
  if (operation.parameters?.path && Object.keys(operation.parameters.path).length > 0) {
    properties.push('path');
  }
  if (operation.parameters?.query && Object.keys(operation.parameters.query).length > 0) {
    properties.push('query');
  }
  return properties;
}

function emitFactoryReturnType({
  anchor,
  factorySymbol,
  plugin,
  resourceId,
  role,
  statusCode,
}: {
  anchor: string;
  factorySymbol: SymbolRef;
  plugin: PluginInstance;
  resourceId: string;
  role: 'request' | 'response';
  statusCode?: string;
}): SymbolRef {
  const symbol = plugin.symbol(`${toCase(anchor, 'PascalCase')}BuilderValue`, {
    kind: 'type',
    meta: {
      category: 'builder-value',
      resource: 'operation',
      resourceId,
      role,
      ...(statusCode ? { statusCode } : {}),
    },
  });
  const returnType = $.type('ReturnType').generic($(factorySymbol).typeofType());
  plugin.node($.type.alias(symbol).type(returnType));
  return symbol;
}

function emitBuilder({
  plugin,
  runtime,
  target,
}: {
  plugin: PluginInstance;
  runtime: RuntimeSymbols;
  target: BuilderTarget;
}): void {
  const className = applyNaming(target.anchor, target.naming);
  const builderSymbol = plugin.symbol(className, {
    kind: 'class',
    meta: {
      category: 'builder',
      resource: target.resource,
      resourceId: target.resourceId,
      ...(target.role ? { role: target.role } : {}),
      ...(target.statusCode ? { statusCode: target.statusCode } : {}),
    },
  });
  const patchType = () => $.type(runtime.builderPatch).generic(target.modelSymbol);
  const base = plugin.symbol(`${className}Base`, {
    kind: 'var',
    meta: { category: 'builder-base', resource: target.resource, resourceId: target.resourceId },
  });
  plugin.node($.const(base).assign($(runtime.createBuilderClass).call(target.factorySymbol)));
  const classNode = $.class(builderSymbol).export().extends(base);
  for (const { methodName, propertyName } of propertyMethods(target.properties ?? [])) {
    // Object unions require complete replacement, even through generated convenience methods.
    const fieldType = $.type(runtime.builderSetterValue).generics(
      target.modelSymbol,
      $.type.literal(propertyName)
    );
    classNode.method(methodName, (method) =>
      method
        .param('value', (parameter) => parameter.type(fieldType))
        .returns('this')
        .do(
          $.return(
            $('this').attr('with').call($.object().prop(propertyName, 'value').as(patchType()))
          )
        )
    );
  }

  plugin.node(classNode);
}

function propertyMethods(
  properties: ReadonlyArray<string>
): ReadonlyArray<{ methodName: string; propertyName: string }> {
  const methods: Array<{ methodName: string; propertyName: string }> = [];
  const used = new Set<string>([
    'build',
    'buildList',
    'buildAsync',
    'buildListAsync',
    'constructor',
    'transform',
    'transformAsync',
    'with',
    'withFactory',
    'replace',
    'replaceFactory',
    'omit',
    'describe',
    'usingValidation',
    'buildValidated',
    'buildValidatedAsync',
    'buildValidatedList',
    'buildValidatedListAsync',
  ]);

  for (const propertyName of properties) {
    const suffix = toCase(propertyName, 'PascalCase') || 'Value';
    const baseName = `with${suffix}`;
    let methodName = baseName;
    let collisionIndex = 2;
    while (used.has(methodName)) {
      methodName = `${baseName}${collisionIndex}`;
      collisionIndex += 1;
    }
    used.add(methodName);
    methods.push({ methodName, propertyName });
  }

  return methods;
}
