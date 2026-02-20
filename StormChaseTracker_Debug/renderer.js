const els = {
  nmeaEnabled: document.getElementById('nmeaEnabled'),
  nmeaProtocol: document.getElementById('nmeaProtocol'),
  nmeaHost: document.getElementById('nmeaHost'),
  nmeaPort: document.getElementById('nmeaPort'),
  dummyBaseLat: document.getElementById('dummyBaseLat'),
  dummyBaseLon: document.getElementById('dummyBaseLon'),
  saveBtn: document.getElementById('saveBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  statusPill: document.getElementById('statusPill'),
  nmeaConnected: document.getElementById('nmeaConnected'),
  nmeaBindAddress: document.getElementById('nmeaBindAddress'),
  nmeaBindError: document.getElementById('nmeaBindError'),
  lastNmeaSource: document.getElementById('lastNmeaSource'),
  lastNmeaAt: document.getElementById('lastNmeaAt'),
  nmeaPackets: document.getElementById('nmeaPackets'),
  lastNmeaBytes: document.getElementById('lastNmeaBytes'),
  fixValid: document.getElementById('fixValid'),
  utcTime: document.getElementById('utcTime'),
  date: document.getElementById('date'),
  lat: document.getElementById('lat'),
  lon: document.getElementById('lon'),
  speedKn: document.getElementById('speedKn'),
  speedMph: document.getElementById('speedMph'),
  courseT: document.getElementById('courseT'),
  sats: document.getElementById('sats'),
  hdop: document.getElementById('hdop'),
  altM: document.getElementById('altM'),
  lastNmeaLine: document.getElementById('lastNmeaLine')
};

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

function fmt(v, digits = null) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  if (typeof v === 'number' && digits !== null) return v.toFixed(digits);
  return `${v}`;
}

function setPill(connected, listening) {
  if (!listening) {
    els.statusPill.className = 'pill idle';
    els.statusPill.textContent = 'Idle';
    return;
  }
  if (connected) {
    els.statusPill.className = 'pill ok';
    els.statusPill.textContent = 'Receiving';
    return;
  }
  els.statusPill.className = 'pill err';
  els.statusPill.textContent = 'Listening (No Data)';
}

function getFormConfig() {
  return {
    nmeaEnabled: els.nmeaEnabled.value === 'true',
    nmeaProtocol: els.nmeaProtocol.value,
    nmeaHost: els.nmeaHost.value.trim(),
    nmeaPort: parseInt(els.nmeaPort.value || '55001', 10),
    dummyBaseLat: parseFloat(els.dummyBaseLat.value || '42.0277'),
    dummyBaseLon: parseFloat(els.dummyBaseLon.value || '-91.6408')
  };
}

function applyConfig(cfg) {
  els.nmeaEnabled.value = cfg.nmeaEnabled ? 'true' : 'false';
  els.nmeaProtocol.value = cfg.nmeaProtocol || 'udp';
  els.nmeaHost.value = cfg.nmeaHost || '';
  els.nmeaPort.value = cfg.nmeaPort || 55001;
  els.dummyBaseLat.value = cfg.dummyBaseLat ?? 42.0277;
  els.dummyBaseLon.value = cfg.dummyBaseLon ?? -91.6408;
}

function updateStatus(data) {
  setPill(data.nmeaConnected, data.listening);

  els.nmeaConnected.textContent = data.nmeaConnected ? 'Yes' : 'No';
  els.nmeaBindAddress.textContent = data.nmeaBindAddress || '-';
  els.nmeaBindError.textContent = data.nmeaBindError || '-';
  els.lastNmeaSource.textContent = data.lastNmeaSource || '-';
  els.lastNmeaAt.textContent = formatTime(data.lastNmeaAt);
  els.nmeaPackets.textContent = `${data.nmeaPackets || 0}`;
  els.lastNmeaBytes.textContent = `${data.lastNmeaBytes || 0}`;

  const n = data.nmea || {};
  els.fixValid.textContent = n.fixValid ? 'VALID' : 'NO-FIX';
  els.utcTime.textContent = n.utcTime || '-';
  els.date.textContent = n.date || '-';
  els.lat.textContent = n.lat != null ? fmt(n.lat, 6) : '-';
  els.lon.textContent = n.lon != null ? fmt(n.lon, 6) : '-';
  els.speedKn.textContent = n.speedKn != null ? fmt(n.speedKn, 2) : '-';
  els.speedMph.textContent = n.speedMph != null ? fmt(n.speedMph, 2) : '-';
  els.courseT.textContent = n.courseT != null ? fmt(n.courseT, 1) : '-';
  els.sats.textContent = n.sats != null ? `${n.sats}` : '-';
  els.hdop.textContent = n.hdop != null ? fmt(n.hdop, 1) : '-';
  els.altM.textContent = n.altM != null ? fmt(n.altM, 1) : '-';

  els.lastNmeaLine.textContent = data.lastNmeaLine || '-';
}

els.saveBtn.addEventListener('click', async () => {
  const cfg = getFormConfig();
  const saved = await window.api.setConfig(cfg);
  applyConfig(saved);
});

els.startBtn.addEventListener('click', async () => {
  await window.api.setConfig(getFormConfig());
  await window.api.startNmea();
});

els.stopBtn.addEventListener('click', async () => {
  await window.api.stopNmea();
});

window.api.getConfig().then(applyConfig);
window.api.onStatus(updateStatus);
