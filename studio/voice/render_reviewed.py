"""Fail-closed bridge from reviewed image manifest to Japanese voice-timed MP4.

The presence of approval flags is a recorded operator attestation, not a claim that
the app independently verified image copyright or semantic correctness.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from render_local_preview import render, validate as validate_timing


def verified_files(script, timing, image_dir):
    image_dir = image_dir.resolve(strict=True)
    manifest_path = image_dir / "reviewed-assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    count, _, _ = validate_timing(script, timing)
    if (manifest.get("schemaVersion") != 1
            or manifest.get("reviewType") != "explicit-operator-attestation"
            or manifest.get("approvalScope") != "local-technical-preview-only"
            or len(manifest.get("scenes", [])) != count):
        raise ValueError("Review manifest missing or scene count mismatch")
    for i, entry in enumerate(manifest["scenes"]):
        expected_name = f"scene-{i + 1}.png"
        if (entry.get("sceneIndex") != i or entry.get("filename") != expected_name
                or not all(entry.get(k) is True for k in
                           ("rightsReviewed", "visualMatchesNarration", "humanApproved"))):
            raise ValueError(f"Scene {i+1}: review is incomplete")
        if not all(isinstance(entry.get(k), str) and entry[k].strip() for k in
                   ("sourcePage", "imageUrl", "creator", "license",
                    "credit", "licenseSnapshot", "sha256")):
            raise ValueError(f"Scene {i+1}: provenance is missing")
        src = image_dir / expected_name
        if src.is_symlink() or not src.is_file():
            raise ValueError(f"Scene {i+1}: local image missing or symlink")
        digest = hashlib.sha256(src.read_bytes()).hexdigest()
        if entry["sha256"] != digest:
            raise ValueError(f"Scene {i+1}: image changed after review")
    return manifest


def assemble(script_path, timing_path, images, audio, output):
    script = json.loads(script_path.read_text(encoding="utf-8"))
    timing = json.loads(timing_path.read_text(encoding="utf-8"))
    manifest = verified_files(script, timing, images)
    if not audio.is_file():
        raise FileNotFoundError(audio)
    if output.exists():
        raise FileExistsError("Output path already exists; refusing to overwrite")
    output.mkdir(parents=True)
    try:
        render(script, timing, images, audio, output)
        provenance = {
            "qualityApproved": False,
            "reviewStatus": "operator-attested, not independently verified",
            "sourceImageManifest": "reviewed-assets.json",
            "audioSource": str(timing.get("timingSource", "unknown")),
            "attributions": [{
                "scene": i+1, "creator": m["creator"],
                "credit": m["credit"], "license": m["license"],
                "sourcePage": m["sourcePage"], "licenseUrl": m.get("licenseUrl", "")
            } for i, m in enumerate(manifest["scenes"])],
            "notice": "Technical preview, not approved for publishing."
        }
        (output/"provenance.json").write_text(
            json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        # Only clean the directory created by this command.
        shutil.rmtree(output)
        raise


def main():
    parser=argparse.ArgumentParser(description="Render a technical preview from reviewed scene images")
    for field in ("script","timing","images","audio","out"):
        parser.add_argument("--"+field, required=True, type=Path)
    args=parser.parse_args()
    assemble(args.script,args.timing,args.images,args.audio,args.out)

if __name__=="__main__":
    main()
