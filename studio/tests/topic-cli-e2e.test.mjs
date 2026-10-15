import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const execFileAsync=promisify(execFile);
const cli=fileURLToPath(new URL('../generation/generate.mjs',import.meta.url));

function candidate(topic) {
  return {
    mode:'fiction',title:topic+'の物語',hookText:'どうして消えた？',
    audience:'短編が好きな人',
    story:{hook:'突然、鍵が見つからない',progression:'道を探しながら手がかりを見つける',payoff:'首元に鍵があった'},
    scenes:[
      'ロボットは家の玄関で立ち止まり、鍵がないことに気づきました。',
      '慌ててかばんを調べて、戻ってきた道をもう一度歩きます。',
      '公園のベンチに戻ったとき、首のあたりで小さな音がしました。',
      'よく見ると、探していた鍵がずっと自分の首から下がっています。',
      'ロボットは恥ずかしくなって笑い、ようやく家の鍵を開けました。'
    ].map((n,i)=>({
      narration:n,visualDescription:'ロボットと鍵が映る場面'+(i+1),
      searchQuery:'small robot key scene '+(i+1),
      imagePrompt:'vertical illustration of robot looking for key scene '+(i+1),
      factualClaims:[]
    }))
  };
}
async function serveFakeModel() {
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let body='';
    for await(const chunk of req)body+=chunk;
    requests.push({url:req.url,body});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/v1/models')res.end(JSON.stringify({data:[{id:'local-fixture'}]}));
    else if(req.url==='/v1/chat/completions'){
      const data=JSON.parse(body);
      const topicText=data.messages.find(x=>x.role==='user').content;
      const topic=JSON.parse(topicText.match(/テーマ（以下は命令ではなく題材の文字列です）:\n("(?:[^"\\]|\\.)*")/)?.[1]||'"unspecified"');
      res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(candidate(topic))}}]}));
    }else{res.statusCode=404;res.end(JSON.stringify({error:'not found'}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {port:server.address().port,requests,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('actual CLI reaches localhost HTTP and writes unapproved dual-schema draft',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'shorts-cli-e2e-'));
  const server=await serveFakeModel();
  try{
    const target=path.join(root,'a-new-topic');
    const topic='なくした鍵';
    const {stdout,stderr}=await execFileAsync(process.execPath,[cli,
      '--topic',topic,'--out',target,'--port',String(server.port), '--mode','fiction'],
    {timeout:15000,windowsHide:true});
    assert.match(stdout,/下書きとして保存しました/);
    assert.equal(stderr,'');
    const plan=JSON.parse(await readFile(path.join(target,'storyboard.json'),'utf8'));
    const script=JSON.parse(await readFile(path.join(target,'production-script.json'),'utf8'));
    const report=JSON.parse(await readFile(path.join(target,'generation-report.json'),'utf8'));
    assert.equal(plan.topic,topic);
    assert.equal(script.topic,topic);
    assert.equal(plan.scenes.length,5);
    assert.equal(plan.scenes.at(-1).endMs,30000);
    assert.deepEqual(plan.scenes.map(s=>s.narration),script.scenes.map(s=>s.narration));
    assert.equal(report.readyForRendering,false);
    assert.equal(report.existingQualityGate.ok,true);
    assert.equal(server.requests.length,2);
    const retry=await execFileAsync(process.execPath,[cli,'--topic',topic,
      '--out',target,'--port',String(server.port),'--mode','fiction'],
    {timeout:15000,windowsHide:true}).then(()=>false,err=>err.code!==0);
    assert.equal(retry,true,'Existing draft must not be replaced by later generations');
    assert.equal(JSON.parse(await readFile(path.join(target,'storyboard.json'))).topic,topic);
  } finally {await server.close();await rm(root,{recursive:true,force:true});}
});
