import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  makeProject, validateProject, createProject, loadProject, saveProject, listProjects, projectPath
} from '../editor/project.mjs';

const fresh = () => JSON.parse(JSON.stringify(makeProject()));
test('project schema accepts safe sample and rejects invalid timing and path traversal', () => {
  const x = fresh();
  assert.equal(validateProject(x), x);
  assert.throws(() => projectPath('X', '../../etc'), /Invalid project id/);
  x.messages[1].atSeconds = x.messages[0].atSeconds;
  assert.throws(() => validateProject(x), /ascending/);
  x.messages[1].atSeconds = 5;
  x.messages[1].id = x.messages[0].id;
  assert.throws(() => validateProject(x), /duplicate/);
});
test('schema protects user inputs and enforces video duration', () => {
  const x = fresh();
  x.messages[0].text = '<img src=x onerror=alert(1)>';
  assert.equal(validateProject(x), x); // renderer uses textContent
  x.messages[0].text = '';
  assert.throws(() => validateProject(x), /Message/);
  x.messages[0].text = 'okay';
  x.durationSeconds = 9;
  assert.throws(() => validateProject(x), /Duration/);
});
test('atomic project writes survive reload and stale edits are refused', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shorts-project-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await listProjects(dir), []);
  const created = await createProject(dir);
  assert.equal((await listProjects(dir)).length, 1);
  const proposed = { ...created, title: 'Updated title' };
  const saved = await saveProject(dir, created.id, proposed);
  assert.equal(saved.revision, 1);
  assert.equal((await loadProject(dir, created.id)).title, 'Updated title');
  await assert.rejects(saveProject(dir, created.id, proposed), { status: 409 });
  await assert.rejects(saveProject(dir, created.id, { ...saved, background: { file: 'bg-' + 'a'.repeat(36) + '.mp4' } }), /Protected/);
  assert.deepEqual((await listProjects(dir))[0].title, 'Updated title');
  const bytes = await readFile(projectPath(dir, created.id), 'utf8');
  assert.ok(bytes.includes('"revision": 1'));
});
