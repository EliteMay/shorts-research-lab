import { parseDiscovery, validateSelection, buildApprovedReview } from './review-model.mjs';
const $=id=>document.getElementById(id);
let discovery=null, state=[], current=0;
function el(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;}
function completed(s,i){return validateSelection({scenes:[{...s,sceneIndex:0}]},[state[i]]).length===0;}
function refresh(){
  if(!discovery)return;
  const done=discovery.scenes.filter(completed).length;
  $('progress').textContent=done+' / '+discovery.scenes.length+' シーン確認済み';
  $('pendingCount').textContent=done===discovery.scenes.length?'全シーン確認済み':'残り'+(discovery.scenes.length-done)+'シーン';
  $('exportBtn').disabled=validateSelection(discovery,state).length!==0;
}
function navigation(){
  const nav=$('sceneNav');nav.replaceChildren();
  discovery.scenes.forEach((s,i)=>{
    const b=el('button','scene-item'+(i===current?' active':''));
    b.type='button';b.setAttribute('aria-current',i===current?'step':'false');
    b.append(el('span','', 'シーン '+(i+1)),el('span','tiny',completed(s,i)?'確認済み':'未確認'));
    b.addEventListener('click',()=>{current=i;renderAll();});nav.append(b);
  });
}
function setValue(key,value){state[current]={...state[current],[key]:value};refresh();navigation();}
function textField(name,label,type='input',placeholder=''){
  const wrap=el('label','field',label),field=el(type);
  if(type==='input')field.type='text';
  field.value=state[current]?.[name]??'';
  field.maxLength=type==='textarea'?1000:500;
  field.placeholder=placeholder;
  field.addEventListener('input',()=>setValue(name,field.value));
  wrap.append(field);return wrap;
}
function checkbox(name,label){
  const wrap=el('label','check'),input=el('input');
  input.type='checkbox';input.checked=Boolean(state[current]?.[name]);
  input.addEventListener('change',()=>setValue(name,input.checked));
  wrap.append(input,el('span','',label));return wrap;
}
function scene(){
  const s=discovery.scenes[current],area=$('sceneDetail');area.replaceChildren();
  const head=el('div','detail-heading');
  head.append(el('h2','','シーン '+(current+1)+' の画像候補'),el('span','subheading',s.candidates.length+'件'));
  area.append(head,el('div','eyebrow','NARRATION'),el('p','narration',s.narration||'台詞がありません'));
  const grid=el('div','candidate-grid');
  if(!s.candidates.length)grid.append(el('div','empty','画像候補がありません。再検索するかオリジナル画像を制作してください。'));
  s.candidates.forEach((c,i)=>{
    const chosen=state[current]?.index===i,card=el('article','candidate'+(chosen?' chosen':''));
    const image=el('img');image.src=c.imageUrl;image.alt=c.title||'候補';image.loading='lazy';image.referrerPolicy='no-referrer';
    const info=el('div','meta');
    info.append(el('h3','',c.title),el('small','','作者：'+(c.creator||'未記載')),
                el('small','','ライセンス表記：'+(c.license||'未記載')));
    if(c.rightsStatus!=='needs-human-license-review')info.append(el('small','unsafe','この条件は確認対象外です'));
    const link=el('a','','出典ページを開いて確認');link.href=c.sourcePage;link.target='_blank';link.rel='noopener noreferrer';info.append(link);
    const button=el('button','choice',chosen?'選択中':'この候補を選ぶ');
    button.type='button';button.disabled=c.rightsStatus!=='needs-human-license-review';
    button.addEventListener('click',()=>{
      state[current]={index:i,rightsReviewed:false,visualMatchesNarration:false,humanApproved:false,
        credit:c.creator||'',licenseSnapshot:'',reviewNotes:''};
      renderAll();
    });
    info.append(button);card.append(image,info);grid.append(card);
  });
  area.append(grid);
  if(state[current]?.index===undefined)return;
  const box=el('section','review-form');
  box.append(el('h3','','選んだ画像の最終確認'),el('p','','実際に出典ページと画像を見てください。チェックは自動で入りません。'));
  box.append(checkbox('rightsReviewed','ライセンス全文・改変・表示条件・被写体の権利を確認した'));
  box.append(checkbox('visualMatchesNarration','画像の内容がこのナレーションと一致している'));
  box.append(checkbox('humanApproved','自分で確認したうえでこの素材を採用する'));
  box.append(textField('credit','動画に記載する作者・クレジット'));
  box.append(textField('licenseSnapshot','実際に確認した利用条件と確認日','textarea','CC BY 4.0、確認日、表示義務など'));
  box.append(textField('reviewNotes','採用理由・注意点（任意）','textarea'));
  area.append(box);
}
function renderAll(){navigation();scene();refresh();}
$('sourceFile').addEventListener('change',async ev=>{
  try{
    const file=ev.target.files?.[0];if(!file)return;
    if(file.size>2*1024*1024)throw new Error('JSONファイルは2MB以下にしてください');
    discovery=parseDiscovery(JSON.parse(await file.text()));state=discovery.scenes.map(()=>({}));current=0;
    $('workspace').hidden=false;$('bottomActions').hidden=false;
    $('message').classList.remove('error');$('message').textContent='候補を読み込みました。画像は全件未承認です。';
    renderAll();
  }catch(e){
    $('message').textContent=e.message;$('message').classList.add('error');
    $('workspace').hidden=true;$('bottomActions').hidden=true;
  }
});
$('exportBtn').addEventListener('click',()=>{
  try{
    const review=buildApprovedReview(discovery,state);
    const blob=new Blob([JSON.stringify(review,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='review.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    $('message').textContent='review.jsonを保存しました。これは人の確認記録であり、権利を自動証明するものではありません。';
    $('message').classList.remove('error');
  }catch(e){$('message').textContent=e.message;$('message').classList.add('error');}
});
