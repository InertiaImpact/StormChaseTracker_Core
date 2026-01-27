const els = {
  listenHost: document.getElementById('listenHost'),
  listenPort: document.getElementById('listenPort'),
  ingestPath: document.getElementById('ingestPath'),
  saveBtn: document.getElementById('saveBtn'),
  statusPill: document.getElementById('status-pill'),
  listening: document.getElementById('listening'),
  connected: document.getElementById('connected'),
  senderIp: document.getElementById('senderIp'),
  connDuration: document.getElementById('connDuration'),
  lastConn: document.getElementById('lastConn'),
  serverError: document.getElementById('serverError'),
  payload: document.getElementById('payload')
};

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

function setPill(status, label) {
  els.statusPill.className = `pill ${status}`;
  els.statusPill.textContent = label;
}

function updateStatus(data) {
  els.listening.textContent = data.listening ? 'Yes' : 'No';
  els.connected.textContent = data.connected ? 'Yes' : 'No';
  els.senderIp.textContent = data.lastSenderIp || '-';
  els.connDuration.textContent = formatDuration(data.durationMs);
  els.lastConn.textContent = formatTime(data.lastUpdateAt);
  els.serverError.textContent = data.serverError || '-';
  els.payload.textContent = data.lastPayload ? JSON.stringify(data.lastPayload, null, 2) : '-';

  if (data.connected) setPill('ok', 'Receiving');
  else if (data.listening) setPill('warn', 'Listening');
  else setPill('idle', 'Stopped');
}

function getFormConfig() {
  return {
    listenHost: els.listenHost.value.trim(),
    listenPort: parseInt(els.listenPort.value || '80', 10),
    ingestPath: els.ingestPath.value.trim()
  };
}

function applyConfig(cfg) {
  els.listenHost.value = cfg.listenHost || '0.0.0.0';
  els.listenPort.value = cfg.listenPort || 80;
  els.ingestPath.value = cfg.ingestPath || '/ingest';
}

window.api.getConfig().then(applyConfig);

els.saveBtn.addEventListener('click', async () => {
  const cfg = getFormConfig();
  const saved = await window.api.setConfig(cfg);
  applyConfig(saved);
});

window.api.onStatus(updateStatus);
