// Account-backed persistence: authorization, isolation, conflicts and replays.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from './helpers.js';

let srv;
before(async () => {
  srv = await startServer();
  srv.auth.createUser('owner@example.com', 'correct-horse-battery');
  srv.auth.createUser('other@example.com', 'another-long-password');
});
after(async () => srv.close());

test('health reports storage ready without personal data', async () => {
  const r = await (await fetch(`${srv.base}/api/health`)).json();
  assert.equal(r.storage, 'ready');
  assert.ok(!JSON.stringify(r).includes('owner@example.com'));
});

test('unauthenticated requests are refused', async () => {
  const anon = client(srv.base);
  assert.equal((await anon.req('GET', '/api/records')).status, 401);
  assert.equal((await anon.req('GET', '/api/quotes?symbols=ACN')).status, 401);
  assert.equal((await anon.req('PUT', '/api/records/by-key/tab:myacn', { baseRevision: 0, data: {}, editId: 'e-00000001' })).status, 401);
});

test('mutations without the client header are refused (CSRF guard)', async () => {
  const res = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct-horse-battery' }) });
  assert.equal(res.status, 403);
});

test('bad password is refused; cookie is HttpOnly and SameSite=Strict', async () => {
  const c = client(srv.base);
  assert.equal((await c.req('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong-password' })).status, 401);
  const res = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acn-client': '1' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct-horse-battery' }) });
  const sc = res.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
});

test('two sessions share state; conflicts detected; other owners isolated', async () => {
  const a = client(srv.base);
  const b = client(srv.base);
  const other = client(srv.base);
  await a.req('POST', '/api/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
  await b.req('POST', '/api/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
  await other.req('POST', '/api/auth/login', { email: 'other@example.com', password: 'another-long-password' });

  const tabs = ['tab:myacn', 'tab:low', 'tab:central', 'tab:high'];
  for (const k of tabs) {
    const r = await a.req('PUT', `/api/records/by-key/${k}`, { baseRevision: 0, data: { key: k, v: 1 }, editId: `init-${k}-0001` });
    assert.equal(r.status, 200);
  }
  // Session A saves a changed share count.
  const save = await a.req('PUT', '/api/records/by-key/tab:myacn', { baseRevision: 1, data: { key: 'tab:myacn', shares: 3500.125, anchor: 200 }, editId: 'edit-a-000001' });
  assert.equal(save.status, 200);
  assert.equal(save.data.record.revision, 2);

  // Session B reads the exact values.
  const listB = await b.req('GET', '/api/records');
  const myacnB = listB.data.records.find((r) => r.key === 'tab:myacn');
  assert.equal(myacnB.data.shares, 3500.125);
  assert.equal(myacnB.revision, 2);
  for (const k of ['tab:low', 'tab:central', 'tab:high']) {
    assert.deepEqual(listB.data.records.find((r) => r.key === k).data, { key: k, v: 1 }, 'other tabs unchanged');
  }

  // B edits; A sees it.
  const editB = await b.req('PUT', '/api/records/by-key/tab:myacn', { baseRevision: 2, data: { key: 'tab:myacn', shares: 3600, anchor: 200 }, editId: 'edit-b-000001' });
  assert.equal(editB.status, 200);
  const readA = await a.req('GET', `/api/records/${myacnB.id}`);
  assert.equal(readA.data.record.data.shares, 3600);

  // Concurrent save from A on a stale revision → 409 with the server copy.
  const stale = await a.req('PUT', '/api/records/by-key/tab:myacn', { baseRevision: 2, data: { key: 'tab:myacn', shares: 1 }, editId: 'edit-a-000002' });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.current.data.shares, 3600);

  // Retrying an already-applied edit is idempotent (offline retry once per unique edit).
  const replay = await b.req('PUT', '/api/records/by-key/tab:myacn', { baseRevision: 2, data: { key: 'tab:myacn', shares: 3600, anchor: 200 }, editId: 'edit-b-000001' });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay, true);
  assert.equal(replay.data.record.revision, 3);

  // Another account cannot read, write or delete a known record id.
  assert.equal((await other.req('GET', `/api/records/${myacnB.id}`)).status, 404);
  assert.equal((await other.req('DELETE', `/api/records/${myacnB.id}`)).status, 404);
  assert.equal((await other.req('GET', '/api/records')).data.records.length, 0);
  const otherWrite = await other.req('PUT', '/api/records/by-key/tab:myacn', { baseRevision: 0, data: { mine: true }, editId: 'other-000001' });
  assert.equal(otherWrite.status, 200);
  assert.notEqual(otherWrite.data.record.id, myacnB.id, 'other owner gets a separate record');
  const stillMine = await a.req('GET', `/api/records/${myacnB.id}`);
  assert.equal(stillMine.data.record.data.shares, 3600);

  // Sign-out ends the session.
  await a.req('POST', '/api/auth/logout');
  assert.equal((await a.req('GET', '/api/records')).status, 401);
  assert.equal((await b.req('GET', '/api/records')).status, 200, 'other session unaffected');
});

test('record keys are validated', async () => {
  const c = client(srv.base);
  await c.req('POST', '/api/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
  assert.equal((await c.req('PUT', '/api/records/by-key/tab:evil', { baseRevision: 0, data: {}, editId: 'x-00000001' })).status, 400);
  assert.equal((await c.req('PUT', '/api/records/by-key/profile', { baseRevision: 0, data: {} })).status, 400);
});

test('storage unavailable is reported as blocked with the exact step', async () => {
  // A path nested under a regular file can never be created.
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const fileAsDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acn-ro-')), 'not-a-dir');
  fs.writeFileSync(fileAsDir, 'x');
  const blocked = await startServer({ DATA_DIR: path.join(fileAsDir, 'data') });
  const h = await (await fetch(`${blocked.base}/api/health`)).json();
  assert.equal(h.storage, 'blocked');
  assert.match(h.storageStep, /DATA_DIR/);
  const r = await client(blocked.base).req('POST', '/api/auth/login', { email: 'a@b.c', password: 'x' });
  assert.equal(r.status, 503);
  blocked.server.closeAllConnections();
  await new Promise((res) => blocked.server.close(res));
});
