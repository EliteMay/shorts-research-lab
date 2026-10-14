import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('local review server only serves explicitly allowed files',async()=>{
  const child=spawn(process.execPath,['review/serve.mjs'],{cwd:new URL('..',import.meta.url).pathname,stdio:['ignore','pipe','pipe']});
  try{
    let output='';
    const base=await Promise.race([
      new Promise((resolve,reject)=>{
        child.stdout.on('data',data=>{
          output+=data.toString();
          const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);
          if(match)resolve(match[0]);
        });
        child.once('error',reject);
        child.once('exit',code=>reject(new Error('Server exited early: '+code)));
      }),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout')),7000))
    ]);
    const ok=await fetch(base+'/index.html');
    assert.equal(ok.status,200);
    assert.match(await ok.text(),/Shorts Studio/);
    assert.match(ok.headers.get('content-type'),/text\/html/);
    const bad=await fetch(base+'/../../secrets.json');
    assert.equal(bad.status,404);
    assert.equal((await fetch(base+'/review-model.mjs')).status,200);
    assert.equal((await fetch(base+'/does-not-exist')).status,404);
  }finally{
    child.kill('SIGTERM');
    await Promise.race([once(child,'exit').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1200))]);
  }
});
