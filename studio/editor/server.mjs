import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PROJECT_DIR, createProject, loadProject, listProjects, saveProject,
  isProjectId, projectAssetPath, attachBackground
} from './project.mjs';

const home = path.dirname(fileURLToPath(import.meta.url));
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']]
]);
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const secureHeaders = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store'
};
const MAX_JSON_BYTES = 65536, MAX_MP4_BYTES = 64 * 1024 * 1024;
function send(res, status, object) {
  res.writeHead(status, { ...secureHeaders, ...jsonHeaders });
  res.end(JSON.stringify(object));
}
async function bodyBuffer(req, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const e = new Error('File/request too large'); e.status = 413; throw e;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function checkWriteOrigin(req, address) {
  const expected = 'http://127.0.0.1:' + address.port;
  if (req.headers.origin !== expected) {
    const err = new Error('Untrusted origin'); err.status = 403; throw err;
  }
}
async function serveMp4(req, res, root, id) {
  const project = await loadProject(root, id);
  const asset = project.background.file;
  if (!asset) { send(res, 404, { error: 'No background video' }); return; }
  const file = projectAssetPath(root, id, asset);
  const { size } = await stat(file);
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if (!match) { res.writeHead(416, { ...secureHeaders, 'Content-Range': 'bytes */' + size }); res.end(); return; }
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      res.writeHead(416, { ...secureHeaders, 'Content-Range': 'bytes */' + size }); res.end(); return;
    }
    end = Math.min(end, size - 1);
    status = 206;
  }
  res.writeHead(status, { ...secureHeaders, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}
export function createEditorServer({ root = DEFAULT_PROJECT_DIR } = {}) {
  const locks = new Map();
  async function writeLocked(id, action) {
    const preceding = locks.get(id) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    locks.set(id, current);
    await preceding;
    try { return await action(); }
    finally {
      release();
      if (locks.get(id) === current) locks.delete(id);
    }
  }
  return http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== '127.0.0.1:' + req.socket.localPort) {
        send(res, 403, { error: 'Invalid host' }); return;
      }
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (req.method !== 'GET') checkWriteOrigin(req, { port: req.socket.localPort });
      if (req.method === 'GET' && staticFiles.has(pathname)) {
        const [file, contentType] = staticFiles.get(pathname);
        const data = await readFile(path.join(home, file));
        res.writeHead(200, { ...secureHeaders, 'Content-Type': contentType,
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
        res.end(data); return;
      }
      if (req.method === 'GET' && pathname === '/api/projects') {
        send(res, 200, { projects: await listProjects(root) }); return;
      }
      if (req.method === 'POST' && pathname === '/api/projects') {
        send(res, 201, { project: await createProject(root) }); return;
      }
      const hit = /^\/api\/projects\/(p-[0-9a-f-]+)(?:\/(background))?$/.exec(pathname);
      if (!hit || !isProjectId(hit[1])) { send(res, 404, { error: 'Not found' }); return; }
      const id = hit[1], subroute = hit[2];
      if (req.method === 'GET' && !subroute) { send(res, 200, { project: await loadProject(root, id) }); return; }
      if (req.method === 'PUT' && !subroute) {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) { send(res, 415, { error: 'JSON required' }); return; }
        let body;
        try { body = JSON.parse((await bodyBuffer(req, MAX_JSON_BYTES)).toString('utf8')); }
        catch (error) { if (error.status) throw error; send(res, 400, { error: 'Invalid JSON' }); return; }
        send(res, 200, { project: await writeLocked(id, () => saveProject(root, id, body)) }); return;
      }
      if (req.method === 'POST' && subroute === 'background') {
        if (req.headers['content-type'] !== 'video/mp4') { send(res, 415, { error: 'MP4 required' }); return; }
        const rev = Number(req.headers['x-project-revision']);
        if (!Number.isSafeInteger(rev) || rev < 0) { send(res, 400, { error: 'Project revision header required' }); return; }
        const existing = await loadProject(root, id);
        if (existing.revision !== rev) { send(res, 409, { error: 'Project changed elsewhere. Reload.' }); return; }
        const buffer = await bodyBuffer(req, MAX_MP4_BYTES);
        if (buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') {
          send(res, 400, { error: 'Not a recognizable MP4 header' }); return;
        }
        const asset = 'bg-' + randomUUID() + '.mp4';
        const dest = projectAssetPath(root, id, asset), tmp = dest + '.tmp';
        try {
          await writeFile(tmp, buffer, { flag: 'wx' });
          await rename(tmp, dest);
          send(res, 200, { project: await writeLocked(id, () => attachBackground(root, id, asset, rev)) });
        } catch (error) {
          await unlink(dest).catch(() => {});
          throw error;
        } finally { await unlink(tmp).catch(() => {}); }
        return;
      }
      if (req.method === 'GET' && subroute === 'background') { await serveMp4(req, res, root, id); return; }
      send(res, 405, { error: 'Method not allowed' });
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status || (error.code === 'ENOENT' ? 404 : /Invalid |Unsupported |must be|Need |Title |Duration |Message |Protected /.test(error.message) ? 400 : 500);
      send(res, status, { error: status === 500 ? 'Server failed. See local logs.' : error.message });
      if (status === 500) console.error('[Shorts Studio]', error);
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.SHORTS_STUDIO_PROJECTS_DIR || DEFAULT_PROJECT_DIR;
  const port = Number(process.env.SHORTS_STUDIO_PORT || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  const server = createEditorServer({ root });
  server.listen(port, '127.0.0.1', () => {
    console.log('Shorts Studio: http://127.0.0.1:' + server.address().port);
    console.log('Project storage: ' + root);
  });
}
