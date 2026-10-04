import { expect, it } from 'vitest';
import { protobufAdapter } from '../../packages/protobuf/src/index.js';
it('preserves 64-bit values and rejects invalid message presence', () => {
  const adapter = protobufAdapter(
    'syntax="proto2"; message Event { required int64 id=1; optional string note=2; }',
    'Event'
  );
  const value = { id: 9223372036854775807n };
  expect(adapter.decode(adapter.encode(value))).toEqual(value);
  expect(adapter.check({})).toBe(false);
  expect(adapter.check({ id: 9223372036854775808n })).toBe(false);
});

it('shares one default session across a session-less builder list', () => {
  const adapter = protobufAdapter('syntax="proto3"; message Event { int32 id = 1; }', 'Event', {
    profile: 'random',
  });
  const builder = adapter.builder();
  const list = builder.buildList(4);
  expect(new Set(list.map((event) => JSON.stringify(event))).size).toBe(4);
  expect(list).toEqual(builder.buildList(4, adapter.session()));
  expect(builder.build()).toEqual(list[0]);
});

it('names the import that was not supplied', () => {
  const proto = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
import "logistics/hub.proto";
message Scan { google.protobuf.Timestamp at = 1; }`;
  const timestamp =
    'syntax = "proto3"; package google.protobuf; message Timestamp { int64 seconds = 1; int32 nanos = 2; }';
  expect(() =>
    protobufAdapter(proto, 'Scan', {
      imports: { 'google/protobuf/timestamp.proto': timestamp },
    })
  ).toThrow(
    'Imported schema was not supplied in memory: add "logistics/hub.proto" to imports (imported by "schema.proto")'
  );
});
