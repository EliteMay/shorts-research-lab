import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProject, projectAssetPath, atomicWrite } from './project.mjs';
import { synthesizeEnglishSpeech, makeAudioFilter } from './voice.mjs';

export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;
export const FPS = 30;
const CHAT_HEIGHT = Math.round(VIDEO_HEIGHT * .6);
const BG_HEIGHT = VIDEO_HEIGHT - CHAT_HEIGHT;
const RENDER_FILE = 'chat-preview.mp4';
const REPORT_FILE = 'chat-preview-report.json';

export function planShots(project, fps = FPS) {
  const frameCount = project.durationSeconds * fps;
  const marks = [...new Set([0, ...project.messages.map(m => Math.round(m.atSeconds * fps))])]
    .filter(n => n < frameCount).sort((a, b) => a - b);
  return marks.map((start, i) => {
    const end = marks[i + 1] ?? frameCount;
    return { frame: start, atSeconds: start / fps, frames: end - start, duration: (end - start) / fps };
  });
}
function quotedConcatPath(file) {
  return "'" + file.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'";
}
export function makeConcat(shots) {
  if (!shots.length || shots.some(s => !s.image || s.duration <= 0)) throw Error('Invalid shot manifest');
  return 'ffconcat version 1.0\n' + shots.map(s =>
    'file ' + quotedConcatPath(s.image) + '\n' + 'duration ' + s.duration.toFixed(9) + '\n'
  ).join('') + 'file ' + quotedConcatPath(shots.at(-1).image) + '\n';
}
export function run(command, args, { timeoutMs = 9 * 60_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { shell: false, windowsHide: true, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errorOutput = '';
    const append = (previous, incoming) => (previous + incoming.toString()).slice(-15_000);
    process.stdout.on('data', b => output = append(output, b));
    process.stderr.on('data', b => errorOutput = append(errorOutput, b));
    const timer = setTimeout(() => {
      process.kill();
      reject(new Error(command + ' timed out'));
    }, timeoutMs);
    process.once('error', error => { clearTimeout(timer); reject(error); });
    process.once('exit', code => {
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(new Error(command + ' failed (' + code + '): ' + errorOutput));
    });
  });
}
export async function inspectVideo(file, ffprobe = 'ffprobe') {
  const data = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,codec_name:format=duration', '-of', 'json', file], { timeoutMs: 20_000 }));
  const video = data.streams?.find(s => s.codec_type === 'video');
  const duration = Number(data.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 3600 ||
    video.width < 180 || video.height < 180) throw Error('Background MP4 has no usable video stream');
  return { duration, width: video.width, height: video.height, codec: video.codec_name };
}
async function findChrome() {
  const candidates = [
    process.env.SHORTS_CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const file of candidates) {
    try { await access(file); return file; } catch { /* try next */ }
  }
  throw Error('Chrome or Edge was not found. Set SHORTS_CHROME_PATH.');
}
export async function readCurrentExport(root, id) {
  const project = await loadProject(root, id);
  const folder = path.dirname(projectAssetPath(root, id, 'bg-' + '0'.repeat(36) + '.mp4'));
  try {
    const report = JSON.parse(await readFile(path.join(folder, REPORT_FILE), 'utf8'));
    if (report.revision !== project.revision || report.schemaVersion !== 1 || typeof report.hasAudio !== 'boolean') return null;
    await stat(path.join(folder, RENDER_FILE));
    return report;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}
export function outputFile(root, id) {
  return path.join(path.dirname(projectAssetPath(root, id, 'bg-' + '0'.repeat(36) + '.mp4')), RENDER_FILE);
}
export async function renderChatVideo({ root, id, baseUrl, withVoice = false, onProgress = () => {}, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' }) {
  const project = await loadProject(root, id);
  if (!project.background.file) throw Error('Add a background MP4 before exporting');
  const bg = projectAssetPath(root, id, project.background.file);
  await inspectVideo(bg, ffprobe);
  const folder = path.dirname(bg);
  const work = path.join(folder, '.render-' + randomUUID());
  await mkdir(work, { recursive: false });
  let browser;
  try {
    onProgress('ブラウザの描画を準備中');
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ headless: true, executablePath: await findChrome() });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 }, deviceScaleFactor: VIDEO_WIDTH / 330,
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.locator('#workspace').waitFor();
    if (await page.locator('#projectSelect').inputValue() !== id) {
      await page.locator('#projectSelect').selectOption(id);
      await page.waitForFunction(want => document.getElementById('workspace')?.dataset.projectId === want, id);
    }
    await page.locator('#videoFrame').evaluate(el => {
      el.style.width = '330px'; el.style.border = '0'; el.style.borderRadius = '0';
    });
    const shots = planShots(project);
    const snapshots = [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      await page.locator('#timeSlider').fill(String(shot.atSeconds));
      const filename = path.join(work, 'chat-' + String(i).padStart(3, '0') + '.png');
      await page.locator('.conversation-frame').screenshot({ path: filename, animations: 'disabled' });
      snapshots.push({ ...shot, image: filename });
      onProgress('会話シーンを描画中 ' + (i + 1) + '/' + shots.length);
    }
    await context.close();
    await browser.close(); browser = null;
    const concat = path.join(work, 'shots.ffconcat');
    await writeFile(concat, makeConcat(snapshots), 'utf8');
    const staged = path.join(work, 'render.mp4');
    let speech = null;
    if (withVoice) {
      onProgress('英語音声を生成して実際の尺を計測中');
      speech = await synthesizeEnglishSpeech({
        project, work, python: process.env.SHORTS_PYTHON || 'python', runCommand: run, ffmpeg, ffprobe
      });
    }
    onProgress('動く背景と会話をMP4へ合成中');
    const baseInputs = [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-safe', '0', '-f', 'concat', '-i', concat,
      '-stream_loop', '-1', '-i', bg
    ];
    const backgroundInputs = speech ? speech.files.flatMap(file => ['-i', file]) : [];
    const filters =
      '[0:v]fps=' + FPS + ',scale=' + VIDEO_WIDTH + ':' + CHAT_HEIGHT + ':flags=lanczos,format=yuv420p[chat];' +
      '[1:v]fps=' + FPS + ',scale=' + VIDEO_WIDTH + ':' + BG_HEIGHT +
      ':force_original_aspect_ratio=increase,crop=' + VIDEO_WIDTH + ':' + BG_HEIGHT +
      ',setsar=1[bg];[chat][bg]vstack=inputs=2,format=yuv420p[v]' +
      (speech ? ';' + makeAudioFilter(speech.placements, project.durationSeconds) : '');
    await run(ffmpeg, [
      ...baseInputs, ...backgroundInputs,
      '-filter_complex', filters, '-map', '[v]',
      ...(speech ? ['-map', '[outa]', '-c:a', 'aac', '-b:a', '160k'] : ['-an']),
      '-t', String(project.durationSeconds),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      staged
    ], { timeoutMs: 9 * 60_000 });
    const output = await inspectVideo(staged, ffprobe);
    const streams = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', staged], { timeoutMs: 20_000 })).streams || [];
    if (streams.some(s => s.codec_type === 'audio') !== Boolean(speech)) throw Error('The output audio stream does not match the selected mode');
    if (output.width !== VIDEO_WIDTH || output.height !== VIDEO_HEIGHT ||
        Math.abs(output.duration - project.durationSeconds) > .08) throw Error('Rendered MP4 dimensions or duration invalid');
    const latest = await loadProject(root, id);
    if (latest.revision !== project.revision || latest.background.file !== project.background.file) {
      throw Error('Project was edited during render. Export refused; render the latest version.');
    }
    const buffer = await readFile(staged);
    const report = {
      schemaVersion: 1, revision: project.revision, exportedAt: new Date().toISOString(),
      width: VIDEO_WIDTH, height: VIDEO_HEIGHT, fps: FPS, durationSeconds: output.duration,
      sizeBytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'),
      hasAudio: Boolean(speech), voiceProvider: speech?.provider ?? null,
      speechTimings: speech?.placements ?? [],
      voices: speech?.voices ?? [],
      providerRightsVerified: false, qualityApproved: false,
      note: speech ? 'Voiced technical preview. External TTS service terms and human sound/content quality are unreviewed.' :
        'Silent technical preview. Human quality review is not included.'
    };
    await rename(staged, path.join(folder, RENDER_FILE));
    await atomicWrite(path.join(folder, REPORT_FILE), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(work, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}
