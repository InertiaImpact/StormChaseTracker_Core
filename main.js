const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const net = require('net');
const http = require('http');
const { SerialPort } = require('serialport');

const CONFIG_FILE = 'sender-config.json';

const DEFAULT_CONFIG = {
  targetUrl: 'http://10.215.100.169/ingest',
  deviceId: 'KGAN-HT0HLL3',
  sendIntervalMs: 1000,
  autoStart: false,
  nmeaProtocol: 'udp',
  nmeaHost: '10.0.2.1',
  nmeaPort: 55001,
  nmeaEnabled: true,
  gpsDummyMode: 'off',
  dummyBaseLat: 42.0277,
  dummyBaseLon: -91.6408,
  weatherEnabled: false,
  weatherPort: '',
  weatherBaud: '4800',
  weatherDummyMode: 'off'
};

const WEATHER_MISSING = -999;
const WEATHER_BAUDS = [4800, 9600, 19200, 38400, 57600, 115200];

function buildEmptyWeatherData() {
  return {
    Ta: WEATHER_MISSING,
    Ua: WEATHER_MISSING,
    Pa: WEATHER_MISSING,
    Sx: WEATHER_MISSING,
    Dx: WEATHER_MISSING,
    Rc: WEATHER_MISSING,
    Wh: WEATHER_MISSING,
    Wc: WEATHER_MISSING,
    Hj: WEATHER_MISSING,
    Dp: WEATHER_MISSING
  };
}

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
  sending: false,
  lastSendOkAt: null,
  firstSendOkAt: null,
  lastSendFailAt: null,
  lastSendStatus: null,
  lastSendError: null,
  sendSeq: 0,
  weather: {
    data: buildEmptyWeatherData(),
    connected: false,
    lastSerialAt: null,
    port: null,
    baud: null,
    gustHistory: [],
    availablePorts: [],
    detectedPort: null,
    detectedBaud: null
  }
};

let mainWindow = null;
let tray = null;
let sendTimer = null;
let statusTimer = null;
let udpSocket = null;
let tcpSocket = null;
let tcpReconnectTimer = null;
let tcpBuffer = '';
let weatherSerial = null;
let weatherBuffer = '';
let weatherServer = null;

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    if (!merged.gpsDummyMode && typeof parsed.dummyEnabled === 'boolean') {
      merged.gpsDummyMode = parsed.dummyEnabled ? 'route' : 'off';
    }
    if (merged.weatherPort === 'auto') merged.weatherPort = '';
    if (merged.weatherBaud === 'auto' || !merged.weatherBaud) merged.weatherBaud = '4800';
    return merged;
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
  else if (/^\$GNGNS,/.test(line)) parseGns(line);
  else if (/^\$(GP|GN)VTG,/.test(line)) parseVtg(line);
}

function numberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function toF(c) {
  if (!Number.isFinite(c)) return null;
  return (c * 9) / 5 + 32;
}

function toInHg(hpa) {
  if (!Number.isFinite(hpa)) return null;
  return hpa * 0.029529983;
}

function computeDewPointF(tempF, rh) {
  if (!Number.isFinite(tempF) || !Number.isFinite(rh) || rh <= 0 || rh > 100) return null;
  const tc = (tempF - 32) * 5 / 9;
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tc) / (b + tc) + Math.log(rh / 100);
  const tdC = (b * alpha) / (a - alpha);
  return (tdC * 9) / 5 + 32;
}

function computeHeatIndexF(tempF, rh) {
  if (!Number.isFinite(tempF) || !Number.isFinite(rh)) return null;
  if (tempF < 80 || rh < 40) return null;
  const T = tempF;
  const R = rh;
  const HI = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
    - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R
    + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  return HI;
}

function computeWindChillF(tempF, mph) {
  if (!Number.isFinite(tempF) || !Number.isFinite(mph)) return null;
  if (tempF > 50 || mph < 3) return null;
  return 35.74 + 0.6215 * tempF - 35.75 * Math.pow(mph, 0.16) + 0.4275 * tempF * Math.pow(mph, 0.16);
}

function pruneGustHistory() {
  const now = Date.now();
  state.weather.gustHistory = state.weather.gustHistory.filter((g) => now - g.ts <= 60000);
  if (state.weather.gustHistory.length === 0) {
    state.weather.data.Wh = WEATHER_MISSING;
  } else {
    const max = Math.max(...state.weather.gustHistory.map((g) => g.speed));
    state.weather.data.Wh = Number.isFinite(max) ? max : WEATHER_MISSING;
  }
}

function updateGustHistory(mph) {
  if (!Number.isFinite(mph)) return;
  state.weather.gustHistory.push({ ts: Date.now(), speed: mph });
  pruneGustHistory();
}

function recomputeDerivedWeather() {
  pruneGustHistory();
  const d = state.weather.data;
  const dp = computeDewPointF(d.Ta, d.Ua);
  d.Dp = Number.isFinite(dp) ? dp : WEATHER_MISSING;
  const hi = computeHeatIndexF(d.Ta, d.Ua);
  d.Hj = Number.isFinite(hi) ? hi : WEATHER_MISSING;
  const wc = computeWindChillF(d.Ta, d.Sx);
  d.Wc = Number.isFinite(wc) ? wc : WEATHER_MISSING;
}

function parseWeatherMwv(line) {
  const parts = line.split('*')[0].split(',');
  if (parts.length < 6) return;
  const angle = numberOrNull(parts[1]);
  const speedVal = numberOrNull(parts[3]);
  const unit = parts[4];
  if (Number.isFinite(angle)) state.weather.data.Dx = angle;
  if (Number.isFinite(speedVal)) {
    let mph = speedVal;
    if (unit === 'N') mph = speedVal * 1.150779;
    else if (unit === 'M') mph = speedVal * 2.236936;
    else if (unit === 'K') mph = speedVal * 0.621371;
    state.weather.data.Sx = mph;
    updateGustHistory(mph);
  }
  state.weather.connected = true;
  state.weather.lastSerialAt = Date.now();
  recomputeDerivedWeather();
}

function parseWeatherMda(line) {
  const parts = line.split('*')[0].split(',');
  if (parts.length < 10) return;
  const baroInHg = numberOrNull(parts[1]);
  const baroBars = numberOrNull(parts[3]);
  if (Number.isFinite(baroInHg)) state.weather.data.Pa = baroInHg;
  else if (Number.isFinite(baroBars)) state.weather.data.Pa = baroBars * 29.529983;

  const airTempC = numberOrNull(parts[5]);
  if (Number.isFinite(airTempC)) state.weather.data.Ta = toF(airTempC);

  const rh = numberOrNull(parts[9]);
  if (Number.isFinite(rh)) state.weather.data.Ua = rh;

  state.weather.connected = true;
  state.weather.lastSerialAt = Date.now();
  recomputeDerivedWeather();
}

function handleWeatherLine(line) {
  if (!line || line.length < 6) return;
  if (/^\$WIMWV,/.test(line)) parseWeatherMwv(line);
  else if (/^\$..MDA,/.test(line) || /^\$WIMDA,/.test(line)) parseWeatherMda(line);
}

function startUdpNmea(cfg) {
  udpSocket = dgram.createSocket('udp4');
  udpSocket.on('listening', () => {
    const addr = udpSocket.address();
    state.nmeaBindAddress = `${addr.address}:${addr.port}`;
    state.nmeaBindError = null;
  });
  udpSocket.on('message', (msg, rinfo) => {
    if (cfg.nmeaHost && cfg.nmeaHost.trim() && cfg.nmeaHost.trim() !== rinfo.address) return;
    state.lastNmeaSource = rinfo.address + ':' + rinfo.port;
    state.lastNmeaAt = Date.now();
    state.nmeaConnected = true;
    state.nmeaPackets += 1;
    state.lastNmeaBytes = msg.length;
    const text = msg.toString('ascii');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) state.lastNmeaLine = trimmed;
      handleNmeaLine(trimmed);
    }
  });
  udpSocket.on('error', () => {
    state.nmeaBindError = 'UDP socket error';
    state.nmeaConnected = false;
    try { udpSocket.close(); } catch { /* ignore */ }
    udpSocket = null;
    if (nmeaRetryTimer) clearTimeout(nmeaRetryTimer);
    nmeaRetryTimer = setTimeout(() => {
      if (cfg.nmeaEnabled && cfg.nmeaProtocol !== 'tcp') startUdpNmea(cfg);
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
    state.lastNmeaSource = cfg.nmeaHost + ':' + cfg.nmeaPort;
    state.nmeaPackets += 1;
    state.lastNmeaBytes = data.length;
    tcpBuffer += data.toString('ascii');
    const parts = tcpBuffer.split(/\r?\n/);
    tcpBuffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (trimmed) state.lastNmeaLine = trimmed;
      handleNmeaLine(trimmed);
    }
  });
  tcpSocket.on('error', () => {
    state.nmeaConnected = false;
  });
  tcpSocket.on('close', () => {
    state.nmeaConnected = false;
  });
  tcpSocket.connect(cfg.nmeaPort, cfg.nmeaHost);
}

function startTcpNmea(cfg) {
  connectTcp(cfg);
  tcpReconnectTimer = setInterval(() => {
    if (!tcpSocket || tcpSocket.destroyed) {
      try { connectTcp(cfg); } catch { /* ignore */ }
    }
  }, 5000);
}

function stopNmea() {
  if (udpSocket) {
    try { udpSocket.close(); } catch { /* ignore */ }
    udpSocket = null;
  }
  if (tcpSocket) {
    try { tcpSocket.destroy(); } catch { /* ignore */ }
    tcpSocket = null;
  }
  if (tcpReconnectTimer) {
    clearInterval(tcpReconnectTimer);
    tcpReconnectTimer = null;
  }
  state.nmeaConnected = false;
}

function startNmea(cfg) {
  stopNmea();
  state.nmeaBindError = null;
  state.nmeaBindAddress = null;
  if (!cfg.nmeaEnabled) return;
  if (cfg.nmeaProtocol === 'tcp') startTcpNmea(cfg);
  else startUdpNmea(cfg);
}

async function refreshWeatherPorts() {
  try {
    const ports = await SerialPort.list();
    state.weather.availablePorts = ports.map((p) => p.path);
  } catch {
    state.weather.availablePorts = [];
  }
  return state.weather.availablePorts;
}

function stopWeather() {
  if (weatherSerial) {
    try { weatherSerial.removeAllListeners(); } catch { /* ignore */ }
    if (weatherSerial.isOpen) {
      try { weatherSerial.close(() => {}); } catch { /* ignore */ }
    }
  }
  weatherSerial = null;
  weatherBuffer = '';
  state.weather.connected = false;
  state.weather.port = null;
  state.weather.baud = null;
}

async function probeWeatherPort(port, baud) {
  return new Promise((resolve) => {
    let buffer = '';
    const sp = new SerialPort({ path: port, baudRate: baud, autoOpen: false });
    let timer = null;
    const cleanup = (result) => {
      if (timer) clearTimeout(timer);
      try { sp.removeAllListeners(); } catch { /* ignore */ }
      if (sp.isOpen) {
        try { sp.close(() => {}); } catch { /* ignore */ }
      }
      resolve(result);
    };
    sp.on('data', (chunk) => {
      buffer += chunk.toString('ascii');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^\$WIMWV,/.test(trimmed) || /^\$..MDA,/.test(trimmed) || /^\$WIMDA,/.test(trimmed)) {
          cleanup(true);
          return;
        }
      }
    });
    sp.on('error', () => cleanup(false));
    sp.open((err) => {
      if (err) return cleanup(false);
      timer = setTimeout(() => cleanup(false), 1200);
    });
  });
}

function handleWeatherSerialData(chunk) {
  weatherBuffer += chunk.toString('ascii');
  const lines = weatherBuffer.split(/\r?\n/);
  weatherBuffer = lines.pop() || '';
  for (const line of lines) handleWeatherLine(line.trim());
}

async function startWeather(cfg) {
  stopWeather();
  state.weather.connected = false;
  state.weather.detectedPort = null;
  state.weather.detectedBaud = null;
  await refreshWeatherPorts();
  if (!cfg.weatherEnabled) return;

  if (cfg.weatherDummyMode && cfg.weatherDummyMode !== 'off') {
    state.weather.connected = true;
    state.weather.port = 'dummy';
    state.weather.baud = null;
    return;
  }

  const selectedPort = cfg.weatherPort || null;
  const selectedBaud = parseInt(cfg.weatherBaud || '0', 10) || null;

  if (!selectedPort || !selectedBaud) return;

  weatherSerial = new SerialPort({ path: selectedPort, baudRate: selectedBaud, autoOpen: true });
  weatherSerial.on('data', handleWeatherSerialData);
  weatherSerial.on('open', () => {
    state.weather.connected = true;
    state.weather.port = selectedPort;
    state.weather.baud = selectedBaud;
  });
  weatherSerial.on('error', () => {
    state.weather.connected = false;
  });
  weatherSerial.on('close', () => {
    state.weather.connected = false;
  });
}

function applyWeatherDummy(cfg) {
  if (!cfg.weatherEnabled) return;
  if (!cfg.weatherDummyMode || cfg.weatherDummyMode === 'off') return;
  const t = Date.now() / 1000;
  const d = state.weather.data;
  if (cfg.weatherDummyMode === 'calm') {
    d.Ta = 72 + Math.sin(t / 180) * 2;
    d.Ua = 55 + Math.sin(t / 60) * 5;
    d.Pa = 29.92 + Math.sin(t / 900) * 0.05;
    d.Sx = 6 + Math.sin(t / 20) * 2;
    d.Dx = (t * 2) % 360;
    d.Rc = WEATHER_MISSING;
  } else if (cfg.weatherDummyMode === 'storm') {
    d.Ta = 78 + Math.sin(t / 30) * 4;
    d.Ua = 82 + Math.sin(t / 25) * 8;
    d.Pa = 29.2 + Math.sin(t / 300) * 0.1;
    d.Sx = 28 + Math.sin(t / 5) * 6;
    d.Dx = (45 + Math.sin(t / 12) * 20 + 360) % 360;
    d.Rc = 0.02;
  } else if (cfg.weatherDummyMode === 'sweep') {
    const min = -40;
    const max = 140;
    const range = max - min;
    const period = 30;
    const sweep = ((t % period) / period) * 2;
    const pct = sweep <= 1 ? sweep : 2 - sweep;
    const value = min + range * pct;
    d.Ta = value;
    d.Ua = Math.max(0, Math.min(100, 50 + (value / 3)));
    d.Pa = 29.92 + (value / 1000);
    d.Sx = Math.max(0, Math.min(80, (value + 40) / 2));
    d.Dx = (value * 3 + 360) % 360;
    d.Rc = WEATHER_MISSING;
  }
  updateGustHistory(d.Sx);
  state.weather.connected = true;
  state.weather.lastSerialAt = Date.now();
  recomputeDerivedWeather();
}

function getWeatherOutput() {
  pruneGustHistory();
  const d = state.weather.data;
  const asNumber = (v) => (Number.isFinite(v) ? v : WEATHER_MISSING);
  return [
    {
      LastRawSecondData: {
        Ta: asNumber(d.Ta),
        Ua: asNumber(d.Ua),
        Pa: asNumber(d.Pa),
        Sx: asNumber(d.Sx),
        Dx: asNumber(d.Dx),
        Rc: asNumber(d.Rc),
        Wh: asNumber(d.Wh),
        Wc: asNumber(d.Wc),
        Hj: asNumber(d.Hj),
        Dp: asNumber(d.Dp)
      }
    }
  ];
}

function startWeatherServer() {
  if (weatherServer) return;
  weatherServer = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:11100');
      const cmd = (url.searchParams.get('command') || '').trim();
      if (cmd === 'jsonobject weatherdata') {
        const body = JSON.stringify(getWeatherOutput());
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        });
        res.end(body);
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  weatherServer.listen(11100, '127.0.0.1');
}

function buildPayload(cfg) {
  const t = Date.now() / 1000;
  const gpsDummyMode = cfg.gpsDummyMode || (cfg.dummyEnabled ? 'route' : 'off');
  const useDummyRoute = gpsDummyMode === 'route';
  const useDummyStatic = gpsDummyMode === 'static';
  const useDummy = useDummyRoute || useDummyStatic;
  const dummyRoute = [
    { lat: 42.02762, lon: -91.64081 },
    { lat: 42.02774, lon: -91.64093 },
    { lat: 42.02774, lon: -91.64093 },
    { lat: 42.02772, lon: -91.64098 },
    { lat: 42.02768, lon: -91.64104 },
    { lat: 42.02753, lon: -91.64132 },
    { lat: 42.02752, lon: -91.6415 },
    { lat: 42.02752, lon: -91.6415 },
    { lat: 42.02682, lon: -91.64149 },
    { lat: 42.02666, lon: -91.64145 },
    { lat: 42.02609, lon: -91.64111 },
    { lat: 42.02609, lon: -91.64111 },
    { lat: 42.02606, lon: -91.64116 },
    { lat: 42.02511, lon: -91.64294 },
    { lat: 42.02484, lon: -91.64343 },
    { lat: 42.02479, lon: -91.64353 },
    { lat: 42.02479, lon: -91.64353 },
    { lat: 42.0245, lon: -91.64407 },
    { lat: 42.02371, lon: -91.64553 },
    { lat: 42.02353, lon: -91.64585 },
    { lat: 42.02327, lon: -91.6464 },
    { lat: 42.02282, lon: -91.64723 },
    { lat: 42.02265, lon: -91.64755 },
    { lat: 42.02246, lon: -91.64792 },
    { lat: 42.02235, lon: -91.64813 },
    { lat: 42.02232, lon: -91.64821 },
    { lat: 42.02229, lon: -91.64826 },
    { lat: 42.02227, lon: -91.64831 },
    { lat: 42.02225, lon: -91.64835 },
    { lat: 42.02196, lon: -91.649 },
    { lat: 42.02195, lon: -91.64901 },
    { lat: 42.02186, lon: -91.64922 },
    { lat: 42.0216, lon: -91.64979 },
    { lat: 42.02157, lon: -91.64986 },
    { lat: 42.02141, lon: -91.6502 },
    { lat: 42.02133, lon: -91.65039 },
    { lat: 42.02101, lon: -91.65112 },
    { lat: 42.02098, lon: -91.65121 },
    { lat: 42.02082, lon: -91.65159 },
    { lat: 42.02064, lon: -91.65203 },
    { lat: 42.02053, lon: -91.6523 },
    { lat: 42.02043, lon: -91.65254 },
    { lat: 42.02031, lon: -91.65284 },
    { lat: 42.02017, lon: -91.65308 },
    { lat: 42.02005, lon: -91.65321 },
    { lat: 42.02005, lon: -91.65321 },
    { lat: 42.01877, lon: -91.65391 },
    { lat: 42.018, lon: -91.65431 },
    { lat: 42.01784, lon: -91.6544 },
    { lat: 42.01761, lon: -91.65452 },
    { lat: 42.01697, lon: -91.65486 },
    { lat: 42.01613, lon: -91.65531 },
    { lat: 42.01548, lon: -91.65567 },
    { lat: 42.01418, lon: -91.65647 },
    { lat: 42.01402, lon: -91.65657 },
    { lat: 42.01359, lon: -91.65685 },
    { lat: 42.01323, lon: -91.65709 },
    { lat: 42.0131, lon: -91.65715 },
    { lat: 42.01292, lon: -91.65724 },
    { lat: 42.01288, lon: -91.65727 },
    { lat: 42.01268, lon: -91.65736 },
    { lat: 42.01241, lon: -91.6575 },
    { lat: 42.01232, lon: -91.65754 },
    { lat: 42.01223, lon: -91.65758 },
    { lat: 42.01214, lon: -91.65762 },
    { lat: 42.01187, lon: -91.65774 },
    { lat: 42.01182, lon: -91.65777 },
    { lat: 42.0118, lon: -91.65777 },
    { lat: 42.01163, lon: -91.65785 },
    { lat: 42.01137, lon: -91.65796 },
    { lat: 42.01133, lon: -91.65798 },
    { lat: 42.01131, lon: -91.65799 },
    { lat: 42.01095, lon: -91.65814 },
    { lat: 42.01053, lon: -91.65832 },
    { lat: 42.01037, lon: -91.65839 },
    { lat: 42.01031, lon: -91.65841 },
    { lat: 42.00978, lon: -91.65863 },
    { lat: 42.0095, lon: -91.65875 },
    { lat: 42.00934, lon: -91.65881 },
    { lat: 42.00919, lon: -91.65888 },
    { lat: 42.00899, lon: -91.65896 },
    { lat: 42.00888, lon: -91.659 },
    { lat: 42.0086, lon: -91.65912 },
    { lat: 42.00857, lon: -91.65913 },
    { lat: 42.00844, lon: -91.65918 },
    { lat: 42.00839, lon: -91.65921 },
    { lat: 42.00824, lon: -91.65927 },
    { lat: 42.00801, lon: -91.65937 },
    { lat: 42.00774, lon: -91.65948 },
    { lat: 42.00764, lon: -91.65952 },
    { lat: 42.0076, lon: -91.65954 },
    { lat: 42.00757, lon: -91.65955 },
    { lat: 42.00751, lon: -91.65957 },
    { lat: 42.00744, lon: -91.65959 },
    { lat: 42.00733, lon: -91.65961 },
    { lat: 42.0073, lon: -91.65962 },
    { lat: 42.00728, lon: -91.65962 },
    { lat: 42.00711, lon: -91.65963 },
    { lat: 42.00687, lon: -91.65964 },
    { lat: 42.00687, lon: -91.65964 },
    { lat: 42.00687, lon: -91.65976 },
    { lat: 42.00688, lon: -91.66019 },
    { lat: 42.00689, lon: -91.66036 },
    { lat: 42.0069, lon: -91.66075 },
    { lat: 42.00691, lon: -91.6612 },
    { lat: 42.00691, lon: -91.66129 },
    { lat: 42.00692, lon: -91.66178 },
    { lat: 42.00692, lon: -91.66197 },
    { lat: 42.00693, lon: -91.66219 },
    { lat: 42.00693, lon: -91.66253 },
    { lat: 42.00694, lon: -91.66274 },
    { lat: 42.00694, lon: -91.66287 },
    { lat: 42.00694, lon: -91.66299 },
    { lat: 42.00695, lon: -91.66337 },
    { lat: 42.00695, lon: -91.66389 },
    { lat: 42.00695, lon: -91.66393 },
    { lat: 42.00696, lon: -91.66401 },
    { lat: 42.00698, lon: -91.66407 },
    { lat: 42.007, lon: -91.66414 },
    { lat: 42.007, lon: -91.66442 },
    { lat: 42.00701, lon: -91.66482 },
    { lat: 42.00701, lon: -91.66482 },
    { lat: 42.00702, lon: -91.66507 },
    { lat: 42.00703, lon: -91.6653 },
    { lat: 42.00703, lon: -91.66541 },
    { lat: 42.00707, lon: -91.66703 },
    { lat: 42.00707, lon: -91.66712 },
    { lat: 42.00707, lon: -91.66712 },
    { lat: 42.00698, lon: -91.66712 },
    { lat: 42.00684, lon: -91.66711 },
    { lat: 42.00676, lon: -91.66711 },
    { lat: 42.00601, lon: -91.66695 },
    { lat: 42.00551, lon: -91.66687 },
    { lat: 42.00503, lon: -91.66678 },
    { lat: 42.00466, lon: -91.66674 },
    { lat: 42.00433, lon: -91.66672 },
    { lat: 42.00358, lon: -91.66669 },
    { lat: 42.00358, lon: -91.66669 },
    { lat: 42.00247, lon: -91.66676 },
    { lat: 42.00192, lon: -91.66681 },
    { lat: 42.00125, lon: -91.66686 },
    { lat: 42.00014, lon: -91.66694 },
    { lat: 41.99951, lon: -91.66698 },
    { lat: 41.99949, lon: -91.66698 },
    { lat: 41.99886, lon: -91.66701 },
    { lat: 41.99835, lon: -91.66705 },
    { lat: 41.99756, lon: -91.6671 },
    { lat: 41.99726, lon: -91.6671 },
    { lat: 41.99703, lon: -91.66709 },
    { lat: 41.99678, lon: -91.66707 },
    { lat: 41.9965, lon: -91.66702 },
    { lat: 41.99617, lon: -91.66694 },
    { lat: 41.99584, lon: -91.66684 },
    { lat: 41.99572, lon: -91.6668 },
    { lat: 41.99558, lon: -91.66675 },
    { lat: 41.99547, lon: -91.6667 },
    { lat: 41.99539, lon: -91.66666 },
    { lat: 41.99521, lon: -91.66658 },
    { lat: 41.99505, lon: -91.6665 },
    { lat: 41.99481, lon: -91.66636 },
    { lat: 41.99458, lon: -91.66622 },
    { lat: 41.99435, lon: -91.66606 },
    { lat: 41.99411, lon: -91.66588 },
    { lat: 41.99384, lon: -91.66564 },
    { lat: 41.99355, lon: -91.66538 },
    { lat: 41.9929, lon: -91.66472 },
    { lat: 41.9925, lon: -91.66431 },
    { lat: 41.99196, lon: -91.66378 },
    { lat: 41.99118, lon: -91.66299 },
    { lat: 41.99097, lon: -91.66278 },
    { lat: 41.99077, lon: -91.6626 },
    { lat: 41.99063, lon: -91.66247 },
    { lat: 41.99046, lon: -91.66234 },
    { lat: 41.99036, lon: -91.66227 },
    { lat: 41.9902, lon: -91.66216 },
    { lat: 41.99003, lon: -91.66206 },
    { lat: 41.98984, lon: -91.66196 },
    { lat: 41.98966, lon: -91.66187 },
    { lat: 41.98949, lon: -91.66181 },
    { lat: 41.98936, lon: -91.66176 },
    { lat: 41.9892, lon: -91.66171 },
    { lat: 41.98901, lon: -91.66167 },
    { lat: 41.98881, lon: -91.66163 },
    { lat: 41.9885, lon: -91.6616 },
    { lat: 41.98832, lon: -91.6616 },
    { lat: 41.9881, lon: -91.66161 },
    { lat: 41.98785, lon: -91.66163 },
    { lat: 41.98764, lon: -91.66167 },
    { lat: 41.98744, lon: -91.66172 },
    { lat: 41.98724, lon: -91.66178 },
    { lat: 41.98708, lon: -91.66185 },
    { lat: 41.98686, lon: -91.66194 },
    { lat: 41.98673, lon: -91.662 },
    { lat: 41.98657, lon: -91.66209 },
    { lat: 41.9864, lon: -91.66219 },
    { lat: 41.98615, lon: -91.66237 },
    { lat: 41.9859, lon: -91.66258 },
    { lat: 41.98566, lon: -91.66279 },
    { lat: 41.98539, lon: -91.66307 },
    { lat: 41.98513, lon: -91.66338 },
    { lat: 41.98424, lon: -91.66438 },
    { lat: 41.98409, lon: -91.66456 },
    { lat: 41.9838, lon: -91.66488 },
    { lat: 41.9837, lon: -91.665 },
    { lat: 41.98342, lon: -91.66532 },
    { lat: 41.98168, lon: -91.66732 },
    { lat: 41.98116, lon: -91.66789 },
    { lat: 41.98103, lon: -91.66805 },
    { lat: 41.9809, lon: -91.66821 },
    { lat: 41.98073, lon: -91.66843 },
    { lat: 41.98062, lon: -91.6686 },
    { lat: 41.98051, lon: -91.66878 },
    { lat: 41.98041, lon: -91.66895 },
    { lat: 41.98029, lon: -91.66918 },
    { lat: 41.98019, lon: -91.66942 },
    { lat: 41.9801, lon: -91.66965 },
    { lat: 41.97996, lon: -91.67005 },
    { lat: 41.9798, lon: -91.67046 },
    { lat: 41.97961, lon: -91.671 },
    { lat: 41.97945, lon: -91.67146 },
    { lat: 41.97923, lon: -91.67206 },
    { lat: 41.97858, lon: -91.67385 },
    { lat: 41.97853, lon: -91.67398 },
    { lat: 41.97843, lon: -91.67424 },
    { lat: 41.97835, lon: -91.67441 },
    { lat: 41.97827, lon: -91.67456 },
    { lat: 41.9782, lon: -91.6747 },
    { lat: 41.97813, lon: -91.67483 },
    { lat: 41.97797, lon: -91.67505 },
    { lat: 41.97783, lon: -91.67524 },
    { lat: 41.97767, lon: -91.67544 },
    { lat: 41.97752, lon: -91.6756 },
    { lat: 41.97743, lon: -91.67569 },
    { lat: 41.97734, lon: -91.67576 },
    { lat: 41.97723, lon: -91.67586 },
    { lat: 41.97712, lon: -91.67594 },
    { lat: 41.97697, lon: -91.67604 },
    { lat: 41.97682, lon: -91.67613 },
    { lat: 41.9767, lon: -91.6762 },
    { lat: 41.97655, lon: -91.67626 },
    { lat: 41.97645, lon: -91.6763 },
    { lat: 41.97634, lon: -91.67634 },
    { lat: 41.97625, lon: -91.67637 },
    { lat: 41.97613, lon: -91.6764 },
    { lat: 41.976, lon: -91.67642 },
    { lat: 41.97581, lon: -91.67644 },
    { lat: 41.97569, lon: -91.67645 },
    { lat: 41.97553, lon: -91.67645 },
    { lat: 41.97536, lon: -91.67644 },
    { lat: 41.97519, lon: -91.67641 },
    { lat: 41.97503, lon: -91.67638 },
    { lat: 41.97486, lon: -91.67633 },
    { lat: 41.97471, lon: -91.67628 },
    { lat: 41.97455, lon: -91.67621 },
    { lat: 41.97442, lon: -91.67615 },
    { lat: 41.97428, lon: -91.67608 },
    { lat: 41.97412, lon: -91.67599 },
    { lat: 41.97387, lon: -91.67582 },
    { lat: 41.97351, lon: -91.67556 },
    { lat: 41.97316, lon: -91.67531 },
    { lat: 41.97145, lon: -91.67408 },
    { lat: 41.9708, lon: -91.67361 },
    { lat: 41.96904, lon: -91.67234 },
    { lat: 41.96866, lon: -91.67208 },
    { lat: 41.9683, lon: -91.67182 },
    { lat: 41.96809, lon: -91.67168 },
    { lat: 41.96791, lon: -91.67156 },
    { lat: 41.96764, lon: -91.67139 },
    { lat: 41.96748, lon: -91.6713 },
    { lat: 41.96725, lon: -91.67118 },
    { lat: 41.96698, lon: -91.67108 },
    { lat: 41.96681, lon: -91.67102 },
    { lat: 41.96656, lon: -91.67096 },
    { lat: 41.96625, lon: -91.6709 },
    { lat: 41.96602, lon: -91.67088 },
    { lat: 41.96577, lon: -91.67086 },
    { lat: 41.96543, lon: -91.67085 },
    { lat: 41.9652, lon: -91.67085 },
    { lat: 41.96287, lon: -91.67089 },
    { lat: 41.96154, lon: -91.67091 },
    { lat: 41.96079, lon: -91.67092 },
    { lat: 41.95609, lon: -91.67099 },
    { lat: 41.95452, lon: -91.67102 },
    { lat: 41.95284, lon: -91.67106 },
    { lat: 41.95161, lon: -91.67107 },
    { lat: 41.95131, lon: -91.67107 },
    { lat: 41.94972, lon: -91.6711 },
    { lat: 41.94943, lon: -91.6711 },
    { lat: 41.94837, lon: -91.67112 },
    { lat: 41.94767, lon: -91.6711 },
    { lat: 41.94702, lon: -91.67103 },
    { lat: 41.94631, lon: -91.67093 },
    { lat: 41.94534, lon: -91.67074 },
    { lat: 41.94511, lon: -91.67069 },
    { lat: 41.94488, lon: -91.67065 },
    { lat: 41.9433, lon: -91.67032 },
    { lat: 41.94142, lon: -91.66996 },
    { lat: 41.9411, lon: -91.6699 },
    { lat: 41.94031, lon: -91.66973 },
    { lat: 41.93838, lon: -91.66935 },
    { lat: 41.93769, lon: -91.66926 },
    { lat: 41.93711, lon: -91.66919 },
    { lat: 41.93684, lon: -91.66917 },
    { lat: 41.93654, lon: -91.66916 },
    { lat: 41.93624, lon: -91.66916 },
    { lat: 41.93597, lon: -91.66917 },
    { lat: 41.93556, lon: -91.66919 },
    { lat: 41.93501, lon: -91.66923 },
    { lat: 41.93436, lon: -91.66931 },
    { lat: 41.93436, lon: -91.66931 },
    { lat: 41.9338, lon: -91.66949 },
    { lat: 41.93343, lon: -91.66961 },
    { lat: 41.93309, lon: -91.66975 },
    { lat: 41.93246, lon: -91.67005 },
    { lat: 41.93246, lon: -91.67005 },
    { lat: 41.93228, lon: -91.67011 },
    { lat: 41.93172, lon: -91.67038 },
    { lat: 41.93153, lon: -91.67044 },
    { lat: 41.93134, lon: -91.67047 },
    { lat: 41.93114, lon: -91.67048 },
    { lat: 41.93092, lon: -91.67048 },
    { lat: 41.93071, lon: -91.67044 },
    { lat: 41.93049, lon: -91.67033 },
    { lat: 41.93027, lon: -91.67022 },
    { lat: 41.93006, lon: -91.67009 },
    { lat: 41.92988, lon: -91.66994 },
    { lat: 41.92974, lon: -91.6698 },
    { lat: 41.9296, lon: -91.66962 },
    { lat: 41.92945, lon: -91.66938 },
    { lat: 41.92934, lon: -91.66915 },
    { lat: 41.92817, lon: -91.66687 },
    { lat: 41.92782, lon: -91.66615 },
    { lat: 41.92733, lon: -91.66515 },
    { lat: 41.92669, lon: -91.6639 },
    { lat: 41.92654, lon: -91.66357 },
    { lat: 41.92648, lon: -91.66339 },
    { lat: 41.92641, lon: -91.66317 },
    { lat: 41.92635, lon: -91.66295 },
    { lat: 41.92635, lon: -91.66295 },
    { lat: 41.9263, lon: -91.66279 },
    { lat: 41.92623, lon: -91.66243 },
    { lat: 41.92615, lon: -91.66195 },
    { lat: 41.92568, lon: -91.65928 },
    { lat: 41.92532, lon: -91.65725 },
    { lat: 41.92532, lon: -91.65725 },
    { lat: 41.92532, lon: -91.65707 },
    { lat: 41.92533, lon: -91.65695 },
    { lat: 41.92534, lon: -91.65693 },
    { lat: 41.92538, lon: -91.65683 },
    { lat: 41.92546, lon: -91.65677 },
    { lat: 41.92546, lon: -91.65677 },
    { lat: 41.92648, lon: -91.65679 },
    { lat: 41.92685, lon: -91.6568 },
    { lat: 41.92685, lon: -91.6568 },
    { lat: 41.92703, lon: -91.65676 },
    { lat: 41.92712, lon: -91.65674 },
    { lat: 41.92723, lon: -91.65672 },
    { lat: 41.92735, lon: -91.6567 },
    { lat: 41.92752, lon: -91.65666 },
    { lat: 41.92763, lon: -91.65663 },
    { lat: 41.92777, lon: -91.65659 },
    { lat: 41.92788, lon: -91.65655 },
    { lat: 41.92801, lon: -91.65647 },
    { lat: 41.92811, lon: -91.65639 },
    { lat: 41.9282, lon: -91.65629 },
    { lat: 41.92827, lon: -91.65616 },
    { lat: 41.92831, lon: -91.65607 },
    { lat: 41.92834, lon: -91.65595 },
    { lat: 41.92837, lon: -91.65582 },
    { lat: 41.92836, lon: -91.65549 },
    { lat: 41.92833, lon: -91.65535 },
    { lat: 41.92828, lon: -91.65522 },
    { lat: 41.9282, lon: -91.65508 },
    { lat: 41.92812, lon: -91.65498 },
    { lat: 41.92803, lon: -91.6549 },
    { lat: 41.92795, lon: -91.65486 },
    { lat: 41.92785, lon: -91.65482 },
    { lat: 41.9277, lon: -91.65481 },
    { lat: 41.92755, lon: -91.65483 },
    { lat: 41.92745, lon: -91.65488 },
    { lat: 41.92729, lon: -91.65502 },
    { lat: 41.92717, lon: -91.6552 },
    { lat: 41.9271, lon: -91.65541 },
    { lat: 41.92699, lon: -91.65623 },
    { lat: 41.92699, lon: -91.65623 },
    { lat: 41.927, lon: -91.65765 },
    { lat: 41.927, lon: -91.65765 }
  ];

  let dummyLat = cfg.dummyBaseLat || 0;
  let dummyLon = cfg.dummyBaseLon || 0;
  let dummyHeading = 0;
  let dummySpeed = 0;

  if (useDummyRoute) {
    const loopSeconds = 360;
    const progress = (t % loopSeconds) / loopSeconds;
    const totalSegments = (dummyRoute.length - 1) * 2;
    const segment = progress * totalSegments;
    const segIndex = Math.floor(segment);
    const frac = segment - segIndex;
    let a;
    let b;
    if (segIndex < dummyRoute.length - 1) {
      a = dummyRoute[segIndex];
      b = dummyRoute[segIndex + 1];
    } else {
      const backIndex = segIndex - (dummyRoute.length - 1);
      a = dummyRoute[dummyRoute.length - 1 - backIndex];
      b = dummyRoute[dummyRoute.length - 2 - backIndex];
    }
    dummyLat = a.lat + (b.lat - a.lat) * frac;
    dummyLon = a.lon + (b.lon - a.lon) * frac;
    const dy = (b.lat - a.lat);
    const dx = (b.lon - a.lon);
    dummyHeading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    dummySpeed = 67.5 + 12.5 * Math.sin(t / 9);
  } else if (useDummyStatic) {
    dummyLat = dummyLat + 0.00005 * Math.sin(t / 30);
    dummyLon = dummyLon + 0.00005 * Math.cos(t / 30);
    dummyHeading = (t * 3) % 360;
    dummySpeed = 0;
  }

  return {
    device: cfg.deviceId || 'UNKNOWN',
    seq: state.sendSeq,
    ts_unix: t,
    fix: useDummy ? 'VALID' : (state.nmea.fixValid ? 'VALID' : 'NOFIX'),
    lat: useDummy ? dummyLat : state.nmea.lat,
    lon: useDummy ? dummyLon : state.nmea.lon,
    heading_deg: useDummy ? dummyHeading : state.nmea.courseT,
    speed_mph: useDummy ? dummySpeed : state.nmea.speedMph,
    sats: useDummy ? 12 : state.nmea.sats,
    hdop: useDummy ? 0.9 : state.nmea.hdop,
    alt_m: useDummy ? 261.5 : state.nmea.altM
  };
}

async function sendOnce(cfg) {
  const payload = buildPayload(cfg);
  const url = cfg.targetUrl;
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Connection': 'close'
      },
      timeout: 5000,
      agent: false
    }, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(res.statusCode);
      else reject(new Error('HTTP ' + res.statusCode));
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function startSending(cfg) {
  if (sendTimer) clearInterval(sendTimer);
  state.sending = true;
  sendTimer = setInterval(async () => {
    try {
      const statusCode = await sendOnce(cfg);
      const now = Date.now();
      state.lastSendOkAt = now;
      if (!state.firstSendOkAt) state.firstSendOkAt = now;
      state.lastSendStatus = statusCode || null;
      state.lastSendError = null;
      state.sendSeq += 1;
    } catch (err) {
      state.lastSendFailAt = Date.now();
      state.lastSendError = err && err.message ? err.message : 'send failed';
    }
  }, Math.max(250, cfg.sendIntervalMs || 1000));
}

function stopSending() {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = null;
  state.sending = false;
  state.firstSendOkAt = null;
}

function formatStatus(cfg) {
  const now = Date.now();
  const connected = state.lastSendOkAt && now - state.lastSendOkAt <= Math.max(3000, (cfg.sendIntervalMs || 1000) * 3);
  const connectionDurationMs = connected && state.firstSendOkAt ? now - state.firstSendOkAt : 0;
  const lastConnection = state.lastSendOkAt || null;
  const sending = state.sending && !!sendTimer;

  return {
    sending,
    connected,
    targetHost: cfg.targetUrl,
    connectionDurationMs,
    lastConnection,
    lastSendStatus: state.lastSendStatus,
    lastSendError: state.lastSendError,
    nmeaConnected: state.nmeaConnected,
    lastNmeaAt: state.lastNmeaAt,
    lastNmeaSource: state.lastNmeaSource,
    nmea: state.nmea,
    gpsDummyMode: cfg.gpsDummyMode || (cfg.dummyEnabled ? 'route' : 'off'),
    nmeaConfig: {
      enabled: !!cfg.nmeaEnabled,
      protocol: cfg.nmeaProtocol || 'udp',
      host: cfg.nmeaHost || '',
      port: cfg.nmeaPort || 0
    },
    weatherConfig: {
      enabled: !!cfg.weatherEnabled,
      dummyMode: cfg.weatherDummyMode || 'off'
    },
    weather: {
      connected: state.weather.connected,
      port: state.weather.port,
      baud: state.weather.baud,
      lastSerialAt: state.weather.lastSerialAt,
      availablePorts: state.weather.availablePorts,
      detectedPort: state.weather.detectedPort,
      detectedBaud: state.weather.detectedBaud,
      data: state.weather.data
    }
  };
}

function sendStatusToRenderer(cfg) {
  applyWeatherDummy(cfg);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status', formatStatus(cfg));
  }
}

function setupTray() {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAI0lEQVQoz2NgwAb+///f+P///4YGBgYGBgYGABoMA3S5myDRAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromDataURL(dataUrl);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('RoadWarrior Sender');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 680,
    height: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  const cfg = loadConfig();
  ipcMain.handle('get-config', () => cfg);
  ipcMain.handle('set-config', async (_e, newCfg) => {
    Object.assign(cfg, newCfg);
    saveConfig(cfg);
    startNmea(cfg);
    await startWeather(cfg);
    if (state.sending) {
      stopSending();
      await new Promise((resolve) => setTimeout(resolve, 500));
      startSending(cfg);
    }
    return cfg;
  });
  ipcMain.handle('start-sending', () => {
    startSending(cfg);
    return true;
  });
  ipcMain.handle('stop-sending', () => {
    stopSending();
    return true;
  });

  createWindow();
  setupTray();
  startNmea(cfg);
  startWeather(cfg);
  startWeatherServer();
  if (cfg.autoStart) startSending(cfg);
  statusTimer = setInterval(() => sendStatusToRenderer(cfg), 500);
});

app.on('before-quit', () => {
  app.isQuiting = true;
  stopNmea();
  stopWeather();
  stopSending();
  if (statusTimer) clearInterval(statusTimer);
  if (weatherServer) {
    try { weatherServer.close(); } catch { /* ignore */ }
  }
});
