import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const httpUrl = (value) => {
  if (!text(value)) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};

/** Deterministic checks only. These never assess whether a video is actually good. */
export function reviewStoryboard(plan, { ready = false } = {}) {
  const errors = [];
  const warnings = [];
  const error = (where, message) => errors.push({ where, message });
  const warn = (where, message) => warnings.push({ where, message });

  if (!plan || Array.isArray(plan) || typeof plan !== 'object') {
    return { ok: false, errors: [{ where: '$', message: '絵コンテはJSONオブジェクトにしてください' }], warnings };
  }
  if (plan.version !== 1) error('version', '対応している形式はversion: 1です');
  if (!text(plan.topic)) error('topic', 'テーマは必須です');
  if (!text(plan.audience)) error('audience', '想定視聴者は必須です');
  const seconds = plan.targetSeconds;
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 180) {
    error('targetSeconds', '動画の長さは10〜180秒の整数にしてください');
  }
  for (const key of ['hook', 'progression', 'payoff']) {
    if (!text(plan.story?.[key])) error('story.' + key, '冒頭の疑問・途中の進展・結末を明示してください');
  }
  const scenes = plan.scenes;
  if (!Array.isArray(scenes) || scenes.length < 3 || scenes.length > 20) {
    error('scenes', 'シーンは3〜20件必要です');
  } else {
    const ids = new Set();
    let cursor = 0;
    for (const [i, scene] of scenes.entries()) {
      const at = 'scenes[' + i + ']';
      if (!scene || typeof scene !== 'object' || Array.isArray(scene)) { error(at, 'シーンはオブジェクトです'); continue; }
      if (!text(scene.id) || ids.has(scene.id)) error(at + '.id', '重複しないIDが必要です');
      else ids.add(scene.id);
      const start = scene.startMs;
      const end = scene.endMs;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start !== cursor || end <= start) {
        error(at + '.timing', 'シーンの時間はミリ秒で連続し、終了が開始より後である必要があります');
      }
      if (Number.isInteger(end) && end > start) {
        if (end - start < 1200) warn(at + '.timing', '1.2秒未満のシーンです。理解できる長さか確認してください');
        cursor = end;
      }
      if (!text(scene.narration)) error(at + '.narration', 'ナレーションまたは画面上の文章が必要です');
      if (!text(scene.visual?.description)) error(at + '.visual.description', '映像が何を伝えるか説明してください');
      if (!['planned', 'original', 'stock', 'generated'].includes(scene.visual?.source)) {
        error(at + '.visual.source', '映像の取得方法が不明です');
      }
      if (ready) {
        if (scene.visual?.source === 'planned') error(at + '.visual.source', '実際の映像素材を用意してください');
        if (scene.visual?.rights !== 'verified') error(at + '.visual.rights', '利用権利の確認が必要です');
        if (scene.review?.visualMatchesNarration !== true) error(at + '.review.visualMatchesNarration', 'ナレーションと実素材の一致を確認してください');
      } else if (scene.visual?.source === 'planned') {
        warn(at + '.visual.source', '素材は未選定です');
      }
      const claims = scene.factualClaims ?? [];
      if (!Array.isArray(claims)) error(at + '.factualClaims', '事実主張は配列で指定してください');
      else for (const [j, claim] of claims.entries()) {
        if (!text(claim?.text)) error(at + '.factualClaims[' + j + '].text', '主張の本文が必要です');
        if (ready && (!httpUrl(claim?.sourceUrl) || claim?.verified !== true)) {
          error(at + '.factualClaims[' + j + ']', '主張の出典URLと人による照合結果が必要です');
        } else if (!httpUrl(claim?.sourceUrl)) {
          warn(at + '.factualClaims[' + j + ']', '根拠URLが未設定です');
        }
      }
    }
    if (Number.isInteger(seconds) && cursor !== seconds * 1000) {
      error('scenes.timing', '全シーンの終了(' + cursor + 'ms)と目標尺(' + seconds * 1000 + 'ms)が一致しません');
    }
  }
  if (ready && plan.review?.scriptApproved !== true) {
    error('review.scriptApproved', '台本の人による最終確認が必要です');
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function run(argv = process.argv.slice(2)) {
  const ready = argv.includes('--ready');
  const files = argv.filter((arg) => arg !== '--ready');
  if (files.length !== 1) {
    console.error('使い方: node studio/src/quality-check.mjs <storyboard.json> [--ready]');
    return 2;
  }
  try {
    const plan = JSON.parse(readFileSync(files[0], 'utf8'));
    const report = reviewStoryboard(plan, { ready });
    console.log(JSON.stringify({ mode: ready ? '制作前' : '下書き', ...report }, null, 2));
    return report.ok ? 0 : 1;
  } catch (err) {
    console.error('入力を読み取れません: ' + err.message);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
