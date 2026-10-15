import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateWithLocalAI } from './local-ai.mjs';

export function parseArgs(argv) {
  const opts={};
  const aliases={'--topic':'topic','--out':'out','--mode':'mode','--model':'model',
    '--port':'port','--seconds':'targetSeconds'};
  for(let i=0;i<argv.length;i++){
    const key=aliases[argv[i]];
    if(!key||i===argv.length-1||argv[i+1].startsWith('--')||opts[key]!==undefined)
      throw new Error('無効な引数: '+argv[i]+'。使用方法は --topic "題材" --out "新規出力フォルダ" [--mode fiction|factual] [--model 名前] [--port 1234]');
    opts[key]=argv[++i];
  }
  if(!opts.topic||!opts.out)throw new Error('--topic と --out は必須です');
  if(opts.port!==undefined){
    if(!/^[0-9]+$/.test(opts.port))throw new Error('ポート番号が不正');
    opts.port=Number(opts.port);
  }
  if(opts.targetSeconds!==undefined){
    if(!/^[0-9]+$/.test(opts.targetSeconds))throw new Error('秒数が不正');
    opts.targetSeconds=Number(opts.targetSeconds);
  }
  return opts;
}
export async function saveDraft(result,outputDir){
  if(!result?.storyboard || !result?.production || !result?.manifest)
    throw new Error('保存する前に台本が必要です');
  const target=path.resolve(outputDir);
  await mkdir(path.dirname(target),{recursive:true});
  // Exclusive create: never overwrite prior research or drafts.
  await mkdir(target);
  try{
    const report={...result.manifest,provider:result.provider,
      modelId:result.modelId,attempt:result.attempt,
      existingQualityGate:{ok:result.checks.ok,errors:result.checks.errors,
        warnings:result.checks.warnings}};
    await writeFile(path.join(target,'storyboard.json'),
      JSON.stringify(result.storyboard,null,2)+'\n',{flag:'wx'});
    await writeFile(path.join(target,'production-script.json'),
      JSON.stringify(result.production,null,2)+'\n',{flag:'wx'});
    await writeFile(path.join(target,'generation-report.json'),
      JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    return {folder:target,report};
  }catch(e){
    // We created this directory exclusively; never remove preexisting output.
    await rm(target,{recursive:true,force:true});
    throw e;
  }
}
export async function run(argv=process.argv.slice(2),{generator=generateWithLocalAI}={}) {
  const opts=parseArgs(argv);
  const result=await generator(opts);
  const saved=await saveDraft(result,opts.out);
  return {path:saved.folder,report:saved.report};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  run().then(({path:folder,report})=>{
    console.log(JSON.stringify({draftFolder:folder,mode:report.kind,
      scenes:report.scenesCount,qualityApproved:false,
      message:'下書きとして保存しました。音声の尺・根拠・素材と権利・映像品質は未確認です。'},null,2));
  }).catch(e=>{console.error('生成できませんでした: '+e.message);process.exitCode=1;});
}
