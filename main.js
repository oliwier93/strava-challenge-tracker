const { app, BrowserWindow, dialog } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

const PORT = 3001;
let serverProcess = null;
let mainWindow = null;

function findPythonRuntime() {
  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] },
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, '--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    if (probe.status === 0) {
      return candidate;
    }
  }

  return null;
}

function getResourcePath(filename) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, filename);
}

function getDataDir() {
  if (app.isPackaged) {
    return app.getPath('userData');
  }
  return __dirname;
}

function copyAppFiles() {
  const dataDir = getDataDir();

  // Always overwrite app code files (they may have been updated)
  const codeFiles = ['index.html', 'style.css', 'app.js', 'server.py'];
  for (const file of codeFiles) {
    const src = getResourcePath(file);
    const dest = path.join(dataDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  console.log(`[app] Data directory: ${dataDir}`);
  console.log(`[app] Files in data dir:`, fs.readdirSync(dataDir).filter(f => f.endsWith('.json') || f.endsWith('.py') || f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.css')));
}

function startServer() {
  const dataDir = getDataDir();
  const serverPath = path.join(dataDir, 'server.py');
  const pythonRuntime = findPythonRuntime();

  if (!pythonRuntime) {
    dialog.showErrorBox(
      'Brak Python 3',
      'Aplikacja potrzebuje Python 3, aby uruchomić lokalny backend. Zainstaluj Python 3 lub uruchom aplikację na komputerze, który już go ma.'
    );
    return false;
  }

  serverProcess = spawn(pythonRuntime.command, [...pythonRuntime.args, serverPath], {
    cwd: dataDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  console.log(`[app] Python runtime: ${pythonRuntime.command} ${pythonRuntime.args.join(' ')}`.trim());

  serverProcess.stdout.on('data', (data) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start Python server:', err.message);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    serverProcess = null;
  });

  return true;
}

function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function tryConnect() {
      const socket = new net.Socket();
      socket.setTimeout(500);

      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.on('error', () => {
        socket.destroy();
        attempts++;
        if (attempts >= retries) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(tryConnect, 200);
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        attempts++;
        if (attempts >= retries) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(tryConnect, 200);
        }
      });

      socket.connect(PORT, '127.0.0.1');
    }

    tryConnect();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 900,
    minWidth: 500,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    icon: getResourcePath('icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: 'Strava Challenge Tracker',
  });

  if (app.isPackaged) {
    const ses = mainWindow.webContents.session;
    try {
      await ses.clearCache();
      await ses.clearStorageData({
        storages: ['serviceworkers', 'cachestorage'],
      });
      console.log('[app] Cleared packaged app cache');
    } catch (err) {
      console.warn('[app] Failed to clear cache:', err.message);
    }
  }

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    copyAppFiles();
  }

  if (!startServer()) {
    app.quit();
    return;
  }

  try {
    await waitForServer();
    await createWindow();
  } catch (err) {
    console.error(err.message);
    dialog.showErrorBox(
      'Nie udało się uruchomić aplikacji',
      'Lokalny serwer nie wystartował poprawnie. Sprawdź, czy Python 3 działa na tym komputerze.'
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', () => {
  stopServer();
});
