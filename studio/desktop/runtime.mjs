import path from 'node:path';
import { existsSync } from 'node:fs';
import { DEFAULT_PROJECT_DIR } from '../editor/project.mjs';

export const APP_ID = 'jp.elitemay.shortsstudio';
export const APP_NAME = 'Shorts Studio';

export function setupDesktopEnvironment({ packaged, resourcesPath, env = process.env } = {}) {
  const result = { root: env.SHORTS_STUDIO_PROJECTS_DIR || DEFAULT_PROJECT_DIR };
  if (packaged) {
    const ffmpeg = path.join(resourcesPath, 'bin', 'ffmpeg.exe');
    const ffprobe = path.join(resourcesPath, 'bin', 'ffprobe.exe');
    if (!existsSync(ffmpeg) || !existsSync(ffprobe)) {
      throw Error('Packaged FFmpeg or FFprobe is missing. Please reinstall Shorts Studio.');
    }
    env.SHORTS_FFMPEG = ffmpeg;
    env.SHORTS_FFPROBE = ffprobe;
    env.SHORTS_VOICE_SCRIPT = path.join(resourcesPath, 'app.asar.unpacked', 'editor', 'voice_sync.py');
    result.ffmpeg = ffmpeg;
    result.ffprobe = ffprobe;
  }
  if (!env.SHORTS_PYTHON && process.platform === 'win32') {
    const candidates = [
      'D:/AI/shorts-voice-env/Scripts/python.exe',
      'D:/AI/experiments/shorts-venv/Scripts/python.exe'
    ];
    const candidate = candidates.find(file => existsSync(file));
    if (candidate) env.SHORTS_PYTHON = candidate;
  }
  return result;
}
