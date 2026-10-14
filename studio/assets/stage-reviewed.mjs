/** Stage only specifically reviewed Wikimedia images for a local video preview.
 * Data in a review form is self-attested; this cannot establish legal permission.
 */
import { readFile, writeFile, mkdir, mkdtemp, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateApprovedPicks } from './commons-assets.mjs';
const MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_HOST = 'upload.wikimedia.org';
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function checkedImageUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('画像URLが不正'); }
  if (u.protocol !== 'https:' || u.hostname !== IMAGE_HOST ||
      !u.pathname.startsWith('/wikipedia/commons/') || u.username || u.password ||
      u.port || !/\.(?:png|jpe?g|webp)$/i.test(decodeURIComponent(u.pathname))) {
    throw new Error('画像URLはCommonsの直接配信画像のみ利用できます');
  }
  return u.toString();
}
export async function fetchLimitedImage(url, { fetchImpl = fetch, maxBytes = MAX_BYTES } = {}) {
  const target = checkedImageUrl(url);
  const resp = await fetchImpl(target, { redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'ShortsResearchLab/0.1 (https://github.com/EliteMay/shorts-research-lab)' } });
  if (!resp?.ok || !resp.body) throw new Error('画像ダウンロードが失敗しました: HTTP ' + (resp?.status ?? '?'));
  const chunks = []; let size = 0;
  const reader = resp.body.getReader();
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('画像サイズが上限を超えました');
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const data = Buffer.concat(chunks);
  if (data.length < 16) throw new Error('画像データが短すぎます');
  const png = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = data[0]===255 && data[1]===216 && data[2]===255;
  const webp = data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP';
  if (!png && !jpeg && !webp) throw new Error('画像形式がPNG/JPEG/WebPではありません');
  return data;
}
async function callFfmpeg(args) {
  await new Promise((resolve,reject)=>{
    const child=spawn('ffmpeg',args,{shell:false,windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{ child.kill();reject(new Error('ffmpegが時間制限を超過')); },60000);
    child.once('error',err=>{clearTimeout(timer);reject(err);});
    child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('ffmpeg変換失敗 '+code));});
  });
}
export async function convertToPortrait(src,dst) {
  // Keep the whole source image visible; no silent cropping of the subject.
  await callFfmpeg(['-nostdin','-hide_banner','-loglevel','error','-y','-i',src,
    '-frames:v','1','-vf',
    'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1',
    dst]);
}
export async function stageReviewedAssets(discovery, selections, outputDir, {
  download = fetchLimitedImage, convert = convertToPortrait
}={}) {
  const review=validateApprovedPicks(discovery,selections);
  if (!review.ok) throw new Error('未承認素材は配置できません: '+review.errors.join(' / '));
  if (!Array.isArray(discovery?.scenes) || discovery.scenes.length>20 || !discovery.scenes.length)
    throw new Error('シーンの件数が不正');
  const dest=path.resolve(outputDir);
  if (await stat(dest).then(()=>true,err=>err.code==='ENOENT'?false:Promise.reject(err)))
    throw new Error('出力先が存在します。上書きしません');
  await mkdir(path.dirname(dest),{recursive:true});
  const tmp=await mkdtemp(path.join(path.dirname(dest),'.shorts-stage-'));
  try {
    const staged=[];
    for (const [i,scene] of discovery.scenes.entries()) {
      const pick=selections.find(s=>s.sceneIndex===i);
      const candidate=scene.candidates.find(c=>c.imageUrl===pick.imageUrl && c.sourcePage===pick.sourcePage);
      const url=checkedImageUrl(candidate.imageUrl);
      const bytes=await download(url);
      if(!Buffer.isBuffer(bytes)||bytes.length>MAX_BYTES)throw new Error('画像バイト列が不正');
      const original=path.join(tmp,'raw-'+(i+1)+'.img');
      await writeFile(original,bytes,{flag:'wx'});
      const normalized=path.join(tmp,'scene-'+(i+1)+'.png');
      await convert(original,normalized);
      const finalBytes=await readFile(normalized);
      if(finalBytes.length<100)throw new Error('変換画像が空です');
      staged.push({
        sceneIndex:i,sceneId:scene.sceneId,
        filename:'scene-'+(i+1)+'.png',sha256:sha256(finalBytes),
        sourceSha256:sha256(bytes),sourcePage:candidate.sourcePage,
        imageUrl:candidate.imageUrl,creator:candidate.creator,
        license:candidate.license,licenseUrl:candidate.licenseUrl,
        credit:pick.credit,licenseSnapshot:pick.licenseSnapshot,
        reviewNotes:pick.reviewNotes??'',rightsReviewed:pick.rightsReviewed,
        visualMatchesNarration:pick.visualMatchesNarration,
        humanApproved:pick.humanApproved
      });
      await rm(original);
    }
    const manifest={
      schemaVersion:1,source:'Wikimedia Commons',qualityApproved:false,
      approvalScope:'local-technical-preview-only',
      // A self-attested record, not an independent legal opinion.
      reviewType:'explicit-operator-attestation',
      scenes:staged
    };
    await writeFile(path.join(tmp,'reviewed-assets.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    // No-clobber check before moving the whole staging directory.
    if (await stat(dest).then(()=>true,()=>false)) throw new Error('出力先が同時に作成されました');
    await rename(tmp,dest);
    return manifest;
  } catch(err) {
    await rm(tmp,{recursive:true,force:true});
    throw err;
  }
}
export async function run(argv=process.argv.slice(2)) {
  if (argv.length!==3) throw new Error('使い方: node stage-reviewed.mjs <candidates.json> <review.json> <new-output-dir>');
  const [d,s]=await Promise.all(argv.slice(0,2).map(p=>readFile(p,'utf8').then(JSON.parse)));
  const result=await stageReviewedAssets(d,s,argv[2]);
  console.log('確認済み候補を'+result.scenes.length+'シーン分配置。作品の品質は未承認です。');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  run().catch(e=>{console.error(e.message);process.exitCode=1;});
