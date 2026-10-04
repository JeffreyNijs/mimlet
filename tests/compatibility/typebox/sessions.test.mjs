import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Type from 'typebox';
import { Type as Legacy } from '@sinclair/typebox';
import { restoreSession, SessionReplayError } from '@mimlet/core';
import * as modern from '@mimlet/typebox';
import * as legacy from '@mimlet/typebox-legacy';

for (const [name, T, api] of [
  ['typebox', Type, modern],
  ['@sinclair/typebox', Legacy, legacy],
]) {
  describe(`${name}: generation sessions`, () => {
    const User = T.Object({ id: T.Number(), name: T.String({ default: 'Ada' }) });
    it('gives session-less lists one default session, so patch factories can count items', () => {
      const users = api
        .fromTypeBox(User)
        .withFactory((session) => ({ id: session.sequence('user', 1) }));
      const list = users.buildList(3);
      assert.deepEqual(
        list.map((user) => user.id),
        [1, 2, 3]
      );
      assert.deepEqual(users.buildList(3), list);
      assert.deepEqual(users.buildValidatedList(3), list);
      assert.deepEqual(users.build(), { id: 1, name: 'Ada' });
      assert.deepEqual(users.buildList(3, api.typeBoxAdapter(User).session()), list);
      // Native creation itself ignores the session: without a patch, rows stay equal.
      assert.deepEqual(api.fromTypeBox(User).buildList(2), [
        { id: 0, name: 'Ada' },
        { id: 0, name: 'Ada' },
      ]);
    });
    it('continues an explicit session and replays it from a snapshot', () => {
      const adapter = api.typeBoxAdapter(User);
      const users = api
        .fromTypeBox(User)
        .transform((user, session) => ({ ...user, id: session.integer(1, 1000) }));
      const session = adapter.session('replay');
      const before = session.snapshot();
      const first = users.buildList(2, session);
      const next = users.build(session);
      assert.notDeepEqual(next, first[0]);
      const replay = restoreSession(JSON.parse(JSON.stringify(before)), adapter.identity);
      assert.deepEqual(users.buildList(2, replay), first);
      assert.throws(
        () => restoreSession(before, api.typeBoxAdapter(T.Object({})).identity),
        SessionReplayError
      );
      assert.deepEqual(adapter.create(), { id: 0, name: 'Ada' });
    });
    it('derives a stable identity from the schema, references and fill configuration', () => {
      const identity = api.typeBoxAdapter(User).identity;
      assert.deepEqual(api.typeBoxAdapter(User).identity, identity);
      assert.equal(typeof identity.provider, 'string');
      assert.notEqual(
        api.typeBoxAdapter(T.Object({ id: T.Number() })).identity.fingerprint,
        identity.fingerprint
      );
      assert.equal(
        api.typeBoxAdapter(User, { fill: {} }).identity.configuration,
        identity.configuration
      );
    });
    it('passes the session to variant builders as well', () => {
      const Pet = T.Union([
        T.Object({ kind: T.Literal('cat'), id: T.Number() }),
        T.Object({ kind: T.Literal('dog'), id: T.Number() }),
      ]);
      const dogs = api
        .fromTypeBoxVariant(Pet, 1)
        .withFactory((session) => ({ id: session.sequence('dog', 10, 10) }));
      assert.deepEqual(dogs.buildValidatedList(2), [
        { kind: 'dog', id: 10 },
        { kind: 'dog', id: 20 },
      ]);
      const adapter = api.typeBoxVariantAdapter(Pet, 1);
      assert.deepEqual(dogs.buildList(2, adapter.session()), dogs.buildList(2));
      assert.notEqual(
        adapter.identity.fingerprint,
        api.typeBoxVariantAdapter(Pet, 0).identity.fingerprint
      );
      assert.deepEqual(adapter.create(), { kind: 'dog', id: 0 });
    });
  });
}
