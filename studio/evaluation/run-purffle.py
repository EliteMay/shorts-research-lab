"""Reproducible render smoke test. Does NOT test AI planning or creative quality."""
import json
import subprocess
import time
from pathlib import Path

from purffle_shorts.config import Settings
from purffle_shorts.pipeline import Studio

root = Path(__file__).resolve().parents[2]
out = root / "engine-smoke-output"
out.mkdir(exist_ok=True)
settings = Settings.from_env().with_overrides(
    offline=True,
    upload=False,
    language="ja",
    target_seconds=30,
    resolution=(360, 640),
    fps=24,
    tts_engine="edge",
    music_volume=0.0,
    output_dir=str(out / "videos"),
    data_dir=str(out / "state"),
)
start = time.monotonic()
result = Studio(settings).make(script_file=root / "studio/evaluation/sample-ja-story.json", upload=False)
duration = round(time.monotonic() - start, 2)
if not result.ok or not result.video:
    raise RuntimeError("PurffleShorts render failed: " + result.error)
video = Path(result.video)
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
    capture_output=True, check=True, text=True,
)
info = json.loads(probe.stdout)
streams = info.get("streams", [])
video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
if video_stream is None or audio_stream is None:
    raise RuntimeError("Missing video or audio stream")
if (video_stream["width"], video_stream["height"]) != (360, 640):
    raise RuntimeError("Unexpected render dimensions")
report = {
    "status": "rendered_not_quality_approved",
    "purpose": "Check that the third-party renderer can produce a local Japanese storyboard-based MP4.",
    "source_repo": "Chamanrajragu/purffle-shorts",
    "source_sha": "bab8d5f97b8452d72287b0ee3af3cb8cc1a23bc8",
    "topic": "鍵をなくしたロボット（創作、固定台本）",
    "note": "AI script generation, real visual matching, content retention and viewing quality were NOT evaluated.",
    "tts_requested": "edge",
    "tts_actual": "Not validated; review runner logs and listen to output. Offline fallback may produce silent/system voice.",
    "visuals": "Offline generated placeholders; not story-matched imagery.",
    "additional_paid_apis_used": False,
    "render_seconds": duration,
    "actual_video_duration": info.get("format", {}).get("duration"),
    "video_codec": video_stream.get("codec_name"),
    "video_width": video_stream.get("width"),
    "video_height": video_stream.get("height"),
    "audio_codec": audio_stream.get("codec_name"),
    "video_path": str(video.relative_to(root)),
}
(out / "technical-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
