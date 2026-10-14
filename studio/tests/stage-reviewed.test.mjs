import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkedImageUrl, fetchLimitedImage, stageReviewedAssets } from '../assets/stage-reviewed.mjs';

const url='https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg';
const source='https://commons.wikimedia.org/wiki/File:Cat.jpg';
const discovery={scenes:[{sceneIndex:0,sceneId:'cat',candidates:[{
 imageUrl:url,sourcePage:source,creator:'Example Photographer',license:'CC BY 4.0',
 licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 rightsStatus:'needs-human-license-review'
}]}]};
const pick={sceneIndex:0,imageUrl:url,sourcePage:source,rightsReviewed:true,
 visualMatchesNarration:true,humanApproved:true,credit:'Example Photographer',
 licenseSnapshot:'CC BY 4.0, verified at source on 2026-10-15'};

test('only exact Commons direct-image URLs are allowed',()=>{
 assert.equal(checkedImageUrl(url),url);
 for(const bad of [
  'http://upload.wikimedia.org/wikipedia/commons/a.jpg',
  'https://upload.wikimedia.org.attacker.test/wikipedia/commons/cat.jpg',
  'https://upload.wikimedia.org/evil.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/evil.svg'
 ]) assert.throws(()=>checkedImageUrl(bad));
});
test('byte limit and type gate blocks invalid response',async()=>{
 const bad=await assert.rejects(()=>fetchLimitedImage(url,{fetchImpl:async()=>new Response('not image content')}));
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(120)]);
 assert.equal((await fetchLimitedImage(url,{fetchImpl:async()=>new Response(png)})).length,png.length);
 await assert.rejects(()=>fetchLimitedImage(url,{maxBytes:60,fetchImpl:async()=>new Response(png)}),/上限/);
});
test('unreviewed image is never materialized',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'shorts-assets-test-'));
 try{
  const selection={...pick,humanApproved:false};
  await assert.rejects(()=>stageReviewedAssets(discovery,[selection],path.join(root,'out')),/未承認/);
  await assert.rejects(stat(path.join(root,'out')),{code:'ENOENT'});
 } finally {await rm(root,{recursive:true,force:true});}
});
test('successful staging produces image hash, license trace, not publication approval',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'shorts-assets-test-'));
 try{
  const data=Buffer.alloc(120,3), rendered=Buffer.alloc(256,6);
  const result=await stageReviewedAssets(discovery,[pick],path.join(root,'out'),{
   download:async()=>data,
   convert:async(_raw,output)=>writeFile(output,rendered)
  });
  assert.equal(result.qualityApproved,false);
  assert.equal(result.scenes.length,1);
  assert.equal(result.scenes[0].creator,'Example Photographer');
  assert.equal((await readFile(path.join(root,'out','scene-1.png'))).length,256);
  assert.match(result.scenes[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await readFile(path.join(root,'out','reviewed-assets.json'),'utf8')).qualityApproved,false);
  await assert.rejects(()=>stageReviewedAssets(discovery,[pick],path.join(root,'out'),{
   download:async()=>data,convert:async()=>{}
  }),/上書き/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('remote download failures are not hidden',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'shorts-assets-test-'));
 try {
  await assert.rejects(()=>stageReviewedAssets(discovery,[pick],path.join(root,'out'),{
   download:async()=>{throw new Error('HTTP 429');}
  }),/HTTP 429/);
  await assert.rejects(stat(path.join(root,'out')),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
