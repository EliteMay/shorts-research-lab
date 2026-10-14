"""Convert tested voice timing + user-supplied scene images into a technical MP4 preview.

Images are NOT automatically fetched or licensed by this tool.
"""
import argparse
import json
import subprocess
from pathlib import Path

def run(cmd, cwd=None):
    subprocess.run(cmd, check=True, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def timestamp(ms):
    cs = round(ms / 10)
    hh,cs = divmod(cs,360000)
    mm,cs = divmod(cs,6000)
    ss,cs = divmod(cs,100)
    return f'{hh}:{mm:02d}:{ss:02d}.{cs:02d}'

def safe_ass(text):
    return text.replace('\\','').replace('{','').replace('}','').replace('\n',r'\N')

def make_ass(cues,path):
    header='''[Script Info]
Title: Studio technical preview
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
ScaledBorderAndShadow: yes
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Subtitle,Noto Sans CJK JP,53,&H00FFFFFF,&H00FFFFFF,&H00121A25,&H770A101A,-1,0,0,0,100,100,0,0,1,5,2,2,56,56,200,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    lines=[f"Dialogue: 0,{timestamp(c['startMs'])},{timestamp(c['endMs'])},Subtitle,,0,0,0,,{safe_ass(c['text'])}" for c in cues]
    path.write_text(header+'\n'.join(lines)+'\n',encoding='utf8')

def validate(script, timing):
    scenes=script.get('scenes',[])
    spans=timing.get('scenes',[])
    cues=timing.get('cues',[])
    if not scenes or not spans or len(scenes)!=len(spans) or not cues:
        raise ValueError('Missing scenes or cues')
    if ''.join(x['text'] for x in cues)!=''.join(s['narration'] for s in scenes):
        raise ValueError('Audio-aligned text does not match storyboard narration')
    starts=[s['startMs'] for s in spans]
    total=timing['durationMs']
    if starts[0]!=0 or starts!=sorted(starts) or total<1000:
        raise ValueError('Invalid speech timeline')
    for c in cues:
        if c['startMs']<0 or c['endMs']<=c['startMs'] or c['endMs']>total+100:
            raise ValueError('Invalid subtitle times')
    return len(scenes),starts,total

def render(script,timing,images,audio,out):
    n,starts,total=validate(script,timing)
    if not audio.is_file():raise FileNotFoundError(audio)
    images=images.resolve()
    art=[images/f'scene-{i+1}.png' for i in range(n)]
    for p in art:
        if not p.is_file() or not p.stat().st_size:
            raise FileNotFoundError('Missing selected local art: '+str(p))
    out=out.resolve()
    out.mkdir(parents=True,exist_ok=True)
    make_ass(timing['cues'],out/'captions.ass')
    parts=[]
    for i,p in enumerate(art):
        ms=(starts[i+1] if i+1<n else total)-starts[i]
        if ms<100:raise ValueError('Scene duration too short')
        clip=out/f'part-{i+1}.mp4'
        filters="scale=760:1352,crop=720:1280:x='20+9*sin(t/4)':y='36+8*cos(t/4)',setsar=1,format=yuv420p"
        run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-loop','1',
             '-framerate','24','-t',f'{ms/1000:.3f}','-i',str(p),'-vf',filters,
             '-r','24','-an','-c:v','libx264','-preset','veryfast','-crf','21',str(clip)])
        parts.append(clip)
    (out/'parts.ffconcat').write_text('ffconcat version 1.0\n'+''.join("file '"+p.name+"'\n" for p in parts),encoding='utf8')
    run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-safe','0',
         '-f','concat','-i','parts.ffconcat','-i',str(audio.resolve()),
         '-filter_complex','[0:v]subtitles=captions.ass[v]','-map','[v]','-map','1:a:0',
         '-t',f'{total/1000:.3f}','-c:v','libx264','-preset','veryfast','-crf','20',
         '-c:a','aac','-b:a','160k','-movflags','+faststart','preview.mp4'],cwd=out)
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out/'preview.mp4')]))
    duration=float(info['format']['duration'])
    if abs(duration-total/1000)>0.3 or not {'video','audio'}.issubset({s['codec_type'] for s in info['streams']}):
        raise ValueError('Rendered media failed duration/stream checks')
    report={'seconds':duration,'scenes':n,'captions':len(timing['cues']),'qualityApproved':False,
            'warning':'Technical MP4 only. Licensing, visuals, audio playback and subtitle readability need a human review.'}
    (out/'render-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for x in ('script','timing','images','audio','out'):
        ap.add_argument('--'+x,required=True,type=Path)
    a=ap.parse_args()
    render(json.loads(a.script.read_text(encoding='utf8')),json.loads(a.timing.read_text(encoding='utf8')),a.images,a.audio,a.out)
