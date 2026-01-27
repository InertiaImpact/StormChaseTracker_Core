const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CONFIG_FILE = 'rwmapv2-config.json';
const RECEIVER_CONFIG_FILE = 'rwmapv2-receiver-config.json';
const SECRETS_FILE = 'secrets.json';

const DEFAULT_CONFIG = {
  updateIntervalSeconds: 5,
  webHost: '0.0.0.0',
  webPort: 8787,

  // ========== DATA SOURCE CONFIG ==========
  dataSource: {
    localDataUrl: 'http://localhost/data',
    localFailoverSeconds: 30,
    localRecheckSeconds: 60,
    intellishift: {
      enabled: false,
      baseUrl: 'https://connect.intellishift.com',
      authUrl: 'https://auth.intellishift.com/oauth/token',
      username: '',
      password: '',
      vehicleId: '',
      staleSeconds: 300
    }
  },

  // ========== CRADLEPOINT NETCLOUD API CONFIG ==========
  cradlepoint: {
    cloudEnabled: true,
    cloudUrl: 'https://www.cradlepointecm.com/api/v2/locations/',
    cloudStaleSeconds: 300,
    cloudApiId: '',
    cloudApiKey: '',
    cloudEcmApiId: '',
    cloudEcmApiKey: '',
    cloudReferer: '',
    cloudUserAgent: ''
  },

  // ========== GEOCODE CONFIG ==========
  geocode: {
    geocodeUrl: 'https://geocode.maps.co/reverse',
    geocodeApiKey: ''
  },

  // ========== TESTING OVERRIDES ==========
  testing: {
    forceSource: 'off'
  }
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
const intellishiftState = {
  token: null,
  tokenExpiresAt: 0,
  lastError: null,
  lastAuthAt: null,
  accountUsername: null
};

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function secretsPath() {
  return path.join(__dirname, SECRETS_FILE);
}

function receiverConfigPath() {
  return path.join(app.getPath('userData'), RECEIVER_CONFIG_FILE);
}

function normalizeLegacyConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const next = { ...parsed };

  next.dataSource = {
    ...(parsed.dataSource || {}),
    localDataUrl: parsed.localDataUrl ?? parsed.dataSource?.localDataUrl,
    localFailoverSeconds: parsed.localFailoverSeconds ?? parsed.dataSource?.localFailoverSeconds,
    localRecheckSeconds: parsed.localRecheckSeconds ?? parsed.dataSource?.localRecheckSeconds
  };

  next.cradlepoint = {
    ...(parsed.cradlepoint || {}),
    cloudEnabled: parsed.cradlepoint?.cloudEnabled ?? parsed.cloudEnabled,
    cloudUrl: parsed.cradlepoint?.cloudUrl ?? parsed.cloudUrl,
    cloudStaleSeconds: parsed.cradlepoint?.cloudStaleSeconds ?? parsed.cloudStaleSeconds,
    cloudApiId: parsed.cradlepoint?.cloudApiId ?? parsed.cloudApiId,
    cloudApiKey: parsed.cradlepoint?.cloudApiKey ?? parsed.cloudApiKey,
    cloudEcmApiId: parsed.cradlepoint?.cloudEcmApiId ?? parsed.cloudEcmApiId,
    cloudEcmApiKey: parsed.cradlepoint?.cloudEcmApiKey ?? parsed.cloudEcmApiKey,
    cloudReferer: parsed.cradlepoint?.cloudReferer ?? parsed.cloudReferer,
    cloudUserAgent: parsed.cradlepoint?.cloudUserAgent ?? parsed.cloudUserAgent
  };

  next.geocode = {
    ...(parsed.geocode || {}),
    geocodeUrl: parsed.geocodeUrl ?? parsed.geocode?.geocodeUrl,
    geocodeApiKey: parsed.geocodeApiKey ?? parsed.geocode?.geocodeApiKey
  };

  next.testing = {
    ...(parsed.testing || {}),
    forceSource: parsed.testing?.forceSource ?? parsed.forceSource ?? 'off'
  };

  return next;
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = normalizeLegacyConfig(JSON.parse(raw));
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
    sendIntellishiftTokenStatus();
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

function getIntellishiftCfg(currentCfg) {
  return currentCfg?.dataSource?.intellishift || {};
}

function isIntellishiftTokenValid() {
  return !!intellishiftState.token && Date.now() < intellishiftState.tokenExpiresAt;
}

function setIntellishiftToken(token, expiresInSeconds) {
  const ttlSeconds = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 1800;
  intellishiftState.token = token;
  intellishiftState.tokenExpiresAt = Date.now() + ttlSeconds * 1000;
  intellishiftState.lastAuthAt = Date.now();
  intellishiftState.lastError = null;
}

function clearIntellishiftToken(errMsg) {
  intellishiftState.token = null;
  intellishiftState.tokenExpiresAt = 0;
  intellishiftState.lastError = errMsg || null;
  intellishiftState.accountUsername = null;
}

function sendIntellishiftTokenStatus() {
  if (!mainWindow || !mainWindow.webContents) return;
  const valid = isIntellishiftTokenValid();
  const remainingMs = Math.max(0, intellishiftState.tokenExpiresAt - Date.now());
  mainWindow.webContents.send('intellishift-token-status', {
    valid,
    expiresInSeconds: valid ? Math.floor(remainingMs / 1000) : 0,
    lastError: intellishiftState.lastError,
    accountUsername: intellishiftState.accountUsername || null
  });
}

async function tryReauthorizeIntellishift(currentCfg) {
  if (isIntellishiftTokenValid()) return true;
  const cfg = getIntellishiftCfg(currentCfg);
  if (!cfg.username || !cfg.password) return false;
  try {
    await intellishiftAuthorize(currentCfg, cfg.username, cfg.password);
    return true;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    intellishiftState.lastError = msg;
    return false;
  }
}

function extractIntellishiftToken(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.access_token || payload.token || payload.bearerToken || payload.jwt || null;
}

function extractIntellishiftUsername(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.username || payload.userName || payload.user || payload.email || null;
}

async function intellishiftAuthRequest(authUrl, creds) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(authUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: creds.username,
        password: creds.password
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(id);
  }
}

async function intellishiftAuthorize(currentCfg, username, password) {
  const cfg = getIntellishiftCfg(currentCfg);
  const authUrl = cfg.authUrl || '';
  if (!authUrl) throw new Error('Intellishift authUrl is not configured');

  const creds = {
    username: username || cfg.username || '',
    password: password || cfg.password || ''
  };
  if (!creds.username || !creds.password) throw new Error('Intellishift username/password missing');

  const payload = await intellishiftAuthRequest(authUrl, creds);

  const token = extractIntellishiftToken(payload);
  if (!token) throw new Error('Intellishift token not found in response');
  const expiresIn = payload.expires_in || payload.expiresIn || payload.expires || null;
  intellishiftState.accountUsername = extractIntellishiftUsername(payload) || creds.username || null;
  setIntellishiftToken(token, Number(expiresIn));
  sendIntellishiftTokenStatus();
  return true;
}

async function intellishiftFetch(currentCfg, path, options = {}, timeoutMs = 12000) {
  if (!isIntellishiftTokenValid()) {
    await intellishiftAuthorize(currentCfg);
  }
  if (!isIntellishiftTokenValid()) {
    throw new Error('Intellishift token invalid');
  }
  const cfg = getIntellishiftCfg(currentCfg);
  const baseUrl = cfg.baseUrl || 'https://connect.intellishift.com';
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${intellishiftState.token}`
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(id);
  }
}

async function fetchIntellishiftVehicles(currentCfg) {
  const data = await intellishiftFetch(currentCfg, '/api/assets/dictionary');
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => ({ id: item?.id, name: item?.name }))
    .filter((item) => Number.isFinite(item.id) && item.name);
}

async function fetchIntellishiftLocation(currentCfg, options = {}) {
  const cfg = getIntellishiftCfg(currentCfg);
  if (!cfg.enabled && !options.force) return null;
  const vehicleId = Number(cfg.vehicleId);
  if (!Number.isFinite(vehicleId)) return null;

  const data = await intellishiftFetch(currentCfg, '/api/assets/current-locations');
  if (!Array.isArray(data)) return null;
  const entry = data.find((item) => Number(item.vehicleId) === vehicleId);
  if (!entry) return null;
  if (typeof entry.latitude !== 'number' || typeof entry.longitude !== 'number') return null;

  const updatedAtUnix = entry.lastUpdate ? Date.parse(entry.lastUpdate) / 1000 : null;
  const payload = {
    latitude: entry.latitude,
    longitude: entry.longitude,
    updatedAtUnix,
    headingDeg: typeof entry.headingDegrees === 'number' ? entry.headingDegrees : null,
    speedMph: typeof entry.speed === 'number' ? entry.speed : null,
    streetName: entry.street ?? null,
    townName: entry.city ?? null,
    countyName: entry.state ?? null,
    source: 'IntellishiftConnectAPI'
  };

  if (!payload.streetName || !payload.townName || !payload.countyName) {
    const geo = await reverseGeocode(currentCfg, payload.latitude, payload.longitude);
    payload.streetName = payload.streetName ?? geo.streetName;
    payload.townName = payload.townName ?? geo.townName;
    payload.countyName = payload.countyName ?? geo.countyName;
  }

  return payload;
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
    source: 'EdgeReceiver'
  };
}

// ========== CRADLEPOINT NETCLOUD API CONFIG ==========
function buildCloudHeaders(currentCfg) {
  return {
    'X-CP-API-ID': currentCfg.cradlepoint.cloudApiId,
    'X-CP-API-KEY': currentCfg.cradlepoint.cloudApiKey,
    'X-ECM-API-ID': currentCfg.cradlepoint.cloudEcmApiId,
    'X-ECM-API-KEY': currentCfg.cradlepoint.cloudEcmApiKey,
    'Referer': currentCfg.cradlepoint.cloudReferer,
    'User-Agent': currentCfg.cradlepoint.cloudUserAgent
  };
}

// ========== GEOCODE CONFIG ==========
async function reverseGeocode(currentCfg, latitude, longitude) {
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  if (reverseCache.has(cacheKey)) return reverseCache.get(cacheKey);

  const url = `${currentCfg.geocode.geocodeUrl}?lat=${latitude}&lon=${longitude}&api_key=${encodeURIComponent(currentCfg.geocode.geocodeApiKey)}`;
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

// ========== DATA SOURCE CONFIG ==========
async function fetchLocalData(currentCfg) {
  const data = await fetchJson(currentCfg.dataSource.localDataUrl, {}, 4000);
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
  if (!currentCfg.cradlepoint.cloudEnabled) return null;
  const data = await fetchJson(currentCfg.cradlepoint.cloudUrl, {
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
    source: 'NetCloud'
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

  if (intellishiftState.token && !isIntellishiftTokenValid()) {
    clearIntellishiftToken('Intellishift token expired');
    sendIntellishiftTokenStatus();
  }

  const forceSource = cfg.testing?.forceSource || 'off';
  if (forceSource === 'offline') {
    state.useLocal = false;
    state.lastError = 'Testing override: Offline/None';
    state.lastData = null;
    state.lastSource = 'Forced Offline';
    state.isLive = false;
    sendStatus();
    return;
  }

  const forcedFetch = async () => {
    if (forceSource === 'local') return await fetchLocalData(cfg);
    if (forceSource === 'cloud') return await fetchCloudData(cfg);
    if (forceSource === 'intellishift') return await fetchIntellishiftLocation(cfg, { force: true });
    return null;
  };

  if (forceSource !== 'off') {
    try {
      const forcedData = await forcedFetch();
      if (forcedData) {
        const staleSeconds = forceSource === 'cloud'
          ? cfg.cradlepoint.cloudStaleSeconds
          : forceSource === 'intellishift'
            ? (cfg.dataSource?.intellishift?.staleSeconds ?? 300)
            : cfg.dataSource.localFailoverSeconds;
        const isFresh = isRecent(forcedData, staleSeconds);
        state.useLocal = forceSource === 'local';
        state.lastData = forcedData;
        state.lastSource = `Forced ${forceSource}`;
        state.isLive = isFresh;
        sendStatus();
        return;
      }
      state.useLocal = false;
      state.lastData = null;
      state.lastSource = `Forced ${forceSource}`;
      state.isLive = false;
      state.lastError = `No data from forced source: ${forceSource}`;
      sendStatus();
      return;
    } catch (err) {
      state.lastError = err && err.message ? err.message : String(err);
      state.useLocal = false;
      state.lastData = null;
      state.lastSource = `Forced ${forceSource}`;
      state.isLive = false;
      sendStatus();
      return;
    }
  }

  try {
    localData = await fetchLocalData(cfg);
  } catch (err) {
    localError = err && err.message ? err.message : String(err);
  }

  const localIsRecent = localData && isRecent(localData, cfg.dataSource.localFailoverSeconds);

  let selected = null;
  let selectedSource = null;

  if (localIsRecent) {
    state.useLocal = true;
    state.lastLocalSeenAt = now;
    state.lastLocalCheckAt = now;
    selected = localData;
    selectedSource = 'EdgeReceiver';
    selectedLive = true;
  } else {
    if (state.useLocal) {
      if (!state.lastLocalSeenAt || now - state.lastLocalSeenAt > cfg.dataSource.localFailoverSeconds * 1000) {
        state.useLocal = false;
      }
      state.lastLocalCheckAt = now;
    }

    if (!state.useLocal) {
      if (!state.lastLocalCheckAt || now - state.lastLocalCheckAt >= cfg.dataSource.localRecheckSeconds * 1000) {
        state.lastLocalCheckAt = now;
        if (localIsRecent) {
          state.useLocal = true;
          state.lastLocalSeenAt = now;
          selected = localData;
          selectedSource = 'EdgeReceiver';
          selectedLive = true;
        }
      }

      if (!state.useLocal && !selected) {
        try {
          const cloudData = await fetchCloudData(cfg);
          if (cloudData) {
            const cloudIsRecent = isRecent(cloudData, cfg.cradlepoint.cloudStaleSeconds);
            selected = cloudData;
            selectedSource = cloudIsRecent ? 'NetCloud' : 'NetCloud (Stale)';
            selectedLive = cloudIsRecent;
          }
        } catch (err) {
          state.lastError = err && err.message ? err.message : String(err);
        }
      }

      if (!state.useLocal && !selected) {
        try {
          const intellishiftData = await fetchIntellishiftLocation(cfg);
          if (intellishiftData) {
            const staleSeconds = cfg.dataSource?.intellishift?.staleSeconds ?? 300;
            const isFresh = isRecent(intellishiftData, staleSeconds);
            selected = intellishiftData;
            selectedSource = isFresh ? 'Intellishift' : 'Intellishift (Stale)';
            selectedLive = isFresh;
          }
        } catch (err) {
          state.lastError = err && err.message ? err.message : String(err);
          if (String(err).includes('HTTP 401') || String(err).includes('token')) {
            clearIntellishiftToken('Intellishift authorization required');
            sendIntellishiftTokenStatus();
          }
        }
      }
    }
  }

  if (!selected && localData) {
    selected = localData;
    selectedSource = 'EdgeReceiver (Stale)';
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

  ipcMain.handle('intellishift-token-status', async () => {
    await tryReauthorizeIntellishift(cfg);
    return {
      valid: isIntellishiftTokenValid(),
      expiresInSeconds: isIntellishiftTokenValid()
        ? Math.floor((intellishiftState.tokenExpiresAt - Date.now()) / 1000)
        : 0,
      lastError: intellishiftState.lastError,
      accountUsername: intellishiftState.accountUsername || null
    };
  });

  ipcMain.handle('intellishift-auth', async (_e, creds) => {
    try {
      await intellishiftAuthorize(cfg, creds?.username, creds?.password);
      return { ok: true };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      clearIntellishiftToken(msg);
      sendIntellishiftTokenStatus();
      return { ok: false, message: msg };
    }
  });

  ipcMain.handle('intellishift-vehicles', async () => {
    try {
      const vehicles = await fetchIntellishiftVehicles(cfg);
      return { ok: true, vehicles };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (String(err).includes('HTTP 401') || String(err).includes('token')) {
        clearIntellishiftToken('Intellishift authorization required');
        sendIntellishiftTokenStatus();
      }
      return { ok: false, message: msg, vehicles: [] };
    }
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
