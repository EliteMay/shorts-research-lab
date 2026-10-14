/** Real Chromium smoke test using synthetic candidates and images only. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(studio,'review-e2e-evidence');
await mkdir(output,{recursive:true});

const origin='https://upload.wikimedia.org/wikipedia/commons/';
const source='https://commons.wikimedia.org/wiki/File:';
const scenarios=['寝ている猫','外を見ている猫'];
const discovery={
 provider:'Wikimedia Commons',status:'review-required',
 scenes:scenarios.map((n,i)=>({
   sceneIndex:i,sceneId:'scene-'+(i+1),narration:n,
   candidates:[{
     title:'File:Studio_UI_Synthetic_'+(i+1)+'.png',
     imageUrl:origin+'a/ab/Synthetic_'+(i+1)+'.png',
     sourcePage:source+'Studio_UI_Synthetic_'+(i+1)+'.png',
     creator:'Test Fixture Author',license:'CC0',
     rightsStatus:'needs-human-license-review'
   }]
 }))
};
const server=spawn(process.execPath,['review/serve.mjs'],{
 cwd:studio,stdio:['ignore','pipe','pipe'],shell:false
});
let browser;
try {
  const address=await Promise.race([
    new Promise((resolve,reject)=>{
      let output='';
      server.stdout.on('data',buf=>{
        output+=buf.toString();
        const found=output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if(found)resolve(found[0]);
      });
      server.once('error',reject);
      server.once('exit',code=>reject(new Error('Local server exited: '+code)));
    }),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout')),10000))
  ]);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://upload.wikimedia.org/**',route=>{
    const color=route.request().url().includes('Synthetic_1')?'#599ed5':'#75bbaa';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="'+color+'"/><circle cx="400" cy="240" r="130" fill="#f5f5f3"/></svg>';
    return route.fulfill({status:200,contentType:'image/svg+xml',body:svg});
  });
  await page.goto(address,{waitUntil:'load'});
  assert.match(await page.locator('h1').innerText(),/動画素材を確認する/);
  assert.equal(await page.locator('#workspace').isVisible(),false);
  await page.screenshot({path:path.join(output,'01-empty-desktop.png'),fullPage:true});
  await page.locator('#sourceFile').setInputFiles({
    name:'test-candidates.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(discovery))
  });
  await page.getByText('シーン 1 の画像候補').waitFor();
  assert.equal(await page.locator('#exportBtn').isDisabled(),true);
  assert.equal(await page.locator('article.candidate').count(),1);
  await page.screenshot({path:path.join(output,'02-candidates-loaded.png'),fullPage:true});
  await page.getByRole('button',{name:'この候補を選ぶ'}).click();
  await page.getByRole('checkbox',{name:/ライセンス全文/}).check();
  await page.getByRole('checkbox',{name:/ナレーションと一致/}).check();
  await page.getByRole('checkbox',{name:/自分で確認/}).check();
  await page.getByLabel('動画に記載する作者・クレジット').fill('Synthetic Fixture Author');
  await page.getByLabel('実際に確認した利用条件と確認日').fill('SYNTHETIC TEST ONLY - not real rights verification');
  assert.equal(await page.locator('#exportBtn').isDisabled(),true);
  await page.locator('#sceneNav button').nth(1).click();
  await page.getByText('シーン 2 の画像候補').waitFor();
  await page.getByRole('button',{name:'この候補を選ぶ'}).click();
  await page.getByRole('checkbox',{name:/ライセンス全文/}).check();
  await page.getByRole('checkbox',{name:/ナレーションと一致/}).check();
  await page.getByRole('checkbox',{name:/自分で確認/}).check();
  await page.getByLabel('動画に記載する作者・クレジット').fill('Synthetic Fixture Author');
  await page.getByLabel('実際に確認した利用条件と確認日').fill('SYNTHETIC TEST ONLY - not real rights verification');
  assert.equal(await page.locator('#exportBtn').isEnabled(),true);
  assert.match(await page.locator('#progress').innerText(),/2 \/ 2/);
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportBtn').click()
  ]);
  assert.equal(download.suggestedFilename(),'review.json');
  const payload=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(payload.length,2);
  assert.deepEqual(payload.map(x=>x.imageUrl),discovery.scenes.map(x=>x.candidates[0].imageUrl));
  assert.ok(payload.every(x=>x.rightsReviewed&&x.humanApproved&&x.visualMatchesNarration));
  await page.screenshot({path:path.join(output,'03-reviewed-desktop.png'),fullPage:true});
  await page.locator('#sceneNav button').first().click();
  assert.equal(await page.getByRole('checkbox',{name:/自分で確認/}).isChecked(),true);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'04-reviewed-mobile.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,'Mobile layout overflows horizontally by '+overflow+'px');
  assert.deepEqual(errors,[],'Unexpected browser errors: '+errors.join(' | '));
  const badPage=await context.newPage();
  await badPage.goto(address);
  await badPage.locator('#sourceFile').setInputFiles({
    name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{not json')
  });
  await badPage.locator('#message.error').waitFor();
  assert.equal(await badPage.locator('#exportBtn').isVisible(),false);
  await badPage.close();
  await context.close();
  console.log('Chromium E2E passed: upload, two-scene review, refusal, download, mobile, invalid JSON. All assets synthetic.');
} finally {
  if(browser)await browser.close();
  server.kill();
}
