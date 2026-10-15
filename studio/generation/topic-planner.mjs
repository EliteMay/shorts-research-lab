import { reviewStoryboard } from '../src/quality-check.mjs';

const text = (v,max=240) => typeof v==='string' && v.trim().length>0 && [...v].length<=max;
const trim = v=>v.trim();
const count = v=>[...v].length;
const same = (a,b)=>a.replace(/\s/g,'')===b.replace(/\s/g,'');

/** A draft only. Time positions are estimates, NOT voice-aligned timestamps. */
export function convertTopicDraft(candidate,{topic,targetSeconds=30,mode}={}) {
  if(!text(topic,120))throw new Error('テーマは1〜120文字で指定してください');
  if(!Number.isInteger(targetSeconds)||targetSeconds<20||targetSeconds>60)
    throw new Error('試作の対象尺は20〜60秒です');
  if(!candidate || Array.isArray(candidate) || typeof candidate!=='object')throw new Error('台本JSONの形式が不正です');
  const kind=mode??candidate.mode;
  if(!['fiction','factual'].includes(kind) || (mode && candidate.mode!==mode))
    throw new Error('ジャンル指定が一致しません。fictionまたはfactualが必要です');
  if(!text(candidate.title,80)||!text(candidate.hookText,65)||!text(candidate.audience,160))
    throw new Error('タイトル・冒頭テロップ・視聴者像が不足しています');
  if(!['hook','progression','payoff'].every(k=>text(candidate.story?.[k],280)))
    throw new Error('導入・展開・結末の構成が不十分です');
  const scenes=candidate.scenes;
  if(!Array.isArray(scenes)||scenes.length<4||scenes.length>8)
    throw new Error('構成は4〜8シーンが必要です');
  const normalized=[];
  let claimCount=0;
  for(const [i,s] of scenes.entries()){
    if(!text(s?.narration,100)||count(s.narration)<8||
       !text(s?.visualDescription,240)||!text(s?.searchQuery,120)||
       !text(s?.imagePrompt,320))
      throw new Error('シーン'+(i+1)+'：ナレーション・映像の目的・素材検索語・画像案が不足');
    const narration=trim(s.narration);
    if(/(?:チャンネル登録|高評価よろしく|最後まで見て|こんにちは[、！!]?)/.test(narration))
      throw new Error('シーン'+(i+1)+'：動画の本題と無関係な挨拶・煽りは禁止');
    if(i>0 && same(normalized[i-1].narration,narration))
      throw new Error('シーン'+(i+1)+'：前のシーンとナレーションが同一');
    const claims=s.factualClaims??[];
    if(!Array.isArray(claims)||claims.length>6)throw new Error('事実主張はシーンごとに6件以内');
    if(kind==='fiction' && claims.length)throw new Error('創作の台本には事実主張を入れないでください');
    const safeClaims=claims.map((c,j)=>{
      if(!text(c?.text,200))throw new Error('シーン'+(i+1)+'の事実主張'+(j+1)+'が不正');
      claimCount++;
      // Do not trust a made-up URL or a model's "verified: true".
      return {text:trim(c.text),sourceUrl:null,verified:false};
    });
    normalized.push({
      narration,visualDescription:trim(s.visualDescription),
      searchQuery:trim(s.searchQuery),imagePrompt:trim(s.imagePrompt),
      factualClaims:safeClaims
    });
  }
  if(kind==='factual' && claimCount===0)
    throw new Error('事実解説には検証対象となるfactualClaimsが必要です');
  const totalChars=normalized.reduce((sum,s)=>sum+count(s.narration),0);
  // The language model is not an audio clock. An estimated band is only
  // diagnostic; real TTS duration replaces all estimated scene times.
  if(totalChars<85||totalChars>250)
    throw new Error('30秒動画の初稿として台詞量が極端です（85〜250文字に修正）');
  const weights=normalized.map(s=>count(s.narration));
  const sum=weights.reduce((a,b)=>a+b,0);
  const duration=targetSeconds*1000;
  let cursor=0;
  const planned=normalized.map((s,i)=>{
    const end=i===normalized.length-1?duration:
      Math.round((weights.slice(0,i+1).reduce((a,b)=>a+b,0)/sum)*duration);
    const start=cursor;cursor=end;
    return {
      id:'scene-'+(i+1),startMs:start,endMs:end,narration:s.narration,
      visual:{description:s.visualDescription,source:'planned',rights:'pending',
              searchQuery:s.searchQuery,imagePrompt:s.imagePrompt},
      factualClaims:s.factualClaims,
      review:{visualMatchesNarration:false}
    };
  });
  const storyboard={
    version:1,topic:trim(topic),audience:trim(candidate.audience),
    targetSeconds,story:Object.fromEntries(['hook','progression','payoff']
      .map(k=>[k,trim(candidate.story[k])])),
    scenes:planned,review:{scriptApproved:false}
  };
  const checks=reviewStoryboard(storyboard,{ready:false});
  if(!checks.ok)throw new Error('既存の品質ゲートで不合格: '+checks.errors.map(e=>e.where+': '+e.message).join(' | '));
  const production={
    topic:trim(topic),title:trim(candidate.title),hook_text:trim(candidate.hookText),
    style:kind==='fiction'?'story':'explanation',language:'ja',category:kind,
    scenes:normalized.map(s=>({narration:s.narration,search_query:s.searchQuery,
       image_prompt:s.imagePrompt})),
    description:text(candidate.description,300)?trim(candidate.description):trim(candidate.title),
    hashtags:['#Shorts'],
    tags:[trim(topic)]
  };
  // UI/media/rights/factual gates remain deliberately unapproved.
  const manifest={
    schemaVersion:1,kind,topic:trim(topic),targetSeconds,
    timingStatus:'estimated-from-text-not-tts',sourceStatus:'requires-independent-verification',
    rightsStatus:'not-reviewed',storyboardApproved:false,readyForRendering:false,
    factualClaimsPending:claimCount,
    expectedOutput:['storyboard.json','production-script.json','generation-report.json'],
    note:'AI text is an unverified first draft, not a completed or approved video.'
  };
  return {storyboard,production,manifest,checks};
}
