import { app, BrowserWindow, dialog, session, Menu } from 'electron';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { DEFAULT_PROJECT_DIR } from '../editor/project.mjs';
import { fileURLToPath } from 'node:url';
import { createEditorServer } from '../editor/server.mjs';
import { setupDesktopEnvironment, APP_ID, APP_NAME } from './runtime.mjs';

let mainWindow = null;
let editorServer = null;
let localOrigin = '';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(here, 'assets', 'shorts-studio.ico');

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: iconPath,
    width: 1440,
    height: 940,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0f16',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: true
    }
  });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin === localOrigin) return;
    } catch { /* reject malformed urls */ }
    event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', event => {
    if (editorServer?.hasRunningJobs?.()) {
      event.preventDefault();
      void dialog.showMessageBox(mainWindow, {
        type: 'info', title: '書き出し中',
        message: '動画の書き出し中は終了できません。',
        detail: '出力が完了してから閉じてください。中断によるファイル破損を防ぎます。',
        buttons: ['確認']
      });
    }
  });
  contents.on('render-process-gone', (_event, details) => {
    console.error('[Shorts Studio] Renderer stopped', details.reason);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void dialog.showMessageBox(mainWindow, {
      type: 'error', title: '画面に問題が発生しました',
      message: '編集画面が停止しました。',
      detail: '保存済みプロジェクトはそのまま残っています。アプリを終了して起動し直してください。',
      buttons: ['確認']
    });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadURL(localOrigin + '/').catch(error => {
    console.error('[Shorts Studio] Could not load editor', error);
    dialog.showErrorBox('Shorts Studio', '編集画面を開けませんでした。');
  });
}
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.setAppUserModelId(APP_ID);
  // Chromium caches must not silently consume the system drive.
  const userDataRoot = process.env.SHORTS_STUDIO_APP_DATA_DIR ||
    path.join(path.dirname(process.env.SHORTS_STUDIO_PROJECTS_DIR || DEFAULT_PROJECT_DIR), 'shorts-studio-appdata');
  try {
    mkdirSync(userDataRoot, { recursive: true });
    app.setPath('userData', userDataRoot);
  } catch (error) {
    console.error('[Shorts Studio] Could not move Electron cache to local workspace', error);
  }
  app.whenReady().then(async () => {
    try {
      const { root } = setupDesktopEnvironment({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath
      });
      Menu.setApplicationMenu(null);
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      editorServer = createEditorServer({ root });
      await new Promise((resolve, reject) => {
        editorServer.once('error', reject);
        editorServer.listen(0, '127.0.0.1', resolve);
      });
      localOrigin = 'http://127.0.0.1:' + editorServer.address().port;
      console.info('[Shorts Studio] Editor running locally at', localOrigin);
      createWindow();
    } catch (error) {
      console.error('[Shorts Studio] Startup failed', error);
      dialog.showErrorBox('Shorts Studioの起動に失敗しました', error.message);
      app.quit();
    }
  });
  app.on('window-all-closed', () => { app.quit(); });
  app.on('before-quit', () => { editorServer?.close(); });
}
