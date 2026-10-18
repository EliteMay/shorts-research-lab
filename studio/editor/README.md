# Shorts Studio: Chat Editor

## Purpose / current status (2026-10-18)

A Windows-first, local-browser editor for original English chat comedy Shorts, developed incrementally in `studio/`. Its purpose is to produce high-quality edited stories, not mass-generated uploads.

**Working:** create/select projects, edit messages and reveal times, 9:16 seek/play/pause preview, import a personally cleared MP4, autosave and reopen JSON projects, import/export script JSON, create and download 720×1280/30fps technical MP4 with moving background, **optional per-speaker English TTS audio** aligned to message start times.

**Not yet done:** real-time audio playback in the main editor's preview, exact audio-word/subtitle synchronization, animated bubble entrances in rendered output, sound design/BGM, independent verification of media and TTS commercial rights, full human review, final publishable export, Electron app packaging. Exported MP4s are technical previews, **never automatically approved for publication**.

## Start the editor

In `studio/` on the Windows PC:

```powershell
npm ci
npm run start:editor
```

Open the printed localhost URL. Requires Node.js 22+, local Chrome or Edge (optional `SHORTS_CHROME_PATH` override), and `ffmpeg` and `ffprobe` on PATH. The only new Node package is pinned `playwright-core@1.56.1`. No paid AI/API subscription is required.

### Optional English voices

Edge TTS (`edge-tts==7.3.1` from `studio/voice/requirements.txt`) is an **external online** synthesis service, not a local offline AI model. You must understand that **the chat text you wrote will be sent to an external provider** when voice is enabled. Availability and terms may change; commercial publishing rights for this particular service have **not** been verified. Do not treat TTS output as publication-approved.

To install a dedicated Python environment from the repository root on Windows, once:

```powershell
python -m venv D:\AI\shorts-voice-env
D:\AI\shorts-voice-env\Scripts\python.exe -m pip install -r studio\voice\requirements.txt
```

Then from `studio/`:

```powershell
$env:SHORTS_PYTHON = 'D:\AI\shorts-voice-env\Scripts\python.exe'
npm run start:editor
```

The existing development venv `D:\AI\experiments\shorts-venv\Scripts\python.exe` also works on the validated home PC. If you do not enable voice, Python/Edge TTS is not needed for export.

At the export panel, tick **英語AI音声を付ける**. Speakers get deterministic different voice presets (e.g. `Mom` = Jenny, `Me` = Guy). The original script and project JSON are not modified by synthesis. Voices are not yet individually customizable in UI.

## Editing and exports

1. Create a project. Initial lines are a placeholder, not an approved story.
2. Edit character name, dialogue and reveal times. Saves debounce and use revision/atomic writes.
3. Preview chat visuals (latest 3 bubbles) and silent moving background in the browser.
4. Upload a lawful MP4 (64 MiB max), confirm **your own** rights check, optionally enable English voice, then click **MP4プレビューを書き出す**.
5. The backend screenshots each message state using the same browser HTML/CSS and composites continuous video behind the chat with FFmpeg. With voice, it synthesizes one clip per message, removes the leading dead air while keeping a small breathing gap, measures the actual audio durations using FFprobe, rejects overlapping/too-long clips, delays each clip to its reveal timestamp and mixes AAC audio.
6. Download the MP4, inspect visual timing and listen to each voice. After any script or asset revision, the old export is invalidated until re-rendered.

Output: `chat-preview.mp4` and `chat-preview-report.json` next to that project's `project.json`. MP4 is 720×1280 / 30fps H.264; optional audio is AAC. Report includes revision, duration, SHA256, `hasAudio`, `qualityApproved:false`, and `providerRightsVerified:false`. It is *derived* output; `project.json` is canonical. The preview and output reuse the same chat HTML/CSS, but animated bubble entrances are not yet WYSIWYG in MP4.

If voice needs more room, **extend the gap to the next message or shorten the line**. Do not force overlap or truncate dialogue to make the video appear complete. Voice generation can fail if internet/TTS is unavailable; silent export remains available.

## Local data / security

Default projects folder: `D:\AI\shorts-studio-projects` (override `SHORTS_STUDIO_PROJECTS_DIR`). Every project has a validated project ID and schemaVersion 1. Concurrent stale writes are rejected (HTTP 409), originals are not auto-deleted on errors, and media paths are restricted to the owning project. The server listens on 127.0.0.1, validates Host/Origin and sets a restrictive Content Security Policy; chat contents render via `textContent`. Rendering is single-job, temp inputs are removed, and failed/ongoing re-renders do not offer the previous output as current in the active server session.

Back up complete project folders (JSON plus uploaded MP4) to preserve work; there is no automatic revision history or cloud sync.

## Validation

- `cd studio; npm test`: project/schema, optimistic revisions, API, media range, render permissions, voice length overlap filters and all existing regression tests.
- Windows Chrome + FFmpeg E2E tested both silent and voice modes, real MP4 downloads, hash and FFprobe validation, and post-edit stale-output denial.
- English TTS E2E: 12.000-second test with distinct Jenny/Guy voice clips aligned at 1.0s, 4.0s and 8.0s; `silencedetect` measured speech onset near each scheduled reveal after leading-silence trim. This is an **engineering measurement**, not a human listening/quality review.
- Evidence/synthetic assets stored locally in `D:\AI\experiments\shorts-editor-voice-e2e` and related E2E folders, not added to GitHub.

## Next milestone

Listen to and compare the full voice track, improve English voices and character assignments, support motion/voice preview parity and appropriate sound effects, confirm TTS commercial terms or switch to a commercial-friendly local TTS. Produce one 25–40 second original video and assess audience value and rights before main merge/publication.
