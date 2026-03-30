const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

const PORT = 3001;
let serverProcess = null;
let mainWindow = null;

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
  const filesToCopy = ['index.html', 'style.css', 'app.js', 'server.py'];

  for (const file of filesToCopy) {
    const src = getResourcePath(file);
    const dest = path.join(dataDir, file);
    // Always overwrite app files (they may have been updated)
    // But never overwrite data.json
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
}

function startServer() {
  const dataDir = getDataDir();
  const serverPath = path.join(dataDir, 'server.py');

  serverProcess = spawn('python', [serverPath], {
    cwd: dataDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 900,
    minWidth: 500,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: 'Strava Challenge Tracker',
  });

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

  startServer();

  try {
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error(err.message);
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
