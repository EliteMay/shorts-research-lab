import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from render_local_preview import validate, timestamp, safe_ass

class PreviewTest(unittest.TestCase):
    def test_timestamp(self):
        self.assertEqual(timestamp(6248), '0:00:06.25')
    def test_script_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, 'does not match'):
            validate({'scenes':[{'narration':'猫の話'}]},
                     {'durationMs':1500,'scenes':[{'startMs':0,'endMs':1500}],
                      'cues':[{'startMs':0,'endMs':1500,'text':'犬の話'}]})
    def test_matching_script_valid(self):
        out=validate({'scenes':[{'narration':'猫の話'}]},
                     {'durationMs':1500,'scenes':[{'startMs':0,'endMs':1500}],
                      'cues':[{'startMs':0,'endMs':1500,'text':'猫の話'}]})
        self.assertEqual(out[0],1)
    def test_ass_injection_escaped(self):
        self.assertNotIn('{',safe_ass(r'{\pos(2,3)}文字'))
if __name__ == '__main__': unittest.main()
