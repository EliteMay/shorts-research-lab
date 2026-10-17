# Shorts Studio: Chat Editor Foundation

## Purpose and scope (2026-10-18)

A Windows-first **local browser-based editing workspace** for original, English-first chat comedy Shorts. It is an incremental addition to `studio/`, not a rewrite. Future Electron packaging and an identical preview/export composition are separate milestones.

**Implemented:** create/select projects, edit chat messages and their reveal times, deterministic 9:16 browser preview, seek/play/pause, locally-owned MP4 background upload and preview, autosave to JSON, reopen, import/export a portable script JSON, file/format/revision validation, and **silent MP4 technical export** (720×1280, 30 fps). Chat imagery is captured from the same browser UI and combined with continuously moving background footage in FFmpeg.

**Not implemented:** voice generation or audio playback, subtitle alignment, **audio-complete / publication-ready** MP4 export, rights verification, automatic topic generation, publication, one-click production, Electron packaging. The browser and technical export reuse the chat DOM/CSS, but export is not yet a motion-accurate/WYSIWYG production master (chat entrance CSS animations are not exported).

## How to start

From `studio/` on Windows:

```powershell
npm ci
npm run start:editor
```

Open the `http://127.0.0.1:<port>` printed by the command. The service binds to local loopback only. Node.js 22+ required, a locally installed Chrome or Edge (override: `SHORTS_CHROME_PATH`), and FFmpeg / FFprobe on `PATH`. Only `playwright-core` is added as a pinned npm runtime dependency; there are no paid API dependencies. The older production tools and material review UI are independent.

Default project data root: `D:\AI\shorts-studio-projects`. Override with `SHORTS_STUDIO_PROJECTS_DIR` if needed. Projects are saved under `<root>/<project-id>/project.json`; uploaded background files are stored alongside as `bg-*.mp4`. Projects do not get committed to GitHub.

## Editing workflow

1. Create a project. The initial story is a **sample**, not a quality-approved script.
2. Edit English character names, messages, and their reveal second. Save starts automatically after a short pause, and the top-right status shows progress.
3. Preview by dragging the timeline or pressing Play. Only the latest three messages are shown, to avoid clipping in a phone-sized screen.
4. Optionally upload a legally usable MP4 (64 MiB max). Stored video loops in the lower 40% and responds to the seek position. The editor does not make the media's rights determination.
5. Confirm you independently checked that you can use the selected background video, then press **MP4プレビューを書き出す**. Progress is visible in the app. The generated MP4 has **no sound**, so it must not be treated as finished Shorts content.
6. Download the resulting MP4 and review it. Changing the project revision invalidates the old export until re-rendered. Closing/reopening retains projects, backgrounds and the latest valid technical export.

## Data contract (schemaVersion 1)

The canonical edit state lives in `project.json`. `revision` increments after every accepted save/upload. Stale saves reject with HTTP 409 rather than overwrite newer work. Titles, message IDs, speaker names, texts, ascending 0.1-second timestamps, and the 10–90 second duration are validated. Import does not transfer another project's ID or background. All user-authored chat text renders through `textContent`, not HTML injection.

The service rejects non-local browser write origins, unknown routes and media file paths; HTML uses restrictive CSP and the server sends no-store security headers. An upload is accepted after an MP4 header check; playback/correctness and commercial rights still require review.

Render mechanics: Chrome screenshots each distinct message state at 720px wide; FFmpeg concatenates them for the exact reveal durations, scales/crops the looping background into the lower 40%, and produces H.264 MP4 at 720×1280 / 30fps with no audio. `chat-preview.mp4` and `chat-preview-report.json` are **derived output**, never canonical project data. Report records schemaVersion, revision, duration, SHA256 and explicit `hasAudio:false`, `qualityApproved:false`. Rendering fails if the project changes mid-render. Concurrent renders are refused. Verified rights remain a user assertion, **not an automated license check**.

Data recovery: corrupt project folders are left untouched, not auto-deleted. If a conflict is shown, reload to see the latest saved version. If you need a manual backup, copy the full project directory, including MP4s. No remote sync or automatic historical versions are implemented.

## Verification

- `cd studio; npm test`: schema, rejection, concurrent edit conflict, HTTP CRUD, render permissions/state, shot timing, MP4 Range and access restrictions, plus existing Studio regression tests.
- 2026-10-18 Windows Chrome headless E2E: create, edit, autosave/reload, timeline seek, upload a synthetic MP4, reload and decode, script JSON export/import, mobile viewport and page errors. Also rendered a 12.000s moving-background technical preview, downloaded it, checked 720×1280/H.264, SHA256 integrity, `hasAudio:false`, and refused stale-version downloads. Evidence under `D:\AI\experiments\shorts-editor-e2e` and `D:\AI\experiments\shorts-editor-render-e2e` outside Git.

## Next milestone

Add per-speaker English voice and real timing, background mix levels, and preview-to-export fidelity including message entrance animation. A future Remotion evaluation remains an option only if it materially improves WYSIWYG/editing over the current shared browser DOM + FFmpeg pipeline. Render one complete voiced video and perform human listening / visual quality review before claiming it is publishable. Keep the current local JSON projects readable; migrate by `schemaVersion` rather than modifying old data silently.
