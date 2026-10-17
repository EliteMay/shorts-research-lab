import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { convertTopicDraft } from '../generation/topic-planner.mjs';
import { findLocalModel, generateWithLocalAI } from '../generation/local-ai.mjs';
import { parseArgs, saveDraft, run } from '../generation/generate.mjs';
import { reviewStoryboard } from '../src/quality-check.mjs';

const narrations=[
  '玄関に帰ってきた小さなロボットが、ポケットを探して大慌てします。鍵がありません。',
  'かばんを開けても、さっき歩いた道を探し直しても、大事な鍵が見つかりません。',
  '公園のベンチに戻ると、胸のあたりから小さな鈴のような音が聞こえました。',
  'おそるおそる下を見ると、首から下げていた鍵が、夕日にきらりと光っています。',
  '鍵は最初からそこにあったのです。ロボットは照れくさそうに笑って家に入ります。'
];
const candidate=()=>({
  mode:'fiction',title:'ロボットが鍵をなくした日',hookText:'鍵が消えた？',audience:'短編物語が好きな人',
  description:'ロボットと鍵のショートストーリー',
  story:{hook:'鍵が突然なくなった',progression:'探し回るうち首元に音がする',payoff:'鍵は首にかかっていた'},
  scenes:narrations.map((n,i)=>({
    narration:n,visualDescription:'ロボットが場所'+i+'で困った顔をして鍵を探す',
    searchQuery:'little robot searching keys sunset '+i,
    imagePrompt:'vertical illustration robot looking for key scene '+i,
    factualClaims:[]
  }))
});
function mockResponse(payload){return new Response(JSON.stringify(payload),{
  status:200,headers:{'Content-Type':'application/json'}
});}
test('theme draft maps to two production schemas with exact same narration',()=>{
  const r=convertTopicDraft(candidate(),{topic:'鍵をなくしたロボット'});
  assert.equal(r.checks.ok,true);
  assert.equal(r.storyboard.scenes.at(-1).endMs,30000);
  assert.equal(r.storyboard.scenes[0].startMs,0);
  assert.equal(r.storyboard.scenes.length,5);
  assert.deepEqual(r.storyboard.scenes.map(s=>s.narration),r.production.scenes.map(s=>s.narration));
  assert.ok(r.checks.warnings.length>0);
  assert.equal(r.manifest.readyForRendering,false);
  assert.equal(r.storyboard.review.scriptApproved,false);
  assert.equal(reviewStoryboard(r.storyboard,{ready:true}).ok,false);
});
test('factual draft untrusted links and verified flags are discarded',()=>{
  const p=candidate();p.mode='factual';
  p.scenes[2].factualClaims=[{text:'専門家が検証を要する主張',sourceUrl:'https://example.com/fake',verified:true}];
  const r=convertTopicDraft(p,{topic:'ロボットの機械的な仕組み'});
  assert.deepEqual(r.storyboard.scenes[2].factualClaims,[{
    text:'専門家が検証を要する主張',sourceUrl:null,verified:false
  }]);
  assert.equal(r.manifest.factualClaimsPending,1);
  assert.equal(reviewStoryboard(r.storyboard,{ready:true}).ok,false);
});
test('factual topic without tracked claims does not pass',()=>{
  const p=candidate();p.mode='factual';
  assert.throws(()=>convertTopicDraft(p,{topic:'実際のニュース'}),/factualClaims/);
});
test('fiction cannot hide factualClaims',()=>{
  const p=candidate();p.scenes[1].factualClaims=[{text:'実際の猫の特性'}];
  assert.throws(()=>convertTopicDraft(p,{topic:'ロボット'}),/創作/);
});
test('ambiguous scene and filler narration do not pass',()=>{
  const p=candidate();p.scenes[1].narration=p.scenes[0].narration;
  assert.throws(()=>convertTopicDraft(p,{topic:'鍵'}),/同一/);
  p.scenes[1].narration='こんにちは、最後まで見てね！今日はおもしろいことを教えます。';
  assert.throws(()=>convertTopicDraft(p,{topic:'鍵'}),/禁止/);
});
test('local model discovery refuses model ambiguity and remote port',async()=>{
  await assert.rejects(findLocalModel({port:65536,fetchImpl:async()=>{throw Error('must not connect');}}),/ポート/);
  await assert.rejects(findLocalModel({fetchImpl:async()=>mockResponse({data:[{id:'one'},{id:'two'}]})}),/特定/);
  assert.equal(await findLocalModel({fetchImpl:async()=>mockResponse({data:[{id:'loaded-model'}]})}),'loaded-model');
});
test('local model retries an invalid response and returns a checked draft',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/models'))return mockResponse({data:[{id:'local-test'}]});
    return mockResponse({choices:[{message:{content:calls.filter(x=>x.url.endsWith('/chat/completions')).length===1?
      '{"bad-json"':JSON.stringify(candidate())}}]});
  };
  const r=await generateWithLocalAI({topic:'鍵をなくしたロボット',fetchImpl});
  assert.equal(r.attempt,2);
  assert.equal(r.provider,'local-openai-compatible');
  assert.equal(r.storyboard.scenes.length,5);
  assert.ok(calls.every(x=>x.url.startsWith('http://127.0.0.1:1234/v1/')));
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.stream,false);
  assert.equal(body.response_format,undefined);
  assert.equal(body.model,'local-test');
});
test('model cannot bypass two-attempt limit with invalid JSON',async()=>{
  const fetchImpl=async url=>url.endsWith('/models')?mockResponse({data:[{id:'test'}]}):
    mockResponse({choices:[{message:{content:'not a JSON document'}}]});
  await assert.rejects(generateWithLocalAI({topic:'猫',fetchImpl}),/2回/);
});
test('model cannot force a mode different from user option',()=>{
  assert.throws(()=>convertTopicDraft(candidate(),{topic:'猫',mode:'factual'}),/一致/);
});
test('CLI saves all results without overwriting and without making a quality claim',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'shorts-topic-draft-'));
  try{
    const generated={...convertTopicDraft(candidate(),{topic:'ロボット'}),provider:'local-openai-compatible',
      modelId:'mock-local',attempt:1};
    const save=await run(['--topic','ロボット','--mode','fiction','--out',path.join(root,'draft')],{
      generator:async()=>generated
    });
    assert.equal(save.report.readyForRendering,false);
    const plan=JSON.parse(await readFile(path.join(root,'draft','storyboard.json')));
    const production=JSON.parse(await readFile(path.join(root,'draft','production-script.json')));
    assert.deepEqual(plan.scenes.map(x=>x.narration),production.scenes.map(x=>x.narration));
    await assert.rejects(saveDraft(generated,path.join(root,'draft')),{code:'EEXIST'});
    assert.equal((await readFile(path.join(root,'draft','storyboard.json'),'utf8')).includes('ロボット'),true);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('CLI never runs without explicit output path',()=>{
  assert.throws(()=>parseArgs(['--topic','猫']),/必須/);
  assert.throws(()=>parseArgs(['--topic','猫','--out','x','--port','not-number']),/ポート/);
});


test('short generated script is rejected before a misleading 30-second storyboard is saved',()=>{
  const p=candidate();
  p.scenes=p.scenes.map((s,i)=>({...s,narration:[
    'ロボットは鍵を落として慌てました。',
    '道を戻って探します。',
    'いつもの場所にもありません。',
    '最後に首元を確かめます。',
    '鍵はそこにありました。'][i]}));
  assert.throws(()=>convertTopicDraft(p,{topic:'鍵をなくしたロボット'}),/140〜205文字/);
});

test('Qwen3 /nothink applies to original request and retry, but not other models',async()=>{
  const snapshots=[];
  const fetchImpl=async (url,options)=>{
    if(url.endsWith('/models')) return mockResponse({data:[{id:'qwen/qwen3-8b'}]});
    const body=JSON.parse(options.body);
    snapshots.push(body.messages.at(-1).content);
    const content=snapshots.length===1?'{"broken":':JSON.stringify(candidate());
    return mockResponse({choices:[{message:{content}}]});
  };
  const r=await generateWithLocalAI({topic:'鍵をなくしたロボット',fetchImpl});
  assert.equal(r.attempt,2);
  assert.equal(snapshots.length,2);
  assert.ok(snapshots.every(message=>message.endsWith('/nothink')));

  const other=[];
  await generateWithLocalAI({topic:'鍵をなくしたロボット',model:'qwen2.5-coder-7b-instruct',
    fetchImpl:async(url,opts)=>{
      other.push(JSON.parse(opts.body).messages.at(-1).content);
      return mockResponse({choices:[{message:{content:JSON.stringify(candidate())}}]});
    }});
  assert.equal(other.length,1);
  assert.equal(other[0].includes('/nothink'),false);
});
