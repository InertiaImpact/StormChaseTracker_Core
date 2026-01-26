const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CONFIG_FILE = 'rwmapv2-config.json';
const RECEIVER_CONFIG_FILE = 'rwmapv2-receiver-config.json';
const SECRETS_FILE = 'secrets.json';

const DEFAULT_CONFIG = {
  localDataUrl: 'http://localhost/data',
  localFailoverSeconds: 30,
  localRecheckSeconds: 60,
  updateIntervalSeconds: 5,
  cloudStaleSeconds: 300,
  webHost: '0.0.0.0',
  webPort: 8787,
  cloudEnabled: true,
  cloudUrl: 'https://www.cradlepointecm.com/api/v2/locations/',
  cloudApiId: '',
  cloudApiKey: '',
  cloudEcmApiId: '',
  cloudEcmApiKey: '',
  cloudReferer: '',
  cloudUserAgent: '',
  geocodeUrl: 'https://geocode.maps.co/reverse',
  geocodeApiKey: ''
};

const DEFAULT_RECEIVER_CONFIG = {
  listenHost: '0.0.0.0',
  listenPort: 80,
  ingestPath: '/ingest'
};

const state = {
  useLocal: true,
  lastLocalSeenAt: null,
  lastLocalCheckAt: null,
  lastData: null,
  lastError: null,
  lastSource: null,
  isLive: false
};

let mainWindow = null;
let receiverWindow = null;
let tray = null;
let pollTimer = null;
let cfg = null;
let webServer = null;
let showConfig = false;

let receiverCfg = null;
let receiverServer = null;
let receiverStatusTimer = null;

const receiverState = {
  listening: false,
  lastUpdateAt: null,
  firstUpdateAt: null,
  lastPayload: null,
  lastSenderIp: null,
  serverError: null
};

const reverseCache = new Map();

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function secretsPath() {
  return path.join(__dirname, SECRETS_FILE);
}

function receiverConfigPath() {
  return path.join(app.getPath('userData'), RECEIVER_CONFIG_FILE);
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...loadSecrets(), ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG, ...loadSecrets() };
  }
}

function loadSecrets() {
  try {
    const raw = fs.readFileSync(secretsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function loadReceiverConfig() {
  try {
    const raw = fs.readFileSync(receiverConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RECEIVER_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_RECEIVER_CONFIG };
  }
}

function saveConfig(newCfg) {
  fs.writeFileSync(configPath(), JSON.stringify(newCfg, null, 2));
}

function saveReceiverConfig(newCfg) {
  fs.writeFileSync(receiverConfigPath(), JSON.stringify(newCfg, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('toggle-config', showConfig);
  });
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createReceiverWindow() {
  receiverWindow = new BrowserWindow({
    width: 700,
    height: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'receiver', 'preload.js'),
      contextIsolation: true
    }
  });
  receiverWindow.loadFile(path.join(__dirname, 'receiver', 'index.html'));
  receiverWindow.once('ready-to-show', () => receiverWindow.show());
  receiverWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      receiverWindow.hide();
    }
  });
}

function setupMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Receiver',
          click: () => {
            if (!receiverWindow) createReceiverWindow();
            receiverWindow.show();
          }
        },
        {
          label: 'Toggle Settings',
          click: () => {
            showConfig = !showConfig;
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('toggle-config', showConfig);
            }
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupTray() {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAI0lEQVQoz2NgwAb+///f+P///4YGBgYGBgYGABoMA3S5myDRAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromDataURL(dataUrl);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('RoadWarrior Map V2');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function normalizeLocalPayload(payload, lastUpdateUnix) {
  if (!payload || typeof payload !== 'object') return null;
  const latitude = payload.lat ?? payload.latitude;
  const longitude = payload.lon ?? payload.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const updatedUnix = payload.ts_unix ?? lastUpdateUnix ?? null;
  const headingDeg = payload.heading_deg ?? payload.headingDeg ?? payload.heading ?? null;
  const speedMph = payload.speed_mph ?? payload.speedMph ?? null;

  return {
    latitude,
    longitude,
    updatedAtUnix: updatedUnix,
    headingDeg,
    speedMph,
    streetName: payload.street_name ?? null,
    townName: payload.town_name ?? null,
    countyName: payload.county_name ?? null,
    source: 'LocalReceiver'
  };
}

function buildCloudHeaders(currentCfg) {
  return {
    'X-CP-API-ID': currentCfg.cloudApiId,
    'X-CP-API-KEY': currentCfg.cloudApiKey,
    'X-ECM-API-ID': currentCfg.cloudEcmApiId,
    'X-ECM-API-KEY': currentCfg.cloudEcmApiKey,
    'Referer': currentCfg.cloudReferer,
    'User-Agent': currentCfg.cloudUserAgent
  };
}

async function reverseGeocode(currentCfg, latitude, longitude) {
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  if (reverseCache.has(cacheKey)) return reverseCache.get(cacheKey);

  const url = `${currentCfg.geocodeUrl}?lat=${latitude}&lon=${longitude}&api_key=${encodeURIComponent(currentCfg.geocodeApiKey)}`;
  try {
    const data = await fetchJson(url, {}, 12000);
    const address = data.address || {};
    const result = {
      streetName: address.road ?? null,
      townName: address.town ?? address.city ?? null,
      countyName: address.county ?? null
    };
    reverseCache.set(cacheKey, result);
    return result;
  } catch {
    const result = { streetName: 'Unspecified Area', townName: null, countyName: null };
    reverseCache.set(cacheKey, result);
    return result;
  }
}

async function fetchLocalData(currentCfg) {
  const data = await fetchJson(currentCfg.localDataUrl, {}, 4000);
  const payload = normalizeLocalPayload(data.payload, data.last_update_unix);
  if (!payload) return null;
  if (!payload.streetName || !payload.townName || !payload.countyName) {
    const geo = await reverseGeocode(currentCfg, payload.latitude, payload.longitude);
    payload.streetName = payload.streetName ?? geo.streetName;
    payload.townName = payload.townName ?? geo.townName;
    payload.countyName = payload.countyName ?? geo.countyName;
  }
  return payload;
}

async function fetchCloudData(currentCfg) {
  if (!currentCfg.cloudEnabled) return null;
  const data = await fetchJson(currentCfg.cloudUrl, {
    headers: buildCloudHeaders(currentCfg)
  }, 12000);

  if (!data || !Array.isArray(data.data) || !data.data.length) return null;
  const entry = data.data[0];
  const latitude = entry.latitude;
  const longitude = entry.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const geo = await reverseGeocode(currentCfg, latitude, longitude);

  return {
    latitude,
    longitude,
    updatedAtUnix: entry.updated_at ? Date.parse(entry.updated_at) / 1000 : null,
    headingDeg: null,
    speedMph: null,
    streetName: geo.streetName,
    townName: geo.townName,
    countyName: geo.countyName,
    source: 'CloudAPI'
  };
}

function isRecent(data, maxAgeSeconds) {
  if (!data || !data.updatedAtUnix) return false;
  const ageMs = Date.now() - data.updatedAtUnix * 1000;
  return ageMs <= maxAgeSeconds * 1000;
}

function buildStatusPayload() {
  const now = Date.now();
  const data = state.lastData;
  const dataAgeSeconds = data?.updatedAtUnix ? Math.max(0, Math.floor((now - data.updatedAtUnix * 1000) / 1000)) : null;

  return {
    useLocal: state.useLocal,
    lastSource: state.lastSource,
    isLive: state.isLive,
    lastError: state.lastError,
    lastLocalSeenAt: state.lastLocalSeenAt,
    lastLocalCheckAt: state.lastLocalCheckAt,
    dataAgeSeconds,
    data
  };
}

function sendStatus() {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status', buildStatusPayload());
  }
}

function startWebServer() {
  if (webServer) {
    try { webServer.close(); } catch { /* ignore */ }
    webServer = null;
  }

  const webRoot = path.join(__dirname, 'web');
  const readStatic = (fileName, res, contentType) => {
    const filePath = path.join(webRoot, fileName);
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  };

  webServer = http.createServer((req, res) => {
    const base = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url || '/', base);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      readStatic('index.html', res, 'text/html; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      readStatic('app.js', res, 'application/javascript; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      readStatic('styles.css', res, 'text/css; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const payload = buildStatusPayload();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  webServer.listen(cfg.webPort, cfg.webHost);
}

function formatReceiverStatus(currentCfg) {
  const now = Date.now();
  const connected = receiverState.lastUpdateAt && now - receiverState.lastUpdateAt <= 5000;
  const durationMs = connected && receiverState.firstUpdateAt ? now - receiverState.firstUpdateAt : 0;
  return {
    listening: receiverState.listening,
    connected,
    listenHost: currentCfg.listenHost,
    listenPort: currentCfg.listenPort,
    ingestPath: currentCfg.ingestPath,
    lastUpdateAt: receiverState.lastUpdateAt,
    durationMs,
    lastSenderIp: receiverState.lastSenderIp,
    lastPayload: receiverState.lastPayload,
    serverError: receiverState.serverError
  };
}

function sendReceiverStatus() {
  if (receiverWindow && receiverWindow.webContents) {
    receiverWindow.webContents.send('receiver-status', formatReceiverStatus(receiverCfg));
  }
}

function stopReceiverServer() {
  if (receiverServer) {
    try { receiverServer.close(); } catch { /* ignore */ }
    receiverServer = null;
  }
  receiverState.listening = false;
  receiverState.firstUpdateAt = null;
}

function startReceiverServer(currentCfg) {
  stopReceiverServer();
  receiverState.serverError = null;

  receiverServer = http.createServer((req, res) => {
    const base = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url || '/', base);
    const reqPath = url.pathname;
    const ingestPath = currentCfg.ingestPath.startsWith('/') ? currentCfg.ingestPath : `/${currentCfg.ingestPath}`;
    const ingestAlt = ingestPath.endsWith('/') ? ingestPath.slice(0, -1) : `${ingestPath}/`;

    if (req.method === 'POST' && (reqPath === ingestPath || reqPath === ingestAlt)) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let payload = null;
        try { payload = JSON.parse(body); } catch { payload = { raw: body }; }
        receiverState.lastUpdateAt = Date.now();
        if (!receiverState.firstUpdateAt) receiverState.firstUpdateAt = receiverState.lastUpdateAt;
        receiverState.lastPayload = payload;
        receiverState.lastSenderIp = req.socket.remoteAddress;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
      return;
    }

    if (req.method === 'GET' && (reqPath === '/' || reqPath === '/data')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        last_update_unix: receiverState.lastUpdateAt ? receiverState.lastUpdateAt / 1000 : null,
        payload: receiverState.lastPayload
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  receiverServer.on('error', (err) => {
    if (err && err.code === 'EACCES') {
      receiverState.serverError = 'Bind failed (EACCES). Run as Administrator to use port 80.';
    } else if (err && err.code === 'EADDRINUSE') {
      receiverState.serverError = 'Bind failed (EADDRINUSE). Port already in use.';
    } else {
      receiverState.serverError = err && err.message ? err.message : String(err);
    }
    receiverState.listening = false;
  });

  receiverServer.listen(currentCfg.listenPort, currentCfg.listenHost, () => {
    receiverState.listening = true;
  });
}

async function pollOnce() {
  const now = Date.now();
  let localData = null;
  let localError = null;
  let selectedLive = false;

  try {
    localData = await fetchLocalData(cfg);
  } catch (err) {
    localError = err && err.message ? err.message : String(err);
  }

  const localIsRecent = localData && isRecent(localData, cfg.localFailoverSeconds);

  let selected = null;
  let selectedSource = null;

  if (localIsRecent) {
    state.useLocal = true;
    state.lastLocalSeenAt = now;
    state.lastLocalCheckAt = now;
    selected = localData;
    selectedSource = 'LocalReceiver';
    selectedLive = true;
  } else {
    if (state.useLocal) {
      if (!state.lastLocalSeenAt || now - state.lastLocalSeenAt > cfg.localFailoverSeconds * 1000) {
        state.useLocal = false;
      }
      state.lastLocalCheckAt = now;
    }

    if (!state.useLocal) {
      if (!state.lastLocalCheckAt || now - state.lastLocalCheckAt >= cfg.localRecheckSeconds * 1000) {
        state.lastLocalCheckAt = now;
        if (localIsRecent) {
          state.useLocal = true;
          state.lastLocalSeenAt = now;
          selected = localData;
          selectedSource = 'LocalReceiver';
          selectedLive = true;
        }
      }

      if (!state.useLocal && !selected) {
        try {
          const cloudData = await fetchCloudData(cfg);
          if (cloudData) {
            const cloudIsRecent = isRecent(cloudData, cfg.cloudStaleSeconds);
            selected = cloudData;
            selectedSource = cloudIsRecent ? 'CloudAPI' : 'CloudAPI (Stale)';
            selectedLive = cloudIsRecent;
          }
        } catch (err) {
          state.lastError = err && err.message ? err.message : String(err);
        }
      }
    }
  }

  if (!selected && localData) {
    selected = localData;
    selectedSource = 'LocalReceiver (Stale)';
    selectedLive = false;
  }

  state.lastError = localError || state.lastError;
  if (selected) {
    state.lastData = selected;
    state.lastSource = selectedSource;
    state.isLive = selectedLive;
  } else {
    state.isLive = false;
  }

  sendStatus();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollOnce();
  pollTimer = setInterval(pollOnce, Math.max(2, cfg.updateIntervalSeconds) * 1000);
}

app.whenReady().then(() => {
  cfg = loadConfig();
  receiverCfg = loadReceiverConfig();
  createWindow();
  setupTray();
  setupMenu();
  startPolling();
  startWebServer();
  startReceiverServer(receiverCfg);
  receiverStatusTimer = setInterval(sendReceiverStatus, 500);

  ipcMain.handle('get-config', () => cfg);
  ipcMain.handle('set-config', (_e, newCfg) => {
    cfg = { ...cfg, ...newCfg };
    saveConfig(cfg);
    startPolling();
    startWebServer();
    return cfg;
  });

  ipcMain.handle('receiver-get-config', () => receiverCfg);
  ipcMain.handle('receiver-set-config', (_e, newCfg) => {
    receiverCfg = { ...receiverCfg, ...newCfg };
    saveReceiverConfig(receiverCfg);
    startReceiverServer(receiverCfg);
    return receiverCfg;
  });

  ipcMain.handle('toggle-fullscreen', (_e, enable) => {
    if (!mainWindow) return false;
    const next = typeof enable === 'boolean' ? enable : !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return mainWindow.isFullScreen();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (pollTimer) clearInterval(pollTimer);
  if (receiverStatusTimer) clearInterval(receiverStatusTimer);
  if (webServer) {
    try { webServer.close(); } catch { /* ignore */ }
  }
  stopReceiverServer();
});
