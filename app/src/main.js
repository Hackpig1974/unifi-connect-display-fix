const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Store = require('electron-store');

// ── Config store ──────────────────────────────────────────────────────────────
const store = new Store({
  name: 'config',
  defaults: {
    udmIp: '',
    downloadFolder: '',
    theme: 'dark',
    windowBounds: { width: 960, height: 620 }
  }
});

// ── Version / update check ────────────────────────────────────────────────────
const VERSION = '1.0.1';
const RELEASES_URL = 'https://github.com/Hackpig1974/unifi-connect-display-fix/releases/latest';

function checkForUpdate(callback) {
  const options = {
    hostname: 'api.github.com',
    path: '/repos/Hackpig1974/unifi-connect-display-fix/releases/latest',
    headers: { 'User-Agent': 'uni-display-updater', 'Accept': 'application/vnd.github+json' }
  };
  const req = https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const tag = (json.tag_name || '').replace(/^v/, '');
        if (tag && isNewer(tag, VERSION)) callback(tag);
        else callback(null);
      } catch { callback(null); }
    });
  });
  req.on('error', () => callback(null));
  req.setTimeout(5000, () => { req.destroy(); callback(null); });
}

function isNewer(remote, local) {
  try {
    const r = remote.split('.').map(Number);
    const l = local.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (r[i] > l[i]) return true;
      if (r[i] < l[i]) return false;
    }
    return false;
  } catch { return false; }
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0f1420',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });
}

app.whenReady().then(() => {
  createWindow();
  setTimeout(() => {
    checkForUpdate((version) => {
      if (version && mainWindow) {
        mainWindow.webContents.send('update-available', version);
      }
    });
  }, 2000);
});

app.on('window-all-closed', () => app.quit());

// ── IPC: Config ───────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => store.store);
ipcMain.handle('save-config', (_, cfg) => { store.set(cfg); return true; });
ipcMain.handle('get-version', () => ({ version: VERSION, releasesUrl: RELEASES_URL }));
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Download Folder'
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: Fetch firmware list ──────────────────────────────────────────────────
ipcMain.handle('fetch-versions', () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'fw-update.ubnt.com',
      path: '/api/firmware?filter=eq~~product~~protect-android-app&filter=eq~~platform~~android-app&filter=eq~~channel~~release&limit=20&sort=-created',
      headers: { 'User-Agent': 'uni-display-updater/1.0.0' }
    };
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const versions = json._embedded.firmware.map((f, i) => ({
            version: f.version,
            size: f.file_size,
            md5: f.md5,
            date: f.created,
            url: f._links.data.href,
            latest: i === 0
          }));
          resolve({ ok: true, versions });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, error: 'Request timed out' }); });
  });
});

// ── IPC: Download APK ─────────────────────────────────────────────────────────
ipcMain.handle('download-apk', (event, { url, destFolder, filename }) => {
  return new Promise((resolve) => {
    const destPath = path.join(destFolder, filename);

    // If file exists already ask to overwrite
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

    const file = fs.createWriteStream(destPath);
    let received = 0;
    let total = 0;

    const doGet = (requestUrl) => {
      const urlObj = new URL(requestUrl);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'uni-display-updater/1.0.0' }
      };
      https.get(options, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location);
          return;
        }
        total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', (chunk) => {
          received += chunk.length;
          file.write(chunk);
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            event.sender.send('download-progress', { pct, received, total });
          }
        });
        res.on('end', () => {
          file.end();
          resolve({ ok: true, path: destPath });
        });
        res.on('error', (e) => {
          file.destroy();
          resolve({ ok: false, error: e.message });
        });
      }).on('error', (e) => {
        file.destroy();
        resolve({ ok: false, error: e.message });
      });
    };

    doGet(url);
  });
});

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
