const els = {
  targetUrl: document.getElementById('targetUrl'),
  deviceId: document.getElementById('deviceId'),
  sendIntervalMs: document.getElementById('sendIntervalMs'),
  autoStart: document.getElementById('autoStart'),
  gpsDummyMode: document.getElementById('gpsDummyMode'),
  nmeaProtocol: document.getElementById('nmeaProtocol'),
  nmeaHost: document.getElementById('nmeaHost'),
  nmeaPort: document.getElementById('nmeaPort'),
  nmeaEnabled: document.getElementById('nmeaEnabled'),
  weatherEnabled: document.getElementById('weatherEnabled'),
  weatherPort: document.getElementById('weatherPort'),
  weatherBaud: document.getElementById('weatherBaud'),
  weatherDummyMode: document.getElementById('weatherDummyMode'),
  saveBtn: document.getElementById('saveBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  statusPill: document.getElementById('status-pill'),
  gpsPill: document.getElementById('gps-pill'),
  wxPill: document.getElementById('wx-pill'),
  connected: document.getElementById('connected'),
  targetHost: document.getElementById('targetHost'),
  connDuration: document.getElementById('connDuration'),
  lastConn: document.getElementById('lastConn'),
  lastSendStatus: document.getElementById('lastSendStatus'),
  lastSendError: document.getElementById('lastSendError'),
  nmeaConnected: document.getElementById('nmeaConnected'),
  nmeaSource: document.getElementById('nmeaSource'),
  lastNmea: document.getElementById('lastNmea'),
  nmeaCfgEnabled: document.getElementById('nmeaCfgEnabled'),
  nmeaCfgProtocol: document.getElementById('nmeaCfgProtocol'),
  nmeaCfgHost: document.getElementById('nmeaCfgHost'),
  nmeaCfgPort: document.getElementById('nmeaCfgPort'),
  fix: document.getElementById('fix'),
  lat: document.getElementById('lat'),
  lon: document.getElementById('lon'),
  heading: document.getElementById('heading'),
  speed: document.getElementById('speed'),
  sats: document.getElementById('sats'),
  hdop: document.getElementById('hdop'),
  alt: document.getElementById('alt'),
  wxPort: document.getElementById('wxPort'),
  wxBaud: document.getElementById('wxBaud'),
  wxLast: document.getElementById('wxLast'),
  wxTa: document.getElementById('wxTa'),
  wxUa: document.getElementById('wxUa'),
  wxPa: document.getElementById('wxPa'),
  wxSx: document.getElementById('wxSx'),
  wxDx: document.getElementById('wxDx'),
  wxRc: document.getElementById('wxRc'),
  wxWh: document.getElementById('wxWh'),
  wxWc: document.getElementById('wxWc'),
  wxHj: document.getElementById('wxHj'),
  wxDp: document.getElementById('wxDp'),
  saveBanner: document.getElementById('saveBanner')
};

let isDirty = false;
let lastConfig = null;

function setDirty(dirty) {
  isDirty = dirty;
  if (isDirty) els.saveBanner.classList.remove('hidden');
  else els.saveBanner.classList.add('hidden');
}

function formatDuration(ms) {
  if (!ms) return '-';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString();
}

function setSelectOptions(el, values, current) {
  const seen = new Set();
  const uniq = [];
  for (const v of values) {
    const value = v.value ?? v;
    if (seen.has(value)) continue;
    seen.add(value);
    uniq.push(v);
  }
  el.innerHTML = '';
  for (const v of uniq) {
    const opt = document.createElement('option');
    opt.value = v.value ?? v;
    opt.textContent = v.label ?? v;
    el.appendChild(opt);
  }
  if (current && uniq.some((v) => (v.value ?? v) === current)) {
    el.value = current;
  }
}

function setPill(status, label) {
  els.statusPill.className = `pill ${status}`;
  els.statusPill.textContent = label;
}

function setSmallPill(el, status, label) {
  el.className = `pill ${status}`;
  el.textContent = label;
}

function updateStatus(data) {
  els.connected.textContent = data.connected ? 'Yes' : 'No';
  els.targetHost.textContent = data.targetHost || '-';
  els.connDuration.textContent = formatDuration(data.connectionDurationMs);
  els.lastConn.textContent = formatTime(data.lastConnection);
  els.lastSendStatus.textContent = data.lastSendStatus != null ? data.lastSendStatus : '-';
  els.lastSendError.textContent = data.lastSendError || '-';
  els.nmeaConnected.textContent = data.nmeaConnected ? 'Yes' : 'No';
  els.nmeaSource.textContent = data.lastNmeaSource || '-';
  els.lastNmea.textContent = formatTime(data.lastNmeaAt);

  const nc = data.nmeaConfig || {};
  els.nmeaCfgEnabled.textContent = nc.enabled ? 'Yes' : 'No';
  els.nmeaCfgProtocol.textContent = nc.protocol || '-';
  els.nmeaCfgHost.textContent = nc.host || '-';
  els.nmeaCfgPort.textContent = nc.port ? `${nc.port}` : '-';

  const n = data.nmea || {};
  els.fix.textContent = n.fixValid ? 'VALID' : 'NO-FIX';
  els.lat.textContent = n.lat != null ? n.lat.toFixed(6) : '-';
  els.lon.textContent = n.lon != null ? n.lon.toFixed(6) : '-';
  els.heading.textContent = n.courseT != null ? `${n.courseT.toFixed(1)}°` : '-';
  els.speed.textContent = n.speedMph != null ? `${n.speedMph.toFixed(1)} mph` : '-';
  els.sats.textContent = n.sats != null ? n.sats : '-';
  els.hdop.textContent = n.hdop != null ? n.hdop.toFixed(1) : '-';
  els.alt.textContent = n.altM != null ? `${n.altM.toFixed(1)} m` : '-';

  const w = data.weather || {};
  const wd = w.data || {};
  const valid = (v) => v != null && v !== -999 && Number.isFinite(v);
  const numFmt = (v, digits, suffix = '') => (valid(v) ? `${v.toFixed(digits)}${suffix}` : '-');

  const savedPort = lastConfig && lastConfig.weatherPort ? lastConfig.weatherPort : '';
  const savedBaud = lastConfig && lastConfig.weatherBaud ? lastConfig.weatherBaud : '4800';
  const currentPort = els.weatherPort.value || savedPort || '';
  const currentBaud = els.weatherBaud.value || savedBaud || '4800';
  const portOptions = [
    { value: '', label: 'Select port' },
    ...((w.availablePorts || []).map((p) => ({ value: p, label: p })))
  ];
  const baudOptions = [
    { value: '4800', label: '4800' },
    { value: '9600', label: '9600' },
    { value: '19200', label: '19200' },
    { value: '38400', label: '38400' },
    { value: '57600', label: '57600' },
    { value: '115200', label: '115200' }
  ];

  if (currentPort && !portOptions.some((o) => o.value === currentPort)) {
    portOptions.push({ value: currentPort, label: `Saved (${currentPort})` });
  }
  if (currentBaud && !baudOptions.some((o) => o.value === currentBaud)) {
    baudOptions.push({ value: currentBaud, label: `Saved (${currentBaud})` });
  }

  setSelectOptions(els.weatherPort, portOptions, currentPort);
  setSelectOptions(els.weatherBaud, baudOptions, currentBaud);

  els.wxPort.textContent = w.port || '-';
  els.wxBaud.textContent = w.baud ? `${w.baud}` : '-';
  els.wxLast.textContent = formatTime(w.lastSerialAt);
  els.wxTa.textContent = numFmt(wd.Ta, 1, ' °F');
  els.wxUa.textContent = numFmt(wd.Ua, 0, ' %');
  els.wxPa.textContent = numFmt(wd.Pa, 3, ' inHg');
  els.wxSx.textContent = numFmt(wd.Sx, 1, ' mph');
  els.wxDx.textContent = numFmt(wd.Dx, 0, '°');
  els.wxRc.textContent = numFmt(wd.Rc, 2, ' in');
  els.wxWh.textContent = numFmt(wd.Wh, 1, ' mph');
  els.wxWc.textContent = numFmt(wd.Wc, 1, ' °F');
  els.wxHj.textContent = numFmt(wd.Hj, 1, ' °F');
  els.wxDp.textContent = numFmt(wd.Dp, 1, ' °F');

  if (data.connected && data.sending) setPill('ok', 'Sending');
  else if (data.sending) setPill('warn', 'Sending (No ACK)');
  else setPill('idle', 'Idle');

  const gpsDummyMode = data.gpsDummyMode || 'off';
  const gpsEnabled = data.nmeaConfig && data.nmeaConfig.enabled;
  if (!gpsEnabled) setSmallPill(els.gpsPill, 'idle', 'GPS Off');
  else if (gpsDummyMode && gpsDummyMode !== 'off') setSmallPill(els.gpsPill, 'warn', 'GPS Dummy');
  else if (data.nmeaConnected) setSmallPill(els.gpsPill, 'ok', 'GPS');
  else setSmallPill(els.gpsPill, 'err', 'GPS Missing');

  const wxCfg = data.weatherConfig || {};
  if (!wxCfg.enabled) setSmallPill(els.wxPill, 'idle', 'WX Off');
  else if (wxCfg.dummyMode && wxCfg.dummyMode !== 'off') setSmallPill(els.wxPill, 'warn', 'WX Dummy');
  else if (data.weather && data.weather.connected) setSmallPill(els.wxPill, 'ok', 'WX');
  else setSmallPill(els.wxPill, 'err', 'WX Missing');
}

function getFormConfig() {
  return {
    targetUrl: els.targetUrl.value.trim(),
    deviceId: els.deviceId.value.trim(),
    sendIntervalMs: parseInt(els.sendIntervalMs.value || '1000', 10),
    autoStart: !!els.autoStart.checked,
    gpsDummyMode: els.gpsDummyMode.value,
    nmeaProtocol: els.nmeaProtocol.value,
    nmeaHost: els.nmeaHost.value.trim(),
    nmeaPort: parseInt(els.nmeaPort.value || '55001', 10),
    nmeaEnabled: els.nmeaEnabled.value === 'true',
    weatherEnabled: els.weatherEnabled.value === 'true',
    weatherPort: els.weatherPort.value,
    weatherBaud: els.weatherBaud.value,
    weatherDummyMode: els.weatherDummyMode.value
  };
}

function applyConfig(cfg) {
  lastConfig = { ...cfg };
  els.targetUrl.value = cfg.targetUrl || '';
  els.deviceId.value = cfg.deviceId || '';
  els.sendIntervalMs.value = cfg.sendIntervalMs || 1000;
  els.autoStart.checked = !!cfg.autoStart;
  els.gpsDummyMode.value = cfg.gpsDummyMode || 'off';
  els.nmeaProtocol.value = cfg.nmeaProtocol || 'udp';
  els.nmeaHost.value = cfg.nmeaHost || '';
  els.nmeaPort.value = cfg.nmeaPort || 55001;
  els.nmeaEnabled.value = cfg.nmeaEnabled ? 'true' : 'false';
  els.weatherEnabled.value = cfg.weatherEnabled ? 'true' : 'false';
  els.weatherPort.value = cfg.weatherPort || '';
  els.weatherBaud.value = cfg.weatherBaud || '4800';
  els.weatherDummyMode.value = cfg.weatherDummyMode || 'off';
  setDirty(false);
}

window.api.getConfig().then(applyConfig);

const dirtyFields = [
  els.targetUrl,
  els.deviceId,
  els.sendIntervalMs,
  els.autoStart,
  els.gpsDummyMode,
  els.nmeaProtocol,
  els.nmeaHost,
  els.nmeaPort,
  els.nmeaEnabled,
  els.weatherEnabled,
  els.weatherPort,
  els.weatherBaud,
  els.weatherDummyMode
];

for (const el of dirtyFields) {
  if (!el) continue;
  el.addEventListener('change', () => setDirty(true));
  el.addEventListener('input', () => setDirty(true));
}

els.saveBtn.addEventListener('click', async () => {
  const cfg = getFormConfig();
  const saved = await window.api.setConfig(cfg);
  applyConfig(saved);
  setDirty(false);
});

els.saveBanner.addEventListener('click', async () => {
  if (!isDirty) return;
  const cfg = getFormConfig();
  const saved = await window.api.setConfig(cfg);
  applyConfig(saved);
  setDirty(false);
});

els.startBtn.addEventListener('click', async () => {
  await window.api.setConfig(getFormConfig());
  await window.api.startSending();
});

els.stopBtn.addEventListener('click', async () => {
  await window.api.stopSending();
});

window.api.onStatus(updateStatus);
