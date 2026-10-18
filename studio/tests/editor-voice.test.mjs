import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProject} from '../editor/project.mjs';
import {planVoiceMix, makeAudioFilter} from '../editor/voice.mjs';

test('English voice clips align to reveal times and are not silently clipped', () => {
  const p=makeProject();
  p.durationSeconds=12;
  p.messages=[
    {id:'m1',speaker:'Mom',text:'Where are you?',atSeconds:1},
    {id:'m2',speaker:'Me',text:'At home.',atSeconds:4},
    {id:'m3',speaker:'Mom',text:'Who is in your room?',atSeconds:8}
  ];
  const plan=planVoiceMix(p,[1.872,2.16,2.472]);
  assert.deepEqual(plan.map(x=>x.delayMs),[1000,4000,8000]);
  assert.deepEqual(plan.map(x=>x.index),[0,1,2]);
  const f=makeAudioFilter(plan,p.durationSeconds);
  assert.match(f, /\[2:a\].*adelay=1000:all=1/);
  assert.match(f, /\[3:a\].*adelay=4000:all=1/);
  assert.match(f, /\[4:a\].*adelay=8000:all=1/);
  assert.match(f,/amix=inputs=3/);
  assert.match(f,/alimiter=limit=0\.90/);
  assert.match(f,/atrim=duration=12\[outa\]/);
});
test('overlong voice clips fail instead of overlap or truncate speech',()=>{
  const p=makeProject();
  p.durationSeconds=12;
  p.messages=[
    {id:'m1',speaker:'Mom',text:'A',atSeconds:1},
    {id:'m2',speaker:'Me',text:'B',atSeconds:4}
  ];
  assert.throws(()=>planVoiceMix(p,[3.01,1]),/セリフ1/);
  assert.throws(()=>planVoiceMix(p,[1,8]),/セリフ2/);
  assert.throws(()=>planVoiceMix(p,[1]),/count/);
  assert.throws(()=>planVoiceMix(p,[0,1]),/Invalid/);
});
