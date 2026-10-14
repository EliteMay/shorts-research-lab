import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from edge_sync import word_cues, clean

def event(text, offset, duration=400):
    return {'text':text,'offset':offset*10000,'duration':duration*10000}

class JapaneseSyncTest(unittest.TestCase):
    def test_valid_script(self):
        text='ロボットは鍵を探しました。'
        e=[event('ロボット',100),event('は',500),event('鍵',900),
           event('を',1250),event('探しました',1700)]
        cues=word_cues(text,e)
        self.assertEqual(''.join(c['text'] for c in cues),text)
        self.assertEqual(cues[0]['startMs'],100)
    def test_punctuation_stays_with_word(self):
        text='鍵が、ない！'
        cues=word_cues(text,[event('鍵',0),event('が',400),event('ない',900)],max_chars=7)
        self.assertEqual(''.join(c['text'] for c in cues),text)
    def test_word_mismatch_fails(self):
        with self.assertRaisesRegex(ValueError,'differ'): word_cues('猫の秘密',[event('犬',0)])
    def test_no_metadata_fails(self):
        with self.assertRaises(ValueError): word_cues('猫',[])
    def test_out_of_order_fails(self):
        with self.assertRaises(ValueError):
            word_cues('猫と犬',[event('猫',500),event('と',300),event('犬',1000)])
    def test_overlong_word_fails(self):
        with self.assertRaisesRegex(ValueError,'width'):
            word_cues('機械学習エンジニアに',[event('機械学習エンジニア',0),event('に',1000)],max_chars=7)
    def test_normalization(self):
        self.assertEqual(clean('ネコ、Ａ！'),clean('ネコA'))
if __name__ == '__main__': unittest.main()
