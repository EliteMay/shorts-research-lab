import importlib.util
import unittest
from pathlib import Path

VOICE_FILE = Path(__file__).resolve().parent.parent / "editor" / "voice_sync.py"
spec = importlib.util.spec_from_file_location("shorts_editor_voice_sync", VOICE_FILE)
voice_sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice_sync)

class VoiceSelectionTests(unittest.TestCase):
    def test_known_speakers_have_stable_distinct_voices(self):
        messages = [
            {"speaker": "Mom"},
            {"speaker": "Me"},
            {"speaker": "mom"},
            {"speaker": "Friend"},
            {"speaker": "ME"},
        ]
        voices = voice_sync.select_voices(messages)
        self.assertEqual(voices[0], "en-US-JennyNeural")
        self.assertEqual(voices[1], "en-US-GuyNeural")
        self.assertEqual(voices[0], voices[2])
        self.assertEqual(voices[1], voices[4])
        self.assertNotEqual(voices[3], voices[1])

    def test_returns_no_voices_for_empty_messages(self):
        self.assertEqual(voice_sync.select_voices([]), [])

if __name__ == "__main__":
    unittest.main()
