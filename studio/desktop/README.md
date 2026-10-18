# Shorts Studio Desktop (Windows)

Electron packaging of the existing local Shorts Studio browser editor. The browser editor's source and project schema remain shared, and the app does **not** navigate to a public website.

## Installed app and portable EXE

Built app targets:

- **Installer**: `Shorts-Studio-Setup-0.2.0-x64.exe`. After installation, launch from Start Menu / desktop shortcut; **no PowerShell or Chrome tab required**.
- **Portable**: `Shorts-Studio-Portable-0.2.0-x64.exe` can be started by double-click without installation. It decompresses on launch and may take longer than an installed copy.

App startup launches the local Node editor server on a random 127.0.0.1 port and opens the existing editor in a sandboxed Electron window. It limits navigation, popup creation and OS permissions, and only starts one app instance. Export jobs block ordinary window close until they finish to protect intermediate files. It never starts an external online website for basic editing.

**Project data is unchanged**: `D:\AI\shorts-studio-projects` (override `SHORTS_STUDIO_PROJECTS_DIR`). It stays outside the installer and the app update directory. Closing, reinstalling or changing packaging does not intentionally delete these projects. `project.json` stays canonical.

## Developer commands

From `studio/`, with Node.js 22+, Windows Chrome/Edge, FFmpeg on PATH, and npm:

```powershell
npm ci
npm run desktop
npm run desktop:build
```

`desktop` starts an Electron development app. `desktop:build` copies the already-installed FFmpeg and FFprobe executables from PATH to a Git-ignored runtime resource folder, includes the distribution license text, and builds portable + installer x64 executables in `desktop-dist/`. The binary paths at runtime are resolved from the packaged `resources/bin` directory. The user's FFmpeg installation is not modified. Individual developer builds are **not signed**.

The editor's old browser launch command remains `npm run start:editor`.

## Voice requirements

Silent MP4 export is self-contained in the packaged Windows executable (FFmpeg included; Chrome/Edge still required for screenshot-based rendering). Optional English voice generation sends script text to an **external Edge TTS service**. The installed app automatically detects the existing `D:\AI\shorts-voice-env\Scripts\python.exe` or `D:\AI\experiments\shorts-venv\Scripts\python.exe` when present. If neither is installed, configure `SHORTS_PYTHON` yourself or set up the environment per `studio/editor/README.md`.

The `voice_sync.py` source is explicitly unpacked from Electron ASAR so external Python can read it. Edge TTS provider terms and commercial permissions are **not verified**. The produced videos are technical previews, not publication-approved videos.

## Source / distribution responsibilities

Current bundled WinGet FFmpeg distribution comes from Gyan's FFmpeg builds and reports **GPL version 3 or later**. The distribution's included `LICENSE` is copied to `resources/bin/FFmpeg-LICENSE.txt`. Distributing binaries publicly may additionally require GPL source-code availability and notice compliance. These test builds are intended for the owner's personal machine; public releases, signed installers and automated updates are **not done**. On unsigned Windows installers, SmartScreen warnings may appear. Never bypass a security warning for an installer from an unknown source.

Electron is pinned; `electron-builder` packages the runtime without altering user projects. `studio/node_modules`, `studio/desktop-dist` and copied FFmpeg binaries are excluded from Git.

## Evidence and limitations

2026-10-18: Windows PC Electron development E2E passed, and **packaged win-unpacked EXE** passed real UI create/edit/save, sandbox enabled and a real 12-second H.264/AAC video render test using bundled FFmpeg. Existing Node / Python tests remain separate. Windows installer and portable EXE builds are checked independently. Production-ready speech quality, exact subtitle timing, original 25–40-second comedy content and commercial voice rights are **not** automatically approved.

One-instance test, shortcut / installer behavior and antivirus/code signing are separate from basic dev-mode success. See `WORK_REPORT.md`.
