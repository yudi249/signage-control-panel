import { app, BrowserWindow, Menu, ipcMain, dialog, session } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { readConfig, saveConfig, removeConfig, deviceUrl } from './config.mjs';
import { createLoader } from './loader.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const localUrl = pathToFileURL(join(root, 'shell.html')).href;
// Profil sementara hanya untuk smoke test, tidak menyentuh pemasangan pengguna.
if (!app.isPackaged && process.env.SIGNAGE_DESKTOP_TEST_PROFILE) {
  app.setPath('userData', process.env.SIGNAGE_DESKTOP_TEST_PROFILE);
}
let window;
let config = null;
let notice = '';
let screen = 'settings';
let loader;
let configPath;
let deviceSession;
let busy = false;

function showLocal(next, message = '') {
  if (!window || window.isDestroyed()) return;
  screen = next;
  notice = message;
  window.setFullScreen(false);
  void window.loadURL(`${localUrl}?screen=${next}`).catch(() => {});
}

function showSettings() {
  if (busy) return;
  loader.cancel();
  showLocal('settings');
}

function openDevice() {
  if (!config) { showSettings(); return; }
  screen = 'device';
  window.setFullScreen(true);
  loader.start(deviceUrl(config));
}

function trusted(event) {
  return window && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url.split('?')[0] === localUrl;
}

function handle(name, action) {
  ipcMain.handle(`desktop:${name}`, async (event, value) => {
    if (!trusted(event)) throw new Error('Akses pengaturan ditolak.');
    try { return await action(value); }
    catch (error) { return { error: error instanceof Error ? error.message : 'Operasi gagal.' }; }
  });
}

async function changeSettings(action) {
  if (busy) return { error: 'Pengaturan sedang disimpan. Tunggu sebentar.' };
  busy = true;
  try { return await action(); } finally { busy = false; }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => loader?.cancel());
  app.whenReady().then(async () => {
    configPath = join(app.getPath('userData'), 'device-config.json');
    ({ config, notice } = await readConfig(configPath));
    deviceSession = session.fromPartition('persist:signage-device');
    deviceSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    deviceSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({
      width: 1100, height: 760, minWidth: 640, minHeight: 480,
      title: 'Signage Device Client',
      webPreferences: {
        session: deviceSession,
        preload: join(root, 'preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    loader = createLoader({
      load: (url) => { screen = 'device'; window.setFullScreen(true); return window.loadURL(url); },
      stop: () => { if (!window.isDestroyed()) window.webContents.stop(); },
      failed: () => showLocal('recovery', 'Halaman Device Client tidak dapat dimuat. Periksa alamat web dan koneksi jaringan.'),
    });
    window.on('closed', () => loader.cancel());
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const permitted = (url) => config && url === deviceUrl(config);
    window.webContents.on('will-navigate', (event, url) => { if (!permitted(url)) event.preventDefault(); });
    window.webContents.on('will-redirect', (event, url) => { if (!permitted(url)) event.preventDefault(); });
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }
      if (input.key === 'Escape') { event.preventDefault(); window.setFullScreen(false); }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Aplikasi', submenu: [
        { label: 'Pengaturan', accelerator: 'CommandOrControl+,', click: showSettings },
        { label: 'Fullscreen', accelerator: 'F11', click: () => window.setFullScreen(!window.isFullScreen()) },
        { type: 'separator' }, { label: 'Keluar', role: 'quit' },
      ] },
    ]));
    handle('state', () => ({ config, notice, screen }));
    handle('save', (value) => changeSettings(async () => {
      const saved = await saveConfig(configPath, value);
      loader.cancel();
      config = saved;
      openDevice();
      return { ok: true };
    }));
    handle('settings', () => { showSettings(); return { ok: true }; });
    handle('cancel', () => { if (config) openDevice(); return { ok: true }; });
    handle('retry', () => { if (config && !busy) openDevice(); return { ok: true }; });
    handle('reset', () => changeSettings(async () => {
      const choice = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Hapus data pemasangan',
        message: 'Hapus konfigurasi, token, dan seluruh data situs aplikasi ini?',
        buttons: ['Batal', 'Hapus'], defaultId: 0, cancelId: 0,
      });
      if (choice.response !== 1) return { ok: false };
      loader.cancel();
      await window.loadURL(`${localUrl}?screen=settings`);
      await deviceSession.clearStorageData();
      await deviceSession.clearCache();
      await removeConfig(configPath);
      config = null;
      showLocal('settings', 'Data pemasangan dihapus. Silakan pasangkan Device.');
      return { ok: true };
    }));
    if (config) openDevice(); else showLocal('settings', notice);
  }).catch((error) => { console.error('Startup desktop gagal:', error); app.quit(); });
}
