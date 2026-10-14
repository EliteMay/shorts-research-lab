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
    def test_no_dangling_ta_caption(self):
        sentence = 'ロボットは来た道を走って戻りました。'
        words = ['ロボット','は','来た','道','を','走って','戻り','まし','た']
        cues = word_cues(sentence,[event(w,i*350,300) for i,w in enumerate(words)])
        self.assertEqual(''.join(x['text'] for x in cues), sentence)
        self.assertFalse(any(x['text'] == 'た。' for x in cues))
    def test_keeps_te_with_verb_stem(self):
        sentence = '鍵はずっと首にかかっていたのです。'
        words = ['鍵', 'は', 'ずっと', '首', 'に', 'かかっ', 'て', 'いた', 'の', 'です']
        cues = word_cues(sentence, [event(w, i * 330, 300) for i, w in enumerate(words)])
        self.assertEqual(''.join(c['text'] for c in cues), sentence)
        self.assertFalse(any(c['text'].endswith('かかっ') for c in cues))
    def test_keeps_sou_with_adjective(self):
        sentence = 'ロボットは照れくさそうに笑いました。'
        words = ['ロボット', 'は', '照れ', 'くさ', 'そう', 'に', '笑い', 'ました']
        cues = word_cues(sentence, [event(w, i * 300, 280) for i,w in enumerate(words)])
        self.assertEqual(''.join(c['text'] for c in cues), sentence)
        self.assertFalse(any(c['text'].endswith('照れくさ') for c in cues))
    def test_normalization(self):
        self.assertEqual(clean('ネコ、Ａ！'),clean('ネコA'))
if __name__ == '__main__': unittest.main()
