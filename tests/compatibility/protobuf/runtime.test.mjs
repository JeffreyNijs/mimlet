import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import protobuf from 'protobufjs';
import { protobufAdapter, fromProtobuf, ProtobufFixtureError } from '@mimlet/protobuf';
import { BuilderValidationError, restoreSession } from '@mimlet/core';
const fail = (run) => assert.throws(run, ProtobufFixtureError);
const proto = `syntax="proto3"; package demo;
enum E { NONE=0; FIRST=1; SECOND=2; }
message Child { string label=1; }
message All { int32 a=1; uint32 b=2; sint32 c=3; fixed32 d=4; sfixed32 e=5;
int64 f=6; uint64 g=7; sint64 h=8; fixed64 i=9; sfixed64 j=10;
float k=11; double l=12; bool m=13; string n=14; bytes o=15; E p=16;
repeated string q=17; map<string,int32> r=18; map<bool,string> s=19; map<int64,uint64> t=20;
Child child=21; optional int32 tracked=22; oneof choice { string name=23; int32 number=24; }
}
service Endpoint { rpc Unary(All) returns (Child); rpc Stream(stream All) returns (stream Child); }
`;
describe('native Protobuf representations and binary round trips', () => {
  it('covers all scalar categories, repeated/map shapes, oneofs and profile generation', () => {
    for (const profile of ['minimal', 'random', 'boundary', 'defaults']) {
      const p = protobufAdapter(proto, 'demo.All', { profile });
      const s = p.session(19);
      const before = s.snapshot();
      const values = p.builder().buildValidatedList(10, s);
      assert.deepEqual(
        values,
        p.builder().buildValidatedList(10, restoreSession(before, p.identity))
      );
      for (const value of values) {
        assert.equal(p.check(value), true);
        assert.deepEqual(p.decode(p.encode(value)), value);
        assert.deepEqual(p.clone(value), value);
        assert.equal(p.issues(value).length, 0);
      }
    }
    const p = protobufAdapter(proto, 'demo.All');
    const value = {
      a: -2147483648,
      b: 4294967295,
      c: 2147483647,
      d: 1,
      e: -1,
      f: -9223372036854775808n,
      g: 18446744073709551615n,
      h: 9223372036854775807n,
      i: 18446744073709551615n,
      j: -1n,
      k: Math.fround(0.1),
      l: NaN,
      m: true,
      n: 'é😀',
      o: new Uint8Array([0, 255]),
      p: 2,
      q: ['a', 'b'],
      r: { hello: 1 },
      s: { true: 'a', false: 'b' },
      t: { '-9223372036854775808': 18446744073709551615n },
      child: { label: 'child' },
      tracked: 0,
      number: 0,
    };
    assert.deepEqual(p.decode(p.encode(value)), value);
    const cloned = p.clone(value);
    cloned.o[0] = 9;
    cloned.child.label = 'changed';
    assert.equal(value.o[0], 0);
    assert.equal(value.child.label, 'child');
    assert.equal(p.metadata.network, false);
    assert.equal(p.metadata.integers64, 'bigint');
    assert.equal(p.metadata.fields.find((f) => f.name === 'tracked').presence, true);
    assert.equal(p.metadata.services[0].methods[1].requestStream, true);
    assert.equal(p.metadata.services[0].methods[0].response, '.demo.Child');
    assert.deepEqual(fromProtobuf(proto, 'demo.All').buildValidated(), {});
  });
  it('distinguishes implicit scalar absence from explicit default-valued presence', () => {
    const p = protobufAdapter(
      'syntax="proto3";message X{int32 implicit=1;optional int32 explicit=2;oneof c{int32 selected=3;string other=4;}}',
      'X'
    );
    assert.deepEqual(p.normalize({ implicit: 0, explicit: 0, selected: 0 }), {
      explicit: 0,
      selected: 0,
    });
    assert.deepEqual(p.decode(p.encode({ implicit: 0, explicit: 0, selected: 0 })), {
      explicit: 0,
      selected: 0,
    });
    assert.equal(p.check({ selected: 0, other: '' }), false);
    assert.throws(
      () => p.builder().with({ selected: 0, other: '' }).buildValidated(),
      BuilderValidationError
    );
    assert.equal(p.check({ explicit: undefined }), false);
    assert.equal(p.check({ explicit: null }), false);
    const f = protobufAdapter(proto, 'demo.All');
    assert.equal(f.normalize({ k: 0.1 }).k, Math.fround(0.1));
    assert.ok(Object.is(f.decode(f.encode({ k: -0 })).k, -0));
    assert.equal(f.decode(f.encode({ k: Infinity })).k, Infinity);
    assert.equal(f.decode(f.encode({ l: -Infinity })).l, -Infinity);
  });
  it('handles proto2 required/default/closed enums and recursive messages', () => {
    const schema =
      'syntax="proto2";enum E{A=1;B=2;}message X{required string id=1;optional int32 n=2[default=42];optional E e=3[default=B];optional int64 big=4[default=9223372036854775807];optional bytes data=5[default="a"];optional X next=6;}';
    const p = protobufAdapter(schema, 'X', { profile: 'defaults', maxDepth: 3 });
    const v = p.create();
    assert.equal(v.id, '');
    assert.equal(v.n, 42);
    assert.equal(v.e, 2);
    assert.equal(v.big, 9223372036854775807n);
    assert.deepEqual(v.data, new Uint8Array([97]));
    assert.equal(p.check(v), true);
    assert.deepEqual(p.decode(p.encode(v)), v);
    assert.equal(p.check({}), false);
    assert.deepEqual(p.issues({})[0].path, ['id']);
    assert.equal(p.check({ id: 'x', e: 0 }), false);
    fail(() => p.decode(new Uint8Array()));
    fail(() =>
      protobufAdapter('syntax="proto2";message X{required X next=1;}', 'X', {
        maxDepth: 3,
      }).create()
    );
    const open = protobufAdapter('syntax="proto3";enum E{A=0;}message X{E e=1;}', 'X');
    assert.equal(open.check({ e: 99 }), true);
    assert.equal(open.decode(open.encode({ e: 99 })).e, 99);
  });
  it('accepts verified edition field-presence semantics and case selection', () => {
    for (const edition of ['2023', '2024', '2026']) {
      const p = protobufAdapter(
        `edition="${edition}";message X{int32 tracked_field=1; int32 implicit=2[features.field_presence=IMPLICIT];}`,
        'X'
      );
      assert.equal(p.metadata.fields[0].presence, true);
      assert.equal(p.metadata.fields[1].presence, false);
      assert.deepEqual(p.decode(p.encode({ tracked_field: 0, implicit: 0 })), { tracked_field: 0 });
    }
    const p = protobufAdapter('syntax="proto3";message X{string some_field=1;}', 'X', {
      keepCase: false,
    });
    assert.equal(p.check({ some_field: 'a' }), false);
    assert.equal(p.check({ someField: 'a' }), true);
  });
});
describe('offline schema resolution and native boundaries', () => {
  it('resolves explicit virtual imports, snapshots reflection JSON, and never loads files', () => {
    const source = 'syntax="proto3";import "parts/value.proto";message Main{value.Value v=1;}';
    const imports = {
      'parts/value.proto': 'syntax="proto3";package value;message Value{string x=1;}',
    };
    const p = protobufAdapter(source, 'Main', { imports, profile: 'random' });
    imports['parts/value.proto'] = 'invalid';
    assert.equal(typeof p.create().v.x, 'string');
    fail(() => protobufAdapter(source, 'Main'));
    // A missing import names the resolved key to add and the file that imports it.
    assert.throws(
      () =>
        protobufAdapter('syntax="proto3";import "../parts/hub.proto";message X{}', 'X', {
          filename: 'dir/scan.proto',
          imports: { 'dir/scan.proto': 'unused' },
        }),
      (error) =>
        error instanceof ProtobufFixtureError &&
        error.code === 'PROTOBUF_FIXTURE_FAILED' &&
        error.message ===
          'Imported schema was not supplied in memory: add "parts/hub.proto" to imports (imported by "dir/scan.proto")'
    );
    assert.throws(
      () => protobufAdapter(`syntax="proto3";import "${'x'.repeat(300)}.proto";message X{}`, 'X'),
      (error) =>
        error instanceof ProtobufFixtureError &&
        /^Imported schema was not supplied in memory: add "x{197}\.\.\." to imports \(imported by "schema\.proto"\)$/.test(
          error.message
        )
    );
    fail(() =>
      protobufAdapter('syntax="proto3"; import "../escape.proto";message X{}', 'X', {
        imports: { 'escape.proto': 'message Other{}' },
      })
    );
    fail(() =>
      protobufAdapter('syntax="proto3"; import "https://example.com/x"; message X{}', 'X')
    );
    const recursive = 'syntax="proto3";import "other.proto";message X{Y y=1;}';
    const imported = 'syntax="proto3";import "schema.proto";message Y{string s=1;}';
    const cycle = protobufAdapter(recursive, 'X', {
      imports: { 'other.proto': imported, 'schema.proto': recursive },
      profile: 'random',
    });
    assert.equal(cycle.check(cycle.create()), true);
    const weak = protobufAdapter('syntax="proto3";import weak "./x.proto";message X{}', 'X', {
      imports: { 'x.proto': 'syntax="proto3";message Y{}' },
    });
    assert.deepEqual(weak.create(), {});
    const parent = protobufAdapter(
      'syntax="proto3";import "../common.proto";message X{Common c=1;}',
      'X',
      {
        filename: 'dir/source.proto',
        imports: { 'common.proto': 'syntax="proto3";message Common{}' },
      }
    );
    assert.deepEqual(parent.create(), {});
    const descriptor = protobuf.parse('syntax="proto3";message X{uint64 id=1;}').root.toJSON();
    const reflected = protobufAdapter(descriptor, 'X');
    descriptor.nested.X.fields.id.type = 'string';
    assert.equal(reflected.check({ id: 1n }), true);
    assert.equal(reflected.check({ id: 'x' }), false);
    const empty = { nested: { X: { fields: {} } }, options: { java_package: 'x' } };
    assert.deepEqual(protobufAdapter(empty, 'X').create(), {});
  });
  it('rejects lossy numbers, wrong native values, unknown keys and noncanonical map keys', () => {
    const p = protobufAdapter(proto, 'demo.All');
    const bad = [
      { a: 2147483648 },
      { a: 1.5 },
      { b: -1 },
      { b: 4294967296 },
      { f: '1' },
      { f: 1 },
      { f: { low: 1, high: 0 } },
      { f: 9223372036854775808n },
      { g: -1n },
      { g: 18446744073709551616n },
      { k: Number.MAX_VALUE },
      { k: '1' },
      { m: 1 },
      { n: 1 },
      { n: '\ud800' },
      { o: 'base64' },
      { o: [1] },
      { p: 'FIRST' },
      { p: 2147483648 },
      { child: null },
      { child: { unknown: 1 } },
      { unknown: 1 },
      { q: {} },
      { r: [] },
      { s: { 1: 'x' } },
      { t: { '01': 1n } },
      { t: { '9223372036854775808': 1n } },
      { r: { key: 'wrong' } },
      { tracked: null },
    ];
    for (const value of bad) {
      assert.equal(
        p.check(value),
        false,
        JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v))
      );
      fail(() => p.encode(value));
    }
    const uintmap = protobufAdapter('syntax="proto3";message X{map<uint32,string>x=1;}', 'X');
    assert.equal(uintmap.check({ x: { 4294967296: 'x' } }), false);
    assert.equal(uintmap.check({ x: { '-1': 'x' } }), false);
    const poisoned = JSON.parse('{"r":{"__proto__":4}}');
    assert.equal(p.check(poisoned), true);
    assert.equal(p.decode(p.encode(poisoned)).r.__proto__, 4);
    assert.equal({}.polluted, undefined);
  });
  it('rejects active data, cycles, sparse arrays and exhausted budgets before native work', () => {
    const p = protobufAdapter(proto, 'demo.All');
    const getter = () => {
      throw new Error('getter executed');
    };
    const bad = [
      Object.defineProperty({}, 'n', { enumerable: true, get: getter }),
      Object.defineProperty({}, 'n', { value: 'hidden' }),
      { [Symbol('x')]: 1 },
      new Date(),
      { q: Array(1) },
      { q: Object.assign(['a'], { extra: 1 }) },
      { q: Object.defineProperty(['a'], '0', { get: getter }) },
      { r: Object.defineProperty({}, 'x', { enumerable: true, get: getter }) },
    ];
    for (const value of bad) assert.equal(p.check(value), false);
    const recursive = protobufAdapter('syntax="proto3";message X{X next=1;}', 'X');
    const cycle = {};
    cycle.next = cycle;
    assert.equal(recursive.check(cycle), false);
    assert.equal(protobufAdapter(proto, 'demo.All', { maxBytes: 2 }).check({ n: 'abc' }), false);
    assert.equal(
      protobufAdapter(proto, 'demo.All', { maxBytes: 2 }).check({ o: new Uint8Array(3) }),
      false
    );
    assert.equal(
      protobufAdapter(proto, 'demo.All', { maxNodes: 2 }).check({ q: ['a', 'b', 'c'] }),
      false
    );
    assert.equal(
      protobufAdapter(proto, 'demo.All', { maxNodes: 2 }).check({ r: { a: 1, b: 2, c: 3 } }),
      false
    );
    fail(() => protobufAdapter(proto, 'demo.All', { profile: 'random', maxNodes: 1 }).create());
    fail(() => protobufAdapter(proto, 'demo.All', { profile: 'random', maxNodes: 2 }).create());
    const q = protobufAdapter('syntax="proto3";message X{optional uint64 id=1;}', 'X', {
      maxBytes: 2,
    });
    fail(() => q.encode({ id: 18446744073709551615n }));
  });
  it('rejects malformed schemas and verifies bounded binary input', () => {
    for (const opts of [
      { maxDepth: -1 },
      { maxDepth: 65 },
      { maxNodes: 1.5 },
      { maxBytes: 10000001 },
      { maxSchemaCharacters: 1 },
      { keepCase: 'yes' },
      { profile: 'nope' },
      { filename: '/root.proto' },
    ])
      fail(() => protobufAdapter(proto, 'demo.All', opts));
    fail(() => protobufAdapter('not protobuf', 'X'));
    fail(() => protobufAdapter(proto, 'Unknown'));
    for (const name of ['', {}, 'X;code']) fail(() => protobufAdapter(proto, name));
    const getter = Object.defineProperty({}, 'nested', {
      enumerable: true,
      get() {
        throw new Error('ran');
      },
    });
    for (const d of [
      null,
      undefined,
      42,
      getter,
      { nested: new Date() },
      { nested: { [Symbol('x')]: 1 } },
    ])
      fail(() => protobufAdapter(d, 'X'));
    const cyc = {};
    cyc.nested = cyc;
    fail(() => protobufAdapter(cyc, 'X'));
    fail(() => protobufAdapter({ nested: { X: { fields: {} } } }, 'X', { maxNodes: 1 }));
    fail(() => protobufAdapter({ nested: { X: { fields: {} } } }, 'X', { maxSchemaCharacters: 1 }));
    fail(() =>
      protobufAdapter({ nested: { X: { fields: {} } } }, 'X', { imports: { x: 'message Y{}' } })
    );
    const p = protobufAdapter(proto, 'demo.All');
    fail(() => p.decode('abc'));
    fail(() => p.decode(Uint8Array.from([10, 255])));
    fail(() => p.decode(new Uint8Array(1000001)));
    const simple = protobufAdapter('syntax="proto3";message X{string id=1;}', 'X');
    assert.deepEqual(simple.decode(Uint8Array.from([16, 5])), {}); // Unknown wire field is discarded natively.
  });
});
