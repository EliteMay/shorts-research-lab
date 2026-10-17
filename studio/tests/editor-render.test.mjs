import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../editor/project.mjs';
import { planShots, makeConcat, VIDEO_WIDTH, VIDEO_HEIGHT, FPS } from '../editor/render.mjs';

test('shot timings cover entire duration without drift, preserving tenths of a second', () => {
  const project=makeProject();
  project.durationSeconds=31;
  project.messages=[
    { id:'m1',speaker:'Mom',text:'Start',atSeconds:0 },
    { id:'m2',speaker:'Me',text:'Next',atSeconds:1.1 },
    { id:'m3',speaker:'Mom',text:'End',atSeconds:30.9 }
  ];
  const shots=planShots(project);
  assert.deepEqual(shots.map(x=>x.frame),[0,33,927]);
  assert.equal(shots.reduce((sum,s)=>sum+s.frames,0),930);
  assert.equal(shots.at(-1).frames,3);
  assert.equal(VIDEO_WIDTH,720);
  assert.equal(VIDEO_HEIGHT,1280);
  assert.equal(FPS,30);
});
test('concat manifest uses duration, repeats last image and escapes apostrophes', () => {
  const result=makeConcat([
    { image:"D:/render/chat-0.png",duration:1.1 },
    { image:"D:/render/it's-chat.png",duration:4.9 }
  ]);
  assert.match(result,/ffconcat version 1.0/);
  assert.match(result,/duration 1.100000000/);
  assert.match(result,/duration 4.900000000/);
  assert.ok(result.endsWith("file 'D:/render/it'\\''s-chat.png'\n"));
  assert.throws(()=>makeConcat([]),/Invalid/);
});
