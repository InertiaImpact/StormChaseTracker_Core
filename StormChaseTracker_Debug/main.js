const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const net = require('net');

const CONFIG_FILE = 'debug-config.json';

const DEFAULT_CONFIG = {
  nmeaEnabled: true,
  nmeaProtocol: 'udp',
  nmeaHost: '',
  nmeaPort: 55001,
  dummyBaseLat: 42.0277,
  dummyBaseLon: -91.6408
};

const state = {
  nmea: {
    fixValid: false,
    utcTime: null,
    date: null,
    lat: null,
    lon: null,
    speedKn: null,
    speedMph: null,
    courseT: null,
    sats: null,
    hdop: null,
    altM: null
  },
  nmeaConnected: false,
  lastNmeaAt: null,
  lastNmeaSource: null,
  nmeaBindAddress: null,
  nmeaBindError: null,
  nmeaPackets: 0,
  lastNmeaBytes: 0,
  lastNmeaLine: null,
  listening: false,
  dummyTimer: null,
  dummyIndex: 0
};

let mainWindow = null;
let statusTimer = null;
let udpSocket = null;
let tcpSocket = null;
let tcpReconnectTimer = null;
let nmeaRetryTimer = null;
let tcpBuffer = '';

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function convertNmeaCoordToDecimal(coord, hem) {
  if (!coord || !hem) return null;
  const dot = coord.indexOf('.');
  if (dot < 0) return null;
  const degDigits = dot > 4 ? 3 : 2;
  const deg = parseFloat(coord.slice(0, degDigits));
  const min = parseFloat(coord.slice(degDigits));
  if (Number.isNaN(deg) || Number.isNaN(min)) return null;
  let dec = deg + (min / 60.0);
  if (hem === 'S' || hem === 'W') dec = -dec;
  return dec;
}

function tryParseFloat(s) {
  if (s === undefined || s === null || s === '') return null;
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
}

function parseRmc(line) {
  const f = line.split('*')[0].split(',');
  if (f.length < 10) return;
  state.nmea.utcTime = f[1] || null;
  state.nmea.fixValid = (f[2] === 'A');
  const lat = convertNmeaCoordToDecimal(f[3], f[4]);
  const lon = convertNmeaCoordToDecimal(f[5], f[6]);
  if (lat !== null) state.nmea.lat = lat;
  if (lon !== null) state.nmea.lon = lon;
  const sog = tryParseFloat(f[7]);
  if (sog !== null) {
    state.nmea.speedKn = sog;
    state.nmea.speedMph = sog * 1.150779;
  }
  const cog = tryParseFloat(f[8]);
  if (cog !== null) state.nmea.courseT = cog;
  state.nmea.date = f[9] || null;
}

function parseGga(line) {
  const f = line.split('*')[0].split(',');
  if (f.length < 10) return;
  const numsats = tryParseFloat(f[7]);
  if (numsats !== null) state.nmea.sats = Math.trunc(numsats);
  const hdop = tryParseFloat(f[8]);
  if (hdop !== null) state.nmea.hdop = hdop;
  const alt = tryParseFloat(f[9]);
  if (alt !== null) state.nmea.altM = alt;
}

function parseGns(line) {
  const f = line.split('*')[0].split(',');
  if (f.length < 10) return;
  const numsats = tryParseFloat(f[7]);
  if (numsats !== null) state.nmea.sats = Math.trunc(numsats);
  const hdop = tryParseFloat(f[8]);
  if (hdop !== null) state.nmea.hdop = hdop;
  const alt = tryParseFloat(f[9]);
  if (alt !== null) state.nmea.altM = alt;
}

function parseVtg(line) {
  const f = line.split('*')[0].split(',');
  if (f.length < 9) return;
  const cog = tryParseFloat(f[1]);
  if (cog !== null) state.nmea.courseT = cog;
  const sog = tryParseFloat(f[5]);
  if (sog !== null) {
    state.nmea.speedKn = sog;
    state.nmea.speedMph = sog * 1.150779;
  }
}

function handleNmeaLine(line) {
  if (!line || line.length < 6) return;
  if (/^\$(GP|GN)RMC,/.test(line)) parseRmc(line);
  else if (/^\$(GP|GN)GGA,/.test(line)) parseGga(line);
  else if (/^\$(GP|GN)GNS,/.test(line)) parseGns(line);
  else if (/^\$(GP|GN)VTG,/.test(line)) parseVtg(line);
}

function sampleRoute(baseLat, baseLon) {
  return [
    { lat: baseLat, lon: baseLon },
    { lat: baseLat + 0.0002, lon: baseLon + 0.0003 },
    { lat: baseLat + 0.0007, lon: baseLon + 0.0008 },
    { lat: baseLat + 0.0011, lon: baseLon + 0.0001 },
    { lat: baseLat + 0.0013, lon: baseLon - 0.0007 },
    { lat: baseLat + 0.0005, lon: baseLon - 0.0011 },
    { lat: baseLat, lon: baseLon }
  ];
}

function startDummyNmea(cfg, isStatic) {
  stopNmea();
  const route = sampleRoute(cfg.dummyBaseLat, cfg.dummyBaseLon);
  state.listening = true;
  state.nmeaConnected = true;
  state.nmeaBindAddress = isStatic ? 'dummy-static' : 'dummy-route';
  state.nmeaBindError = null;

  state.dummyTimer = setInterval(() => {
    const now = Date.now();
    const idx = isStatic ? 0 : (state.dummyIndex % route.length);
    const nextIdx = (idx + 1) % route.length;
    const pt = route[idx];
    const nx = route[nextIdx];
    const heading = Math.atan2(nx.lon - pt.lon, nx.lat - pt.lat) * (180 / Math.PI);
    const normalizedHeading = (heading + 360) % 360;

    state.nmea.fixValid = true;
    state.nmea.utcTime = new Date(now).toISOString().slice(11, 19).replace(/:/g, '');
    state.nmea.date = new Date(now).toISOString().slice(2, 10).replace(/-/g, '');
    state.nmea.lat = pt.lat;
    state.nmea.lon = pt.lon;
    state.nmea.speedKn = isStatic ? 0 : 24;
    state.nmea.speedMph = isStatic ? 0 : 27.6;
    state.nmea.courseT = isStatic ? 0 : normalizedHeading;
    state.nmea.sats = 12;
    state.nmea.hdop = 0.8;
    state.nmea.altM = 250.0;

    state.lastNmeaAt = now;
    state.lastNmeaSource = 'dummy';
    state.nmeaPackets += 1;
    state.lastNmeaBytes = 72;
    state.lastNmeaLine = isStatic
      ? '$GPRMC,STATIC,DUMMY*00'
      : `$GPRMC,DUMMY,${pt.lat.toFixed(5)},${pt.lon.toFixed(5)}*00`;

    state.dummyIndex += 1;
  }, 1000);
}

function startUdpNmea(cfg) {
  udpSocket = dgram.createSocket('udp4');
  udpSocket.on('listening', () => {
    const addr = udpSocket.address();
    state.nmeaBindAddress = `${addr.address}:${addr.port}`;
    state.nmeaBindError = null;
  });
  udpSocket.on('message', (msg, rinfo) => {
    const hostFilter = (cfg.nmeaHost || '').trim();
    if (hostFilter && hostFilter !== rinfo.address) return;

    state.lastNmeaSource = `${rinfo.address}:${rinfo.port}`;
    state.lastNmeaAt = Date.now();
    state.nmeaConnected = true;
    state.nmeaPackets += 1;
    state.lastNmeaBytes = msg.length;

    const lines = msg.toString('ascii').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      state.lastNmeaLine = trimmed;
      handleNmeaLine(trimmed);
    }
  });
  udpSocket.on('error', () => {
    state.nmeaBindError = 'UDP socket error';
    state.nmeaConnected = false;
    try { udpSocket.close(); } catch {}
    udpSocket = null;
    if (nmeaRetryTimer) clearTimeout(nmeaRetryTimer);
    nmeaRetryTimer = setTimeout(() => {
      if (cfg.nmeaEnabled && cfg.nmeaProtocol === 'udp') startUdpNmea(cfg);
    }, 2000);
  });
  udpSocket.bind(cfg.nmeaPort, '0.0.0.0');
}

function connectTcp(cfg) {
  if (tcpSocket) tcpSocket.destroy();
  tcpSocket = new net.Socket();

  tcpSocket.on('data', (data) => {
    state.lastNmeaAt = Date.now();
    state.nmeaConnected = true;
    state.lastNmeaSource = `${cfg.nmeaHost || 'unknown'}:${cfg.nmeaPort}`;
    state.nmeaPackets += 1;
    state.lastNmeaBytes = data.length;

    tcpBuffer += data.toString('ascii');
    const parts = tcpBuffer.split(/\r?\n/);
    tcpBuffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      state.lastNmeaLine = trimmed;
      handleNmeaLine(trimmed);
    }
  });

  tcpSocket.on('error', () => {
    state.nmeaConnected = false;
    state.nmeaBindError = 'TCP connection error';
  });

  tcpSocket.on('close', () => {
    state.nmeaConnected = false;
  });

  tcpSocket.connect(cfg.nmeaPort, cfg.nmeaHost || '127.0.0.1');
}

function startTcpNmea(cfg) {
  connectTcp(cfg);
  state.nmeaBindAddress = `${cfg.nmeaHost || '127.0.0.1'}:${cfg.nmeaPort}`;
  state.nmeaBindError = null;
  tcpReconnectTimer = setInterval(() => {
    if (!tcpSocket || tcpSocket.destroyed) {
      try { connectTcp(cfg); } catch {}
    }
  }, 5000);
}

function stopNmea() {
  if (udpSocket) {
    try { udpSocket.close(); } catch {}
    udpSocket = null;
  }
  if (nmeaRetryTimer) {
    clearTimeout(nmeaRetryTimer);
    nmeaRetryTimer = null;
  }
  if (tcpSocket) {
    try { tcpSocket.destroy(); } catch {}
    tcpSocket = null;
  }
  if (tcpReconnectTimer) {
    clearInterval(tcpReconnectTimer);
    tcpReconnectTimer = null;
  }
  if (state.dummyTimer) {
    clearInterval(state.dummyTimer);
    state.dummyTimer = null;
  }
  state.listening = false;
  state.nmeaConnected = false;
}

function startNmea(cfg) {
  stopNmea();
  state.nmeaBindError = null;
  state.nmeaBindAddress = null;

  if (!cfg.nmeaEnabled) return;

  if (cfg.nmeaProtocol === 'dummy-route') {
    startDummyNmea(cfg, false);
    return;
  }
  if (cfg.nmeaProtocol === 'dummy-static') {
    startDummyNmea(cfg, true);
    return;
  }
  if (cfg.nmeaProtocol === 'tcp') {
    startTcpNmea(cfg);
    state.listening = true;
    return;
  }

  startUdpNmea(cfg);
  state.listening = true;
}

function formatStatus(cfg) {
  return {
    listening: state.listening,
    nmeaConnected: state.nmeaConnected,
    nmeaBindAddress: state.nmeaBindAddress,
    nmeaBindError: state.nmeaBindError,
    lastNmeaAt: state.lastNmeaAt,
    lastNmeaSource: state.lastNmeaSource,
    nmeaPackets: state.nmeaPackets,
    lastNmeaBytes: state.lastNmeaBytes,
    lastNmeaLine: state.lastNmeaLine,
    nmea: state.nmea,
    nmeaConfig: {
      enabled: !!cfg.nmeaEnabled,
      protocol: cfg.nmeaProtocol,
      host: cfg.nmeaHost,
      port: cfg.nmeaPort
    }
  };
}

function sendStatus(cfg) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status', formatStatus(cfg));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  const cfg = loadConfig();

  ipcMain.handle('get-config', () => cfg);
  ipcMain.handle('set-config', (_e, newCfg) => {
    Object.assign(cfg, newCfg);
    saveConfig(cfg);
    startNmea(cfg);
    return cfg;
  });
  ipcMain.handle('start-nmea', () => {
    startNmea(cfg);
    return true;
  });
  ipcMain.handle('stop-nmea', () => {
    stopNmea();
    return true;
  });

  createWindow();
  startNmea(cfg);
  statusTimer = setInterval(() => sendStatus(cfg), 500);
});

app.on('before-quit', () => {
  stopNmea();
  if (statusTimer) clearInterval(statusTimer);
});
