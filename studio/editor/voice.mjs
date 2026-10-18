import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_SPEECH_SEC = 30;
export const SPEECH_MARGIN_SEC = .12;

export function planVoiceMix(project, durations) {
  if (!Array.isArray(durations) || durations.length !== project.messages.length) {
    throw Error('The speech clip count must match the chat message count');
  }
  const placements = [];
  for (let i = 0; i < durations.length; i++) {
    const duration = durations[i];
    const start = project.messages[i].atSeconds;
    const limit = project.messages[i + 1]?.atSeconds ?? project.durationSeconds;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SPEECH_SEC) {
      throw Error('Invalid spoken audio duration for message ' + (i + 1));
    }
    if (start + duration + SPEECH_MARGIN_SEC > limit + .001) {
      const available = (limit - start - SPEECH_MARGIN_SEC).toFixed(2);
      const error = new Error('セリフ' + (i + 1) + ' の音声は ' + duration.toFixed(2) +
        '秒ですが、次の発言まで ' + available + '秒しかありません。発言時刻を離すか文章を短くしてください。');
      error.publicMessage = true;
      throw error;
    }
    placements.push({
      index: i, startSeconds: start, durationSeconds: duration,
      delayMs: Math.round(start * 1000)
    });
  }
  return placements;
}
export function makeAudioFilter(placements, totalDuration) {
  if (!placements.length || !Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw Error('Invalid audio filter parameters');
  }
  const parts = placements.map(p =>
    '[' + (p.index + 2) + ':a]' +
    'aresample=48000,asetpts=PTS-STARTPTS,' +
    'adelay=' + p.delayMs + ':all=1,volume=0.9[speech' + p.index + ']'
  );
  const inputs = placements.map(p => '[speech' + p.index + ']').join('');
  parts.push(inputs + 'amix=inputs=' + placements.length +
    ':duration=longest:dropout_transition=0,' +
    'alimiter=limit=0.90,apad,atrim=duration=' + totalDuration + '[outa]');
  return parts.join(';');
}
export async function synthesizeEnglishSpeech({ project, work, python, runCommand, ffmpeg, ffprobe }) {
  if (project.language !== 'en') {
    const error = new Error('英語音声は英語の台本でのみ使用できます。');
    error.publicMessage = true;
    throw error;
  }
  const script = path.join(work, 'voice-script.json');
  const clipsDir = path.join(work, 'voice');
  await writeFile(script, JSON.stringify({ messages: project.messages }), 'utf8');
  let response;
  try {
    response = await runCommand(python, [
      path.join(THIS_DIR, 'voice_sync.py'), '--input', script, '--output', clipsDir
    ], { timeoutMs: 240_000 });
  } catch (error) {
    const publicError = new Error('英語音声の生成に失敗しました。ネット接続・Pythonのedge-tts環境を確認してください。');
    publicError.publicMessage = true;
    publicError.cause = error;
    throw publicError;
  }
  let result;
  try { result = JSON.parse(response.trim()); }
  catch { throw Error('Speech generator did not return valid JSON'); }
  if (!Array.isArray(result.clips) || result.clips.length !== project.messages.length) {
    throw Error('Speech generator did not return all the message clips');
  }
  const files = [];
  const durations = [];
  for (let i = 0; i < result.clips.length; i++) {
    const clip = result.clips[i];
    if (clip.index !== i || clip.file !== 'clip-' + String(i).padStart(3, '0') + '.mp3') {
      throw Error('Invalid clip identity in speech generator result');
    }
    const filename = path.join(clipsDir, clip.file);
    const aligned = path.join(clipsDir, 'aligned-' + String(i).padStart(3, '0') + '.wav');
    // Edge streams can contain a 0.2s leading silence. Keep 50ms breath room;
    // never trim trailing natural pauses or internal pauses in this stage.
    await runCommand(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', filename,
      '-af', 'silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB:start_silence=0.05,aresample=48000',
      '-ar', '48000', '-ac', '1', aligned
    ], { timeoutMs: 25_000 });
    const raw = await runCommand(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', aligned
    ], { timeoutMs: 20_000 });
    const seconds = Number(JSON.parse(raw).format?.duration);
    if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Invalid synthesized audio duration');
    files.push(aligned);
    durations.push(seconds);
  }
  const placements = planVoiceMix(project, durations);
  return {
    files,
    placements,
    voices: result.clips.map(c => c.voice),
    provider: 'edge-tts-external-network',
    rightsVerified: false
  };
}
