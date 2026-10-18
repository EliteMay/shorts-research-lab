"""Synthesize original English chat speech, one audio file per message.

Research/preview-only integration: Edge TTS uses an external network service.
Commercial publication rights and provider terms are not verified by this script.
"""
from __future__ import annotations
import argparse
import asyncio
import json
from pathlib import Path

VOICES = (
    "en-US-JennyNeural",
    "en-US-GuyNeural",
    "en-US-AriaNeural",
    "en-US-EricNeural",
)

def select_voices(messages: list[dict]) -> list[str]:
    speaker_voices: dict[str, str] = {}
    voices = []
    for msg in messages:
        name = msg["speaker"].strip().casefold()
        if name not in speaker_voices:
            if name in ("mom", "mother", "mum"):
                voice = VOICES[0]
            elif name in ("me", "i", "you", "dad", "father"):
                voice = VOICES[1]
            else:
                voice = VOICES[len(speaker_voices) % len(VOICES)]
            speaker_voices[name] = voice
        voices.append(speaker_voices[name])
    return voices

async def generate(input_file: Path, output_dir: Path) -> list[dict]:
    import edge_tts
    data = json.loads(input_file.read_text(encoding="utf-8"))
    messages = data.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 40:
        raise ValueError("Need 1 to 40 valid chat messages")
    output_dir.mkdir(parents=True, exist_ok=True)
    voices = select_voices(messages)
    results = []
    for index, (message, voice) in enumerate(zip(messages, voices)):
        sentence = message.get("text")
        if not isinstance(sentence, str) or not sentence.strip() or len(sentence) > 280:
            raise ValueError(f"Invalid speech text at message {index + 1}")
        filename = f"clip-{index:03}.mp3"
        target = output_dir / filename
        audio = bytearray()
        communicator = edge_tts.Communicate(sentence, voice=voice)
        async for part in communicator.stream():
            if part["type"] == "audio":
                audio.extend(part["data"])
        if not audio:
            raise ValueError(f"Empty synthesized speech for message {index + 1}")
        target.write_bytes(audio)
        results.append({"index": index, "voice": voice, "file": filename, "bytes": len(audio)})
    return results

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    results = asyncio.run(generate(args.input, args.output))
    print(json.dumps({"clips": results}, ensure_ascii=False))

if __name__ == "__main__":
    main()
