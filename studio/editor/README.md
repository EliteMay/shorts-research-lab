# Shorts Studio: Chat Editor Foundation

## Purpose and scope (2026-10-18)

A Windows-first **local browser-based editing workspace** for original, English-first chat comedy Shorts. It is an incremental addition to `studio/`, not a rewrite. Future Electron packaging and an identical preview/export composition are separate milestones.

**Implemented:** create/select projects, edit chat messages and their reveal times, deterministic 9:16 browser preview, seek/play/pause, original locally-owned MP4 background upload and preview, autosave to JSON, reopen, import/export a portable script JSON, file/format/revision validation.

**Not implemented:** voice generation or audio playback, subtitle alignment, final MP4 export from chat compositions, rights verification, automatic topic generation, publication, one-click production, Electron packaging. The browser preview is **not** the same as a rendered production MP4 yet.

## How to start

From `studio/` on Windows:

```powershell
npm run start:editor
```

Open the `http://127.0.0.1:<port>` printed by the command. The service binds to local loopback only. Node.js 22+ required; the editor uses no npm runtime dependencies. The older production tools and material review UI are independent.

Default project data root: `D:\AI\shorts-studio-projects`. Override with `SHORTS_STUDIO_PROJECTS_DIR` if needed. Projects are saved under `<root>/<project-id>/project.json`; uploaded background files are stored alongside as `bg-*.mp4`. Projects do not get committed to GitHub.

## Editing workflow

1. Create a project. The initial story is a **sample**, not a quality-approved script.
2. Edit English character names, messages, and their reveal second. Save starts automatically after a short pause, and the top-right status shows progress.
3. Preview by dragging the timeline or pressing Play. Only the latest three messages are shown, to avoid clipping in a phone-sized screen.
4. Optionally upload a legally usable MP4 (64 MiB max). Stored video loops in the lower 40% and responds to the seek position. The editor does not make the media's rights determination.
5. Close and reopen the editor. Your project JSON and background file are still present. You can also export script JSON or import a script JSON into the current project.

## Data contract (schemaVersion 1)

The canonical edit state lives in `project.json`. `revision` increments after every accepted save/upload. Stale saves reject with HTTP 409 rather than overwrite newer work. Titles, message IDs, speaker names, texts, ascending 0.1-second timestamps, and the 10–90 second duration are validated. Import does not transfer another project's ID or background. All user-authored chat text renders through `textContent`, not HTML injection.

The service rejects non-local browser write origins, unknown routes and media file paths; HTML uses restrictive CSP and the server sends no-store security headers. An upload is accepted after an MP4 header check; playback/correctness and commercial rights still require review.

Data recovery: corrupt project folders are left untouched, not auto-deleted. If a conflict is shown, reload to see the latest saved version. If you need a manual backup, copy the full project directory, including MP4s. No remote sync or automatic historical versions are implemented.

## Verification

- `cd studio; npm test`: schema, rejection, concurrent edit conflict, HTTP CRUD, MP4 Range and access restrictions, plus existing Studio regression tests.
- 2026-10-18 Windows Chrome headless E2E: create, edit, autosave/reload, timeline seek, upload a synthetic MP4, reload and decode, script JSON export/import, mobile viewport and page errors. Evidence kept **outside GitHub** under `D:\AI\experiments\shorts-editor-e2e`.

## Next milestone

Choose and verify a shared rendering composition before claiming WYSIWYG. Evaluate Remotion locally with the existing FFmpeg pipeline, add per-speaker audio and real subtitle timing, then verify preview-to-export fidelity on one complete video. Keep the current local JSON projects readable; migrate by `schemaVersion` rather than modifying old data silently.
