/** Commons images are suggestions, never approved video assets. No dependencies. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const API = 'https://commons.wikimedia.org/w/api.php';
const allowedLicenses = /^(?:CC0(?:-|$)|CC-BY(?:-SA)?(?:-\d+(?:\.\d+)?)?$|PUBLIC-DOMAIN\b|PD-)/;
const escapedEntities = {amp:'&',quot:'"',apos:"'",nbsp:' ',lt:'<',gt:'>'};
function plainMetadata(raw) {
  return String(raw ?? '').replace(/<[^>]*>/g,' ')
    .replace(/&([a-z]+);/gi,(whole,key)=>escapedEntities[key.toLowerCase()] ?? whole)
    .replace(/\s+/g,' ').trim().slice(0,320);
}
function permittedHost(value,hostname,pathPrefix) {
  try {const u=new URL(value);return u.protocol==='https:'&&u.hostname===hostname&&u.pathname.startsWith(pathPrefix);}catch{return false;}
}
function metadata(item,key){return plainMetadata(item?.extmetadata?.[key]?.value);}
export function decodeCommonsCandidates(response) {
  const pages=Object.values(response?.query?.pages ?? {});
  return pages.flatMap(page=>{
    const img=page?.imageinfo?.[0];
    if(!img||!permittedHost(img.descriptionurl,'commons.wikimedia.org','/wiki/File:')||
       !permittedHost(img.url,'upload.wikimedia.org','/wikipedia/commons/')) return [];
    if(!/^File:[^\n]+\.(?:png|jpe?g|webp)$/i.test(page.title??'')) return [];
    const license=metadata(img,'LicenseShortName');
    const maybeReusable=allowedLicenses.test(license.toUpperCase().replace(/[\s_]+/g,'-'));
    return [{title:page.title,sourcePage:img.descriptionurl,imageUrl:img.url,
      creator:metadata(img,'Artist'),description:metadata(img,'ImageDescription'),
      license,licenseUrl:metadata(img,'LicenseUrl'),width:img.width,height:img.height,
      rightsStatus:maybeReusable?'needs-human-license-review':'not-eligible-by-license-allowlist',
      semanticStatus:'not-reviewed',approved:false}];
  });
}
export async function searchCommons(query,{limit=4,fetchImpl=fetch}={}) {
  if(typeof query!=='string'||!query.trim()||query.length>130)throw Error('検索文は1〜130文字');
  if(!Number.isInteger(limit)||limit<1||limit>8)throw Error('件数は1〜8件');
  const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',
    gsrsearch:query,gsrnamespace:'6',gsrlimit:String(limit),prop:'imageinfo',
    iiprop:'url|size|extmetadata',
    iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|ImageDescription'});
  const response=await fetchImpl(API+'?'+params,{headers:{Accept:'application/json','User-Agent':'ShortsResearchLab/0.1 (https://github.com/EliteMay/shorts-research-lab)'},signal:AbortSignal.timeout(13000)});
  if(!response?.ok)throw Error('Commons API HTTP '+(response?.status??'unknown'));
  return decodeCommonsCandidates(await response.json());
}
export async function discoverSceneCandidates(storyboard,{fetchImpl=fetch,limit=4}={}) {
  if(!storyboard||!Array.isArray(storyboard.scenes)||storyboard.scenes.length<1||storyboard.scenes.length>20)
    throw Error('台本には1〜20個のシーンが必要です');
  const results=[];
  for(const [index,scene] of storyboard.scenes.entries()){
    const query=scene.search_query??scene.visual?.searchQuery;
    if(typeof query!=='string'||!query.trim())throw Error('シーン'+(index+1)+'の検索語が未設定');
    const candidates=await searchCommons(query,{fetchImpl,limit});
    results.push({sceneIndex:index,sceneId:scene.id??'scene-'+(index+1),
      narration:scene.narration,searchQuery:query,candidates});
  }
  return {provider:'Wikimedia Commons',createdAt:new Date().toISOString(),status:'review-required',
    rightsApproved:false,semanticMatchApproved:false,scenes:results};
}
/** A candidate URL cannot be swapped after the review. Explicit human review is required. */
export function validateApprovedPicks(discovery,selections) {
  const errors=[];
  if(!discovery||!Array.isArray(discovery.scenes)||!Array.isArray(selections))
    return {ok:false,errors:['素材候補・採用情報が不正です']};
  if(selections.length!==discovery.scenes.length)errors.push('すべてのシーンの採用画像が必要です');
  for(const [index,scene] of discovery.scenes.entries()){
    const matches=selections.filter(x=>x.sceneIndex===index);
    if(matches.length!==1){errors.push('シーン'+(index+1)+'：採用画像が一意に決まっていません');continue;}
    const pick=matches[0];
    const candidate=scene.candidates?.find(c=>c.sourcePage===pick.sourcePage&&c.imageUrl===pick.imageUrl);
    if(!candidate){errors.push('シーン'+(index+1)+'：候補と採用画像が一致しません');continue;}
    if(candidate.rightsStatus!=='needs-human-license-review'||!candidate.license)
      errors.push('シーン'+(index+1)+'：利用条件不明');
    if(pick.rightsReviewed!==true||pick.visualMatchesNarration!==true||pick.humanApproved!==true)
      errors.push('シーン'+(index+1)+'：利用権利・映像内容・人の確認が未完了');
    if(typeof pick.credit!=='string'||!pick.credit.trim())
      errors.push('シーン'+(index+1)+'：著作者のクレジットが必要です');
    if(typeof pick.licenseSnapshot!=='string'||!pick.licenseSnapshot.trim())
      errors.push('シーン'+(index+1)+'：ライセンス確認記録が必要です');
  }
  return {ok:errors.length===0,errors};
}
export async function run(argv=process.argv.slice(2)) {
  if(argv.length!==2)throw Error('使用方法: node studio/assets/commons-assets.mjs <storyboard.json> <candidates.json>');
  const input=JSON.parse(await readFile(argv[0],'utf8'));
  const result=await discoverSceneCandidates(input);
  await writeFile(argv[1],JSON.stringify(result,null,2)+'\n','utf8');
  console.log('候補取得 '+result.scenes.length+'シーン。全画像は未承認です');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  run().catch(err=>{console.error(err.message);process.exitCode=1;});
