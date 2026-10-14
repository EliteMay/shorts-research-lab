// Review export is an operator attestation, never an automated rights clearance.
const commonsPage = raw => {
  try { const u=new URL(raw); return u.protocol==='https:' && u.hostname==='commons.wikimedia.org' && u.pathname.startsWith('/wiki/File:') && !u.username && !u.password; }
  catch { return false; }
};
const commonsAsset = raw => {
  try { const u=new URL(raw); return u.protocol==='https:' && u.hostname==='upload.wikimedia.org' && u.pathname.startsWith('/wikipedia/commons/') && /\.(?:png|jpe?g|webp)$/i.test(u.pathname) && !u.username && !u.password; }
  catch { return false; }
};
export function parseDiscovery(raw) {
  if (!raw || raw.provider!=='Wikimedia Commons' || !Array.isArray(raw.scenes) || raw.scenes.length<1 || raw.scenes.length>20)
    throw new Error('Commons候補JSONの形式が不正です（1〜20シーン）');
  const seen=new Set();
  return {provider:'Wikimedia Commons',scenes:raw.scenes.map((scene,i)=>{
    if(scene?.sceneIndex!==i || !Array.isArray(scene.candidates) || scene.candidates.length>8)
      throw new Error('シーン'+(i+1)+'の候補データが不正です');
    const id=String(scene.sceneId??'scene-'+(i+1));
    if(seen.has(id))throw new Error('シーンIDが重複しています');
    seen.add(id);
    return {sceneIndex:i,sceneId:id,narration:String(scene.narration??'').slice(0,1000),
      candidates:scene.candidates.filter(c=>commonsPage(c.sourcePage)&&commonsAsset(c.imageUrl)).map(c=>({
        title:String(c.title??'').slice(0,180),imageUrl:c.imageUrl,sourcePage:c.sourcePage,
        creator:String(c.creator??'').slice(0,250),license:String(c.license??'').slice(0,120),
        licenseUrl:String(c.licenseUrl??'').slice(0,500),rightsStatus:String(c.rightsStatus??''),
        description:String(c.description??'').slice(0,400)
      }))};
  })};
}
export function validateSelection(discovery,state) {
  if(!discovery || !Array.isArray(discovery.scenes) || !Array.isArray(state))
    return ['画像候補と採用記録が不足しています'];
  const problems=[];
  for(const scene of discovery.scenes){
    const item=state[scene.sceneIndex];
    const candidate=scene.candidates[item?.index];
    if(!candidate || candidate.rightsStatus!=='needs-human-license-review'){
      problems.push('シーン'+(scene.sceneIndex+1)+'：対象の画像を選んでください');continue;
    }
    if(!item.rightsReviewed || !item.visualMatchesNarration || !item.humanApproved)
      problems.push('シーン'+(scene.sceneIndex+1)+'：権利・内容一致・人の承認が未完了');
    if(!item.credit?.trim())problems.push('シーン'+(scene.sceneIndex+1)+'：著作者クレジットが不足');
    if(!item.licenseSnapshot?.trim())problems.push('シーン'+(scene.sceneIndex+1)+'：利用条件の確認記録が不足');
  }
  return problems;
}
export function buildApprovedReview(discovery,state){
  const errors=validateSelection(discovery,state);
  if(errors.length)throw new Error(errors.join('\n'));
  return discovery.scenes.map(scene=>{
    const item=state[scene.sceneIndex],candidate=scene.candidates[item.index];
    return {sceneIndex:scene.sceneIndex,sourcePage:candidate.sourcePage,imageUrl:candidate.imageUrl,
      rightsReviewed:true,visualMatchesNarration:true,humanApproved:true,credit:item.credit.trim(),
      licenseSnapshot:item.licenseSnapshot.trim(),reviewNotes:String(item.reviewNotes??'').slice(0,1000)};
  });
}
