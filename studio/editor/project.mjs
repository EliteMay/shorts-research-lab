import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const SCHEMA_VERSION = 1;
export const MAX_MESSAGES = 40;
export const DEFAULT_PROJECT_DIR = process.platform === 'win32'
  ? 'D:/AI/shorts-studio-projects'
  : path.join(os.homedir(), 'ShortsStudioProjects');

const idPattern = /^p-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const assetPattern = /^bg-[0-9a-f-]{36}\.mp4$/;

function fail(reason) { throw new Error(reason); }
export function isProjectId(id) { return typeof id === 'string' && idPattern.test(id); }
export function projectPath(root, id) {
  if (!isProjectId(id)) fail('Invalid project id');
  return path.join(root, id, 'project.json');
}
export function makeProject() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION, id: 'p-' + randomUUID(), revision: 0,
    title: 'The Wrong Group Chat', language: 'en', format: 'chat-comedy',
    durationSeconds: 32,
    messages: [
      { id: 'm1', speaker: 'Mom', text: 'Where are you?', atSeconds: 1 },
      { id: 'm2', speaker: 'Me', text: 'At home. Why?', atSeconds: 5 },
      { id: 'm3', speaker: 'Mom', text: 'Then who is in your room?', atSeconds: 10 },
      { id: 'm4', speaker: 'Me', text: '...The cat?', atSeconds: 17 },
      { id: 'm5', speaker: 'Mom', text: 'The cat is sitting next to me.', atSeconds: 23 }
    ],
    background: { file: null }, createdAt: now, updatedAt: now
  };
}
export function validateProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Project must be an object');
  if (value.schemaVersion !== SCHEMA_VERSION) fail('Unsupported project schema');
  if (!isProjectId(value.id)) fail('Invalid project id');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) fail('Invalid revision');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) fail('Title must contain 1–100 characters');
  if (!['en', 'ja'].includes(value.language)) fail('Unsupported language');
  if (value.format !== 'chat-comedy') fail('Unsupported format');
  if (!Number.isInteger(value.durationSeconds) || value.durationSeconds < 10 || value.durationSeconds > 90) fail('Duration must be 10–90 seconds');
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > MAX_MESSAGES) fail('Need 1–40 messages');
  const ids = new Set();
  let last = -1;
  for (const [index, item] of value.messages.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Invalid message at ' + index);
    if (!/^m[a-z0-9-]{1,40}$/i.test(item.id || '') || ids.has(item.id)) fail('Invalid/duplicate message id');
    ids.add(item.id);
    if (typeof item.speaker !== 'string' || !item.speaker.trim() || item.speaker.length > 32) fail('Invalid speaker');
    if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 280) fail('Message must contain 1–280 characters');
    if (typeof item.atSeconds !== 'number' || !Number.isFinite(item.atSeconds) ||
        item.atSeconds < 0 || item.atSeconds >= value.durationSeconds ||
        Math.round(item.atSeconds * 10) !== item.atSeconds * 10 ||
        item.atSeconds <= last) fail('Message times must be ascending, distinct, at 0.1-second precision');
    last = item.atSeconds;
  }
  if (!value.background || typeof value.background !== 'object' ||
      !(value.background.file === null || (typeof value.background.file === 'string' && assetPattern.test(value.background.file)))) fail('Invalid background');
  if (!Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) fail('Invalid timestamps');
  return value;
}
export async function createProject(root) {
  const project = makeProject();
  await mkdir(path.dirname(projectPath(root, project.id)), { recursive: true });
  await writeFile(projectPath(root, project.id), JSON.stringify(project, null, 2) + '\n', { flag: 'wx' });
  return project;
}
export async function loadProject(root, id) {
  const raw = await readFile(projectPath(root, id), 'utf8');
  const data = JSON.parse(raw);
  validateProject(data);
  if (data.id !== id) fail('Project id mismatch');
  return data;
}
export async function listProjects(root) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isProjectId(entry.name)) continue;
    try {
      const p = await loadProject(root, entry.name);
      result.push({ id: p.id, title: p.title, updatedAt: p.updatedAt, revision: p.revision });
    } catch { /* corrupted projects remain on disk; never delete them */ }
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveProject(root, id, proposed) {
  const existing = await loadProject(root, id);
  validateProject(proposed);
  if (proposed.id !== id || proposed.createdAt !== existing.createdAt ||
      proposed.background.file !== existing.background.file) fail('Protected project fields cannot change');
  if (proposed.revision !== existing.revision) {
    const error = new Error('Project changed elsewhere. Reload before saving.');
    error.status = 409; throw error;
  }
  const next = { ...proposed, revision: existing.revision + 1, updatedAt: new Date().toISOString() };
  await atomicWrite(projectPath(root, id), JSON.stringify(next, null, 2) + '\n');
  return next;
}
export async function atomicWrite(destination, data) {
  const temporary = destination + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch(() => {}); }
}
export function projectAssetPath(root, id, asset) {
  if (!isProjectId(id) || typeof asset !== 'string' || !assetPattern.test(asset)) fail('Invalid asset');
  return path.join(root, id, asset);
}
export async function attachBackground(root, id, file, expectedRevision) {
  const existing = await loadProject(root, id);
  if (existing.revision !== expectedRevision) {
    const err = new Error('Project changed elsewhere. Reload before uploading.'); err.status = 409; throw err;
  }
  const next = { ...existing, background: { file }, revision: existing.revision + 1, updatedAt: new Date().toISOString() };
  validateProject(next);
  await atomicWrite(projectPath(root, id), JSON.stringify(next, null, 2) + '\n');
  return next;
}
