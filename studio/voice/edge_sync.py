"""Japanese voice + timing generated together. External free Edge TTS service required.

Fails closed when returned word boundaries do not match the written script.
"""
from __future__ import annotations
import argparse
import asyncio
import json
import subprocess
import tempfile
import unicodedata
import wave
from pathlib import Path

SKIP = set('、。，．！？!?「」『』（）()【】…・：:〜~　 \n\r\t')
TICK_MS = 10_000


def clean(text: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKC', text)
                   if c not in SKIP and not c.isspace())


def word_cues(narration: str, events: list, max_chars: int = 16) -> list:
    """Timed captions from authoritative TTS metadata, never estimated per character."""
    if not (7 <= max_chars <= 30) or not clean(narration) or not events:
        raise ValueError('Invalid narration, cue width, or missing word events')
    source = ''
    ends = []
    for i, letter in enumerate(narration):
        for normalized in clean(letter):
            source += normalized
            ends.append(i + 1)
    spoken = ''.join(clean(e.get('text', '')) for e in events)
    if source != spoken:
        raise ValueError('TTS words differ from the original Japanese script')
    offset = 0
    spans = []
    prev = -1
    for e in events:
        word = clean(e.get('text', ''))
        start, duration = e.get('offset'), e.get('duration')
        if not word or not isinstance(start, int) or not isinstance(duration, int) or start < 0 or duration <= 0 or start < prev:
            raise ValueError('Invalid TTS word timestamp')
        offset += len(word)
        end = ends[offset-1]
        while end < len(narration) and not clean(narration[end]):
            end += 1
        spans.append((end, start // TICK_MS, (start + duration) // TICK_MS))
        prev = start
    if spans[-1][0] != len(narration):
        raise ValueError('Missing final spoken text')
    # Choose caption groups globally instead of greedily; short dangling Japanese
    # fragments like "た。" are unacceptable even if each word boundary is valid.
    n = len(spans)
    dp = [float('inf')] * (n + 1)
    prev = [-1] * (n + 1)
    dp[0] = 0
    for j in range(1, n + 1):
        for i in range(j - 1, -1, -1):
            char_start = spans[i - 1][0] if i else 0
            fragment = narration[char_start:spans[j - 1][0]]
            width = len(fragment)
            if width > max_chars:
                break
            milliseconds = spans[j - 1][2] - spans[i][1]
            if milliseconds <= 0 or dp[i] == float('inf'):
                continue
            crosses_sentence = any(p in fragment[:-1] for p in '。！？!?')
            cost = 12 + ((width - 11) ** 2) / 3
            if width < 5:
                cost += 40 * (5 - width)
            if width > 15:
                cost += (width - 15) ** 2 * 2
            if milliseconds < 700:
                cost += 30
            if milliseconds > 3400:
                cost += (milliseconds - 3400) / 75
            if crosses_sentence:
                cost += 60
            if fragment.endswith(('。', '！', '？', '!', '?')):
                cost -= 6
            if fragment.endswith('、'):
                cost -= 3
            if j < n:
                # A TTS word boundary is not always a natural subtitle boundary.
                # Keep verb endings and auxiliaries together when possible.
                remainder = narration[spans[j - 1][0]:]
                if fragment.endswith('っ') and remainder.startswith(('て', 'た')):
                    cost += 600
                if fragment.endswith('さ') and remainder.startswith('そう'):
                    cost += 600
                if (fragment and '\u3040' <= fragment[-1] <= '\u309f'
                        and fragment[-1] not in 'はにをがもでへのとや'
                        and remainder.startswith(('ます', 'ました', 'せん', 'です', 'ない', 'した', 'そう', 'かった'))):
                    cost += 350
                if fragment.endswith(('は', 'に', 'を', 'が', 'も', 'で', 'と', 'へ', '、')):
                    cost -= 16
            if dp[i] + cost < dp[j]:
                dp[j], prev[j] = dp[i] + cost, i
    if prev[-1] == -1:
        raise ValueError('Cannot group captions within maximum width without breaking TTS words')
    cues = []
    j = n
    while j:
        i = prev[j]
        char_start = spans[i - 1][0] if i else 0
        cues.append({'startMs': spans[i][1], 'endMs': spans[j - 1][2],
                     'text': narration[char_start:spans[j - 1][0]]})
        j = i
    cues.reverse()
    if ''.join(c['text'] for c in cues) != narration:
        raise ValueError('Caption text integrity failure')
    return cues


async def synthesize_scene(text: str, mp3: Path, voice: str, rate: str):
    import edge_tts
    chunks = []
    client = edge_tts.Communicate(text, voice=voice, rate=rate, boundary='WordBoundary')
    with mp3.open('wb') as audio:
        async for item in client.stream():
            if item['type'] == 'audio':
                audio.write(item['data'])
            elif item['type'] == 'WordBoundary':
                chunks.append({k:item[k] for k in ('text','offset','duration')})
    if not mp3.stat().st_size or not chunks:
        raise ValueError('Missing audio or word-boundary data')
    return chunks


async def render(script: dict, output: Path, voice='ja-JP-KeitaNeural', rate='+8%'):
    scenes = script.get('scenes')
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 20:
        raise ValueError('Expected 1-20 scenes')
    output.mkdir(parents=True, exist_ok=True)
    cues, intervals, frames_done = [], [], 0
    sample_rate = 24000
    with tempfile.TemporaryDirectory(prefix='shorts-voice-') as tmp:
        with wave.open(str(output/'voice.wav'), 'wb') as joined:
            joined.setnchannels(1)
            joined.setsampwidth(2)
            joined.setframerate(sample_rate)
            for i, scene in enumerate(scenes):
                narration = scene.get('narration', '')
                mp3 = Path(tmp)/f'{i:02d}.mp3'
                wav = Path(tmp)/f'{i:02d}.wav'
                boundaries = await synthesize_scene(narration, mp3, voice, rate)
                local_cues = word_cues(narration, boundaries)
                subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(mp3),
                                '-ac','1','-ar',str(sample_rate),'-c:a','pcm_s16le',str(wav)], check=True)
                with wave.open(str(wav), 'rb') as part:
                    if (part.getnchannels(),part.getsampwidth(),part.getframerate()) != (1,2,sample_rate):
                        raise ValueError('Unexpected decoded audio format')
                    start = round(frames_done*1000/sample_rate)
                    audio_ms = round(part.getnframes()*1000/sample_rate)
                    if local_cues[-1]['endMs'] > audio_ms + 200:
                        raise ValueError('TTS caption timing is beyond the audio track')
                    cues.extend({**c,'startMs':c['startMs']+start,'endMs':c['endMs']+start} for c in local_cues)
                    joined.writeframes(part.readframes(part.getnframes()))
                    frames_done += part.getnframes()
                    intervals.append({'index':i,'startMs':start,'endMs':round(frames_done*1000/sample_rate)})
                if i+1 < len(scenes):
                    pad = round(sample_rate*0.08)
                    joined.writeframes(b'\x00'*(pad*2))
                    frames_done += pad
    result = {'voice':voice,'rate':rate,'timingSource':'edge-tts:WordBoundary',
              'durationMs':round(frames_done*1000/sample_rate),'scenes':intervals,'cues':cues,
              'qualityApproved':False,
              'limitations':['Audio playback and timing review still required.',
                             'No factual, semantic, or visual quality verified.']}
    (output/'timing.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
    return result


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--script',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--voice',default='ja-JP-KeitaNeural')
    ap.add_argument('--rate',default='+8%')
    args=ap.parse_args()
    data=json.loads(args.script.read_text(encoding='utf-8'))
    r=asyncio.run(render(data,args.out,args.voice,args.rate))
    print(json.dumps({'durationMs':r['durationMs'],'cues':len(r['cues']),
                      'scenes':len(r['scenes']),'qualityApproved':False},ensure_ascii=False))
if __name__=='__main__':main()
