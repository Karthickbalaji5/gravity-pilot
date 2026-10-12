const { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let isClickThrough = false;
let backendProcess = null;
let quietMode = false;

// ── Persistent settings ─────────────────────────────────────────────────────

const settingsPath = path.join(app.getPath('userData'), 'nila-settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveSettings(patch) {
  const current = loadSettings();
  const merged = { ...current, ...patch };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
}

const savedSettings = loadSettings();
let currentMode = savedSettings.mode || 'pet';
let startWithWindows = savedSettings.startWithWindows || false;

// Enable WebGL transparency and smooth hardware rendering on Windows
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ── Backend process management (packaged mode) ─────────────────────────────

function isPackaged() {
  return app.isPackaged;
}

function getBackendExePath() {
  const exeName = process.platform === 'win32' ? 'gravity-pilot-backend.exe' : 'gravity-pilot-backend';
  return path.join(process.resourcesPath, 'backend', exeName);
}

async function startBackendIfPackaged() {
  if (!isPackaged()) return true;

  const exePath = getBackendExePath();
  if (!fs.existsSync(exePath)) {
    console.error('Backend exe not found at:', exePath);
    return false;
  }

  backendProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    stdio: 'pipe',
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()));
  backendProcess.on('exit', (code) => { console.log('Backend exited:', code); backendProcess = null; });

  // Wait for /health
  const http = require('http');
  for (let i = 0; i < 30; i++) {
    const ok = await new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:8000/health', (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('Backend failed to start within 30s');
  return false;
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// ── Window management ───────────────────────────────────────────────────────

function createMainWindow() {
  const isPet = currentMode === 'pet';
  const isCompanion = currentMode === 'companion' || isPet;
  const saved = loadSettings();

  let defaults;
  if (isPet) {
    defaults = { width: 220, height: 320, minWidth: 180, minHeight: 260 };
  } else if (currentMode === 'companion') {
    defaults = { width: 380, height: 580, minWidth: 320, minHeight: 440 };
  } else {
    defaults = { width: 1240, height: 840, minWidth: 720, minHeight: 540 };
  }

  const winBounds = saved.windowBounds && saved.windowBounds[currentMode]
    ? saved.windowBounds[currentMode]
    : defaults;

  // Pet mode: sit on taskbar line
  if (isPet && !winBounds.x) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    winBounds.x = Math.floor(workArea.x + workArea.width / 2 - defaults.width / 2);
    winBounds.y = workArea.y + workArea.height - defaults.height;
  }

  mainWindow = new BrowserWindow({
    width: winBounds.width || defaults.width,
    height: winBounds.height || defaults.height,
    x: winBounds.x,
    y: winBounds.y,
    minWidth: defaults.minWidth,
    minHeight: defaults.minHeight,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: isCompanion,
    skipTaskbar: isPet,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Save bounds on move/resize
  const saveBounds = () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const current = loadSettings();
    const wb = current.windowBounds || {};
    wb[currentMode] = bounds;
    saveSettings({ windowBounds: wb });
  };
  mainWindow.on('moved', saveBounds);
  mainWindow.on('resized', saveBounds);

  // Decide URL: Vite dev server or static dist
  const devUrl = 'http://localhost:5173';
  const distPath = path.join(__dirname, '..', 'dist', 'index.html');

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL(devUrl);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updateTray() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🌙 Gravity-Pilot AI (Nila Companion)',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show / Hide Window (Ctrl+Shift+N)',
      click: () => {
        if (!mainWindow) {
          createMainWindow();
        } else if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Layout Mode',
      submenu: [
        {
          label: '🐾 Pet Mode (Desktop Pet)',
          type: 'radio',
          checked: currentMode === 'pet',
          click: () => setWindowMode('pet'),
        },
        {
          label: '🧚 Floating Companion Mode',
          type: 'radio',
          checked: currentMode === 'companion',
          click: () => setWindowMode('companion'),
        },
        {
          label: '🌓 Split Mode (Avatar + Chat)',
          type: 'radio',
          checked: currentMode === 'split',
          click: () => setWindowMode('split'),
        },
        {
          label: '📊 Full Dashboard Mode',
          type: 'radio',
          checked: currentMode === 'dashboard',
          click: () => setWindowMode('dashboard'),
        },
      ],
    },
    {
      label: 'Toggle Always on Top',
      type: 'checkbox',
      checked: mainWindow ? mainWindow.isAlwaysOnTop() : (currentMode === 'companion'),
      click: (item) => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(item.checked);
        }
      },
    },
    {
      label: 'Toggle Click-Through Mode (Ctrl+Shift+C)',
      type: 'checkbox',
      checked: isClickThrough,
      click: () => {
        toggleClickThrough();
      },
    },
    { type: 'separator' },
    {
      label: 'Quiet Mode (suppress proactive messages)',
      type: 'checkbox',
      checked: quietMode,
      click: (item) => {
        quietMode = item.checked;
        if (mainWindow) {
          mainWindow.webContents.send('companion:quietMode', quietMode);
        }
      },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: startWithWindows,
      click: (item) => {
        startWithWindows = item.checked;
        app.setLoginItemSettings({ openAtLogin: startWithWindows });
        saveSettings({ startWithWindows });
      },
    },
    { type: 'separator' },
    {
      label: 'Open Output Directory (Ctrl+Shift+O)',
      click: () => {
        const outDir = path.resolve(__dirname, '..', '..', 'backend', 'output');
        shell.openPath(outDir);
      },
    },
    {
      label: 'Open Web UI (localhost:5173)',
      click: () => {
        shell.openExternal('http://localhost:5173');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  let icon = nativeImage.createEmpty();
  try {
    const iconPath = path.join(__dirname, '..', 'public', 'favicon.ico');
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    }
  } catch {}

  tray = new Tray(icon);
  tray.setToolTip('Gravity-Pilot AI — Nila Companion');
  updateTray();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

function toggleClickThrough() {
  isClickThrough = !isClickThrough;
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
    mainWindow.webContents.send('companion:clickThrough', isClickThrough);
  }
  updateTray();
}

function setWindowMode(mode) {
  currentMode = mode;
  saveSettings({ mode });
  if (!mainWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  if (mode === 'pet') {
    const petW = 220;
    const petH = 320;
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setResizable(false);
    mainWindow.setSize(petW, petH);
    mainWindow.setSkipTaskbar(true);
    // Sit on taskbar line (bottom of work area)
    const workArea = primaryDisplay.workArea;
    const saved = loadSettings();
    const petX = saved.petX ?? Math.floor(workArea.x + workArea.width / 2 - petW / 2);
    mainWindow.setPosition(
      Math.max(workArea.x, Math.min(petX, workArea.x + workArea.width - petW)),
      workArea.y + workArea.height - petH
    );
    mainWindow.setHasShadow(false);
  } else if (mode === 'companion') {
    const compW = 420;
    const compH = 680;
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setResizable(true);
    mainWindow.setSize(compW, compH);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setPosition(screenWidth - compW - 24, screenHeight - compH - 24);
    mainWindow.setHasShadow(false);
  } else if (mode === 'split') {
    mainWindow.setSkipTaskbar(false);
    mainWindow.setAlwaysOnTop(false);
    const w = Math.min(1240, screenWidth - 40);
    const h = Math.min(840, screenHeight - 40);
    mainWindow.setSize(w, h);
    mainWindow.center();
    mainWindow.setHasShadow(true);
  } else if (mode === 'dashboard') {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(false);
    const w = Math.min(1480, screenWidth - 40);
    const h = Math.min(920, screenHeight - 40);
    mainWindow.setSize(w, h);
    mainWindow.center();
    mainWindow.setHasShadow(true);
  }

  mainWindow.webContents.send('layout:change', mode);
  updateTray();
}

// IPC Handlers
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('window:setAlwaysOnTop', (_event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(Boolean(flag));
    updateTray();
    return mainWindow.isAlwaysOnTop();
  }
  return false;
});

ipcMain.handle('window:getAlwaysOnTop', () => {
  return mainWindow ? mainWindow.isAlwaysOnTop() : false;
});

ipcMain.handle('window:setIgnoreMouseEvents', (_event, ignore, options) => {
  if (mainWindow) {
    isClickThrough = Boolean(ignore);
    mainWindow.setIgnoreMouseEvents(isClickThrough, options || { forward: true });
    updateTray();
  }
});

ipcMain.handle('window:toggleClickThrough', () => {
  toggleClickThrough();
  return isClickThrough;
});

ipcMain.handle('window:getClickThrough', () => {
  return isClickThrough;
});

ipcMain.handle('window:setMode', (_event, mode) => {
  setWindowMode(mode);
});

ipcMain.handle('window:startDrag', () => {
  // Manual drag start — handled by the renderer calling this on mousedown over the avatar
});

ipcMain.handle('window:dragMove', (_event, deltaX, deltaY) => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
  }
});

ipcMain.handle('window:getQuietMode', () => {
  return quietMode;
});

ipcMain.handle('pet:moveBy', (_event, dx) => {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const [x, y] = mainWindow.getPosition();
  const [w] = mainWindow.getSize();
  const newX = Math.max(workArea.x, Math.min(x + dx, workArea.x + workArea.width - w));
  mainWindow.setPosition(newX, y);
  saveSettings({ petX: newX });
});

ipcMain.handle('pet:getSystemIdleTime', () => {
  const { powerMonitor } = require('electron');
  return powerMonitor.getSystemIdleTime();
});

ipcMain.handle('window:setSize', (_event, width, height) => {
  if (!mainWindow) return;
  mainWindow.setSize(width, height);
});

ipcMain.handle('shell:openFile', async (_event, filePath) => {
  if (!filePath) return { success: false, error: 'No path provided' };

  const resolved = path.resolve(filePath);
  const outDir = path.resolve(__dirname, '..', '..', 'backend', 'output');

  const homeDir = app.getPath('home');
  if (!resolved.startsWith(outDir) && !resolved.startsWith(homeDir)) {
    return { success: false, error: 'Path outside authorized directory' };
  }

  try {
    const errorMsg = await shell.openPath(resolved);
    return { success: !errorMsg, error: errorMsg };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('shell:openOutputFolder', async () => {
  const outDir = path.resolve(__dirname, '..', '..', 'backend', 'output');
  await shell.openPath(outDir);
  return { success: true, folder: outDir };
});

app.whenReady().then(async () => {
  // Apply saved login item setting
  app.setLoginItemSettings({ openAtLogin: startWithWindows });

  // Start backend if packaged
  await startBackendIfPackaged();

  createMainWindow();
  createTray();

  // Register global shortcuts
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    const outDir = path.resolve(__dirname, '..', '..', 'backend', 'output');
    shell.openPath(outDir);
  });

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    toggleClickThrough();
  });

  // Push-to-talk: Ctrl+Shift+Space
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.webContents.send('voice:pushToTalk');
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopBackend();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
