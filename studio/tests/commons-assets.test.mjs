import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCommonsCandidates, searchCommons, discoverSceneCandidates, validateApprovedPicks } from '../assets/commons-assets.mjs';

const payload={query:{pages:[{
 title:'File:Cat.jpg',
 imageinfo:[{
 url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:Cat.jpg',
 width:1024,height:768,
 extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},Artist:{value:'Alice'}}
 }]
}]}};
const mockFetch=async()=>({ok:true,json:async()=>payload});

test('画像候補は未承認で返る',()=>{
 const c=decodeCommonsCandidates(payload);
 assert.equal(c.length,1);
 assert.equal(c[0].approved,false);
 assert.equal(c[0].rightsStatus,'needs-human-license-review');
});
test('第三者配信画像を排除する',()=>{
 const d=structuredClone(payload);
 d.query.pages[0].imageinfo[0].url='https://example.org/cat.jpg';
 assert.equal(decodeCommonsCandidates(d).length,0);
});
test('権利情報不明は除外対象とする',()=>{
 const d=structuredClone(payload);
 delete d.query.pages[0].imageinfo[0].extmetadata.LicenseShortName;
 assert.equal(decodeCommonsCandidates(d)[0].rightsStatus,'not-eligible-by-license-allowlist');
});
test('シーンの検索語で画像候補を取得する',async()=>{
 const d=await discoverSceneCandidates({scenes:[{narration:'猫',search_query:'sleepy cat'}]},{fetchImpl:mockFetch});
 assert.equal(d.scenes.length,1);
 assert.equal(d.status,'review-required');
});
test('意味と権利の確認が両方必要',async()=>{
 const d=await discoverSceneCandidates({scenes:[{narration:'猫',search_query:'cat'}]},{fetchImpl:mockFetch});
 const c=d.scenes[0].candidates[0];
 const pick={sceneIndex:0,sourcePage:c.sourcePage,imageUrl:c.imageUrl,rightsReviewed:true,visualMatchesNarration:false,humanApproved:true,credit:'Alice',licenseSnapshot:'CC BY-SA 4.0'};
 assert.equal(validateApprovedPicks(d,[pick]).ok,false);
 pick.visualMatchesNarration=true;
 assert.equal(validateApprovedPicks(d,[pick]).ok,true);
});
test('出典と異なる採用画像を拒否',async()=>{
 const d=await discoverSceneCandidates({scenes:[{narration:'猫',search_query:'cat'}]},{fetchImpl:mockFetch});
 assert.equal(validateApprovedPicks(d,[{sceneIndex:0,sourcePage:'other',imageUrl:'other',rightsReviewed:true,visualMatchesNarration:true,humanApproved:true,credit:'x',licenseSnapshot:'x'}]).ok,false);
});
test('APIレート制限では黙ってダミーへ置換しない',async()=>{
 await assert.rejects(searchCommons('cat',{fetchImpl:async()=>({ok:false,status:429})}),/HTTP 429/);
});
test('長すぎる検索語を拒否',async()=>{
 await assert.rejects(searchCommons('a'.repeat(131),{fetchImpl:mockFetch}),/検索文/);
});
