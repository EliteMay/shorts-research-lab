/** Japanese text + segment-boundary guard, not a speech-to-text or timing aligner. */
export function validateJapaneseCaptions({scenes, cues}, {maxLineLength = 18, targetMs} = {}) {
  const errors = [];
  if (!Array.isArray(scenes) || !scenes.length || !Array.isArray(cues) || !cues.length) {
    return {ok:false, errors:['シーンと字幕キューが必要です']};
  }
  if (!scenes.every(s => typeof s?.narration === 'string')) {
    return {ok:false, errors:['全シーンのナレーションが必要です']};
  }
  const original = scenes.map(s => s.narration).join('');
  const captions = cues.map(c => c?.text ?? '').join('').replace(/\n/g, '');
  const segmenter = new Intl.Segmenter('ja', {granularity:'word'});
  const legalBoundaries = new Set([...segmenter.segment(original)].map(x=>x.index));
  legalBoundaries.add(original.length);
  let cursor=0, lastEnd=0;
  for (const [i,c] of cues.entries()) {
    const label = '字幕' + (i+1);
    if (!c || typeof c.text !== 'string' || !c.text.length) {errors.push(label+': 空字幕です');continue;}
    if (!Number.isInteger(c.startMs) || !Number.isInteger(c.endMs) || c.startMs < 0 || c.startMs < lastEnd || c.endMs <= c.startMs) {
      errors.push(label+': 表示時間が不正または重複しています');
    }
    if (Number.isInteger(c.endMs)) lastEnd=c.endMs;
    if (c.text.includes(' ') && !original.includes(' ')) errors.push(label+': 原文にない半角スペースがあります');
    const lines=c.text.split('\n');
    if(lines.length>2) errors.push(label+': 2行以内にしてください');
    for(const line of lines) {
      if ([...line].length>maxLineLength) errors.push(label+': 一行の文字数が多すぎます');
      cursor += line.length;
      if (!legalBoundaries.has(cursor)) errors.push(label+': 語の途中で改行・分割されています');
    }
  }
  if (captions !== original) errors.push('字幕全文と台本全文が一致しません');
  if (Number.isInteger(targetMs) && lastEnd > targetMs + 100) errors.push('字幕が動画尺からはみ出ています');
  return {ok: errors.length===0, errors};
}
