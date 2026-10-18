import { access, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '.runtime');

async function resolveBinary(executable) {
  const name = executable + (process.platform === 'win32' ? '.exe' : '');
  const searchPaths = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  for (const entry of searchPaths) {
    const candidate = path.join(entry || '.', name);
    if (existsSync(candidate)) {
      await access(candidate);
      return candidate;
    }
  }
  throw new Error(name + ' was not found on PATH. Install FFmpeg first.');
}

if (process.platform !== 'win32') throw new Error('Shorts Studio desktop packaging currently targets Windows.');
await mkdir(target, { recursive: true });
for (const name of ['ffmpeg', 'ffprobe']) {
  const from = await resolveBinary(name);
  const to = path.join(target, name + '.exe');
  await copyFile(from, to);
  console.log(name + ': bundled from ' + from);
}
const license = path.resolve(path.dirname(await resolveBinary('ffmpeg')), '..', 'LICENSE');
if (!existsSync(license)) throw Error('FFmpeg redistribution license file is missing from the installed distribution.');
await copyFile(license, path.join(target, 'FFmpeg-LICENSE.txt'));
console.log('Runtime binaries and the FFmpeg distribution license copied to ' + target);
