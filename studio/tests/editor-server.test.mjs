import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEditorServer } from '../editor/server.mjs';

async function withServer(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shorts-server-'));
  const server = createEditorServer({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (endpoint, options = {}) => fetch(base + endpoint, {
    ...options,
    headers: { ...((options.method && options.method !== 'GET') ? { Origin: base } : {}), ...(options.headers || {}) }
  });
  return { call, base };
}
test('editor serves loopback UI, CSP and empty project list', async (t) => {
  const { call } = await withServer(t);
  const ui = await call('/');
  assert.equal(ui.status, 200);
  assert.ok((await ui.text()).includes('Shorts Studio'));
  assert.match(ui.headers.get('content-security-policy'), /default-src 'none'/);
  assert.deepEqual(await (await call('/api/projects')).json(), { projects: [] });
  assert.equal((await call('/../../evil')).status, 404);
});
test('API creates, updates, reopens and rejects stale versions', async (t) => {
  const { call } = await withServer(t);
  const unauthorized = await call('/api/projects', { method: 'POST', headers: { Origin: 'http://other.host' } });
  assert.equal(unauthorized.status, 403);
  const added = await call('/api/projects', { method: 'POST' });
  assert.equal(added.status, 201);
  const { project } = await added.json();
  assert.equal((await (await call('/api/projects')).json()).projects.length, 1);
  const modified = { ...project, title: 'Another title' };
  const save = await call('/api/projects/' + project.id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modified)
  });
  assert.equal(save.status, 200);
  const latest = (await save.json()).project;
  assert.equal(latest.revision, 1);
  const same = await call('/api/projects/' + project.id);
  assert.equal((await same.json()).project.title, 'Another title');
  const conflict = await call('/api/projects/' + project.id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modified)
  });
  assert.equal(conflict.status, 409);
  const invalid = await call('/api/projects/' + project.id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...latest, messages: [{ ...latest.messages[0], text: '' }] })
  });
  assert.equal(invalid.status, 400);
  const stillValid = await (await call('/api/projects/' + project.id)).json();
  assert.equal(stillValid.project.revision, 1);
});
test('background is project-scoped, validated, saved and seekable', async (t) => {
  const { call } = await withServer(t);
  const project = (await (await call('/api/projects', { method: 'POST' })).json()).project;
  const id = project.id, url = '/api/projects/' + id + '/background';
  const invalid = await call(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Project-Revision': '0' }, body: Buffer.alloc(20) });
  assert.equal(invalid.status, 400);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftyp'), Buffer.from('isom'), Buffer.from('000000000000')]);
  const upload = await call(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Project-Revision': '0' }, body: mp4 });
  assert.equal(upload.status, 200);
  const saved = (await upload.json()).project;
  assert.equal(saved.revision, 1);
  assert.match(saved.background.file, /^bg-/);
  const media = await call(url, { headers: { Range: 'bytes=0-7' } });
  assert.equal(media.status, 206);
  assert.equal(media.headers.get('content-range'), 'bytes 0-7/' + mp4.length);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), mp4.subarray(0, 8));
  const invalidRange = await call(url, { headers: { Range: 'bytes=4000-' } });
  assert.equal(invalidRange.status, 416);
  const noOverwrite = await call(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Project-Revision': '0' }, body: mp4 });
  assert.equal(noOverwrite.status, 409);
  assert.equal((await (await call('/api/projects/' + id)).json()).project.background.file, saved.background.file);
});

test('parallel writes cannot silently overwrite a competing revision', async (t) => {
  const { call } = await withServer(t);
  const created = (await (await call('/api/projects', { method: 'POST' })).json()).project;
  const endpoint = '/api/projects/' + created.id;
  const inputs = ['First change', 'Second change'].map(title => ({
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...created, title })
  }));
  const responses = await Promise.all(inputs.map(o => call(endpoint, o)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const saved = (await (await call(endpoint)).json()).project;
  assert.ok(['First change', 'Second change'].includes(saved.title));
  assert.equal(saved.revision, 1);
});
