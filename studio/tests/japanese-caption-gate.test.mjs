import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJapaneseCaptions as check} from '../src/japanese-caption-gate.mjs';
const scenes=[{narration:'ロボットは鍵を探しました。'}];
const valid=[{startMs:0,endMs:1000,text:'ロボットは'},{startMs:1000,endMs:2000,text:'鍵を探しました。'}];

test('語を壊さない日本語字幕は合格',()=>assert.equal(check({scenes,cues:valid},{targetMs:2100}).ok,true));
test('単語途中の分割を検出',()=>{
  const cues=[{startMs:0,endMs:1000,text:'ロボッ'},{startMs:1000,endMs:2000,text:'トは鍵を探しました。'}];
  assert.ok(check({scenes,cues}).errors.some(e=>e.includes('語の途中')));
});
test('原文にない半角スペースを拒否',()=>{
  const cues=[{startMs:0,endMs:1000,text:'ロボッ トは鍵を探しました。'}];
  assert.ok(check({scenes,cues}).errors.some(e=>e.includes('スペース')));
});
test('音声台本の文字欠落を拒否',()=>assert.ok(check({scenes,cues:[{startMs:0,endMs:1000,text:'ロボットは鍵を探した。'}]}).errors.some(e=>e.includes('一致'))));
test('表示時間の重複を拒否',()=>{
  const cues=[{startMs:0,endMs:1100,text:'ロボットは'},{startMs:1000,endMs:2100,text:'鍵を探しました。'}];
  assert.ok(check({scenes,cues}).errors.some(e=>e.includes('表示時間')));
});
test('長すぎる字幕を拒否',()=>assert.ok(check({scenes,cues:[{startMs:0,endMs:1000,text:'ロボットは鍵を探しました。'}]},{maxLineLength:8}).errors.some(e=>e.includes('文字数'))));
test('動画尺からのはみ出しを拒否',()=>assert.ok(check({scenes,cues:valid},{targetMs:1800}).errors.some(e=>e.includes('はみ出'))));
