import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { APP_ID, setupDesktopEnvironment } from '../desktop/runtime.mjs';
import { DEFAULT_PROJECT_DIR } from '../editor/project.mjs';
import { createEditorServer } from '../editor/server.mjs';

test('desktop uses the same durable project directory as web editor', () => {
  const env = { SHORTS_STUDIO_PROJECTS_DIR: 'D:/AI/custom-short-videos' };
  const result = setupDesktopEnvironment({ packaged: false, env });
  assert.equal(result.root, 'D:/AI/custom-short-videos');
  assert.equal(APP_ID, 'jp.elitemay.shortsstudio');
  assert.equal(setupDesktopEnvironment({ packaged: false, env: {} }).root, DEFAULT_PROJECT_DIR);
});
test('packaged desktop requires its own ffmpeg tools and points to unpacked Python script', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shorts-electron-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.throws(() => setupDesktopEnvironment({ packaged: true, resourcesPath: root, env: {} }), /missing/);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'ffmpeg.exe'), '');
  await writeFile(path.join(bin, 'ffprobe.exe'), '');
  const env = {};
  const result = setupDesktopEnvironment({ packaged: true, resourcesPath: root, env });
  assert.equal(result.ffmpeg, path.join(bin, 'ffmpeg.exe'));
  assert.equal(env.SHORTS_VOICE_SCRIPT, path.join(root, 'app.asar.unpacked', 'editor', 'voice_sync.py'));
});
test('editor server exposes real render busy state rather than desktop guessing', () => {
  const server = createEditorServer({});
  assert.equal(server.hasRunningJobs(), false);
  server.close();
});
