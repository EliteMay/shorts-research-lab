import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from render_reviewed import verified_files

class MediaReviewGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.data=b"synthetic PNG bytes for review gate test" * 4
        (self.root/"scene-1.png").write_bytes(self.data)
        self.scene={"sceneIndex":0,"filename":"scene-1.png",
             "sha256":hashlib.sha256(self.data).hexdigest(),
             "sourcePage":"https://example.org/fixture","imageUrl":"https://example.org/fixture.png",
             "creator":"Fixture generator","license":"Generated for tests",
             "credit":"Fixture generator","licenseSnapshot":"Synthetic fixture",
             "rightsReviewed":True,"visualMatchesNarration":True,"humanApproved":True}
        self.manifest={"schemaVersion":1,"approvalScope":"local-technical-preview-only",
            "reviewType":"explicit-operator-attestation","scenes":[self.scene]}
        self.script={"scenes":[{"narration":"猫です。"}]}
        self.timing={"durationMs":1500,"scenes":[{"startMs":0,"endMs":1500}],
            "cues":[{"startMs":0,"endMs":1500,"text":"猫です。"}]}
        self.save()
    def tearDown(self):
        self.tmp.cleanup()
    def save(self):
        (self.root/"reviewed-assets.json").write_text(json.dumps(self.manifest),encoding="utf8")
    def test_valid_manifest_and_data(self):
        self.assertEqual(len(verified_files(self.script,self.timing,self.root)["scenes"]),1)
    def test_tampered_media_is_rejected(self):
        (self.root/"scene-1.png").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError,"changed after review"):
            verified_files(self.script,self.timing,self.root)
    def test_missing_approval_is_rejected(self):
        self.scene["humanApproved"]=False
        self.save()
        with self.assertRaisesRegex(ValueError,"review is incomplete"):
            verified_files(self.script,self.timing,self.root)
    def test_path_escape_is_rejected(self):
        self.scene["filename"]="../escape.png"
        self.save()
        with self.assertRaisesRegex(ValueError,"review is incomplete"):
            verified_files(self.script,self.timing,self.root)
    def test_wrong_timing_script_fails(self):
        self.timing["cues"][0]["text"]="犬です。"
        with self.assertRaisesRegex(ValueError,"does not match"):
            verified_files(self.script,self.timing,self.root)

if __name__=="__main__":
    unittest.main()
