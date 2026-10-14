import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewStoryboard } from '../src/quality-check.mjs';

const fixture = new URL('../examples/storyboard.json', import.meta.url);
const base = () => JSON.parse(readFileSync(fixture, 'utf8'));

test('下書きの構造は正常でも、未選定素材は警告する', () => {
  const report = reviewStoryboard(base());
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((x) => x.where.includes('visual.source')));
});

test('素材・権利・人的確認がない下書きを制作可能扱いしない', () => {
  const report = reviewStoryboard(base(), { ready: true });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((x) => x.where.includes('visual.rights')));
  assert.ok(report.errors.some((x) => x.where === 'review.scriptApproved'));
});

test('時間の重なりや空白を検出する', () => {
  const p = base();
  p.scenes[1].startMs += 100;
  const r = reviewStoryboard(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.where === 'scenes[1].timing'));
});

test('尺の不一致を検出する', () => {
  const p = base();
  p.scenes.at(-1).endMs -= 2000;
  const r = reviewStoryboard(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.where === 'scenes.timing'));
});

test('事実主張があるなら制作前に出典と検証が必要', () => {
  const p = base();
  p.scenes[0].factualClaims = [{ text: '確認が必要な主張', sourceUrl: 'file:///tmp/a', verified: true }];
  const r = reviewStoryboard(p, { ready: true });
  assert.ok(r.errors.some((x) => x.where.includes('factualClaims')));
});

test('必要な確認が済んだ絵コンテを制作準備完了とする', () => {
  const p = base();
  p.review.scriptApproved = true;
  for (const scene of p.scenes) {
    scene.visual.source = 'original';
    scene.visual.rights = 'verified';
    scene.review.visualMatchesNarration = true;
  }
  const r = reviewStoryboard(p, { ready: true });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('不正な入力を例外なく拒否する', () => {
  for (const value of [null, [], 'abc', {}]) assert.equal(reviewStoryboard(value).ok, false);
});

test('シーンIDの重複を検出する', () => {
  const p = base();
  p.scenes[1].id = p.scenes[0].id;
  assert.ok(reviewStoryboard(p).errors.some((e) => e.where === 'scenes[1].id'));
});
