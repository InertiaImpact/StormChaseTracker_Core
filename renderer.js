const els = {
  statusPill: document.getElementById('status-pill'),
  source: document.getElementById('source'),
  updated: document.getElementById('updated'),
  age: document.getElementById('age'),
  heading: document.getElementById('heading'),
  speed: document.getElementById('speed'),
  location: document.getElementById('location'),
  coords: document.getElementById('coords'),
  localDataUrl: document.getElementById('localDataUrl'),
  localFailoverSeconds: document.getElementById('localFailoverSeconds'),
  localRecheckSeconds: document.getElementById('localRecheckSeconds'),
  updateIntervalSeconds: document.getElementById('updateIntervalSeconds'),
  cloudEnabled: document.getElementById('cloudEnabled'),
  cloudStaleSeconds: document.getElementById('cloudStaleSeconds'),
  cloudUrl: document.getElementById('cloudUrl'),
  cloudApiId: document.getElementById('cloudApiId'),
  cloudApiKey: document.getElementById('cloudApiKey'),
  cloudEcmApiId: document.getElementById('cloudEcmApiId'),
  cloudEcmApiKey: document.getElementById('cloudEcmApiKey'),
  cloudReferer: document.getElementById('cloudReferer'),
  cloudUserAgent: document.getElementById('cloudUserAgent'),
  geocodeUrl: document.getElementById('geocodeUrl'),
  geocodeApiKey: document.getElementById('geocodeApiKey'),
  saveBtn: document.getElementById('saveBtn'),
  localStatus: document.getElementById('localStatus'),
  lastError: document.getElementById('lastError'),
  configPanel: document.getElementById('configPanel'),
  mapFullscreenBtn: document.getElementById('mapFullscreenBtn')
};

let map = null;
let marker = null;
let mapFullscreen = false;
let baseLayers = null;
let activeBaseLayer = null;
let visibilityButtons = null;
let followEnabled = true;
let followZoomValue = 13;
let lastPosition = null;
let styleSelect = null;

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([42.0277, -91.6408], 12);
  const standard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });
  const clean = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  });
  const night = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }
  );
  const hybridBase = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }
  );
  const hybridRoads = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Roads &copy; Esri'
    }
  );
  const hybridLabels = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Labels &copy; Esri'
    }
  );
  const hybrid = L.layerGroup([hybridBase, hybridRoads, hybridLabels]);

  baseLayers = {
    Standard: standard,
    Clean: clean,
    Night: night,
    Satellite: satellite,
    Hybrid: hybrid
  };

  activeBaseLayer = standard;
  activeBaseLayer.addTo(map);

  map.on('zoomend', () => {
    const zoom = map.getZoom();
    if (Number.isFinite(zoom)) {
      followZoomValue = zoom;
      if (els.followZoom) els.followZoom.value = String(zoom);
    }
  });
}

function createHeadingIcon(deg) {
  const rotation = typeof deg === 'number' ? deg : 0;
  return L.divIcon({
    className: 'heading-icon',
    html: `<div class="arrow" style="transform: rotate(${rotation}deg)"></div>`
  });
}

function formatTime(unixSeconds) {
  if (!unixSeconds) return '-';
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString();
}

function setPill(status, label) {
  els.statusPill.className = `pill ${status}`;
  els.statusPill.textContent = label;
}

function formatLocation(data) {
  if (!data) return '-';
  const parts = [data.streetName, data.townName, data.countyName].filter(Boolean);
  return parts.length ? parts.join(', ') : '-';
}

function updateMap(data) {
  if (!data) return;
  const lat = data.latitude;
  const lon = data.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return;

  if (!map) initMap();

  lastPosition = [lat, lon];

  if (!marker) {
    marker = L.marker([lat, lon], { icon: createHeadingIcon(data.headingDeg) }).addTo(map);
    map.setView([lat, lon], followZoomValue, { animate: true, duration: 0.6 });
  } else {
    marker.setLatLng([lat, lon]);
    marker.setIcon(createHeadingIcon(data.headingDeg));
  }

  if (followEnabled) {
    map.setView([lat, lon], followZoomValue, { animate: true, duration: 0.6 });
  }
}

function setConfigVisible(show) {
  if (!els.configPanel) return;
  els.configPanel.classList.toggle('hidden', !show);
}

function setMapFullscreen(enable) {
  mapFullscreen = !!enable;
  document.body.classList.toggle('map-fullscreen', mapFullscreen);
  if (map) {
    setTimeout(() => map.invalidateSize(), 100);
  }
  if (els.mapFullscreenBtn) {
    els.mapFullscreenBtn.textContent = mapFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map';
  }
}

function applyConfig(cfg) {
  els.localDataUrl.value = cfg.localDataUrl ?? '';
  els.localFailoverSeconds.value = cfg.localFailoverSeconds ?? 30;
  els.localRecheckSeconds.value = cfg.localRecheckSeconds ?? 60;
  els.updateIntervalSeconds.value = cfg.updateIntervalSeconds ?? 5;
  els.cloudEnabled.value = String(cfg.cloudEnabled ?? true);
  els.cloudStaleSeconds.value = cfg.cloudStaleSeconds ?? 300;
  els.cloudUrl.value = cfg.cloudUrl ?? '';
  els.cloudApiId.value = cfg.cloudApiId ?? '';
  els.cloudApiKey.value = cfg.cloudApiKey ?? '';
  els.cloudEcmApiId.value = cfg.cloudEcmApiId ?? '';
  els.cloudEcmApiKey.value = cfg.cloudEcmApiKey ?? '';
  els.cloudReferer.value = cfg.cloudReferer ?? '';
  els.cloudUserAgent.value = cfg.cloudUserAgent ?? '';
  els.geocodeUrl.value = cfg.geocodeUrl ?? '';
  els.geocodeApiKey.value = cfg.geocodeApiKey ?? '';
}

function getFormConfig() {
  return {
    localDataUrl: els.localDataUrl.value.trim(),
    localFailoverSeconds: Number(els.localFailoverSeconds.value || 30),
    localRecheckSeconds: Number(els.localRecheckSeconds.value || 60),
    updateIntervalSeconds: Number(els.updateIntervalSeconds.value || 5),
    cloudEnabled: els.cloudEnabled.value === 'true',
    cloudStaleSeconds: Number(els.cloudStaleSeconds.value || 300),
    cloudUrl: els.cloudUrl.value.trim(),
    cloudApiId: els.cloudApiId.value.trim(),
    cloudApiKey: els.cloudApiKey.value.trim(),
    cloudEcmApiId: els.cloudEcmApiId.value.trim(),
    cloudEcmApiKey: els.cloudEcmApiKey.value.trim(),
    cloudReferer: els.cloudReferer.value.trim(),
    cloudUserAgent: els.cloudUserAgent.value.trim(),
    geocodeUrl: els.geocodeUrl.value.trim(),
    geocodeApiKey: els.geocodeApiKey.value.trim()
  };
}

function updateStatus(status) {
  const data = status.data || null;
  const age = status.dataAgeSeconds;

  els.source.textContent = status.lastSource || '-';
  els.updated.textContent = data?.updatedAtUnix ? formatTime(data.updatedAtUnix) : '-';
  els.age.textContent = typeof age === 'number' ? `${age}s` : '-';
  els.heading.textContent = data?.headingDeg != null ? `${Math.round(data.headingDeg)}°` : '-';
  els.speed.textContent = data?.speedMph != null ? `${data.speedMph.toFixed(1)} mph` : '-';
  els.location.textContent = formatLocation(data);
  els.coords.textContent = data ? `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}` : '-';
  els.localStatus.textContent = status.useLocal ? 'Primary (Local)' : 'Fallback (Cloud)';
  els.lastError.textContent = status.lastError || '-';

  if (data && status.isLive && status.lastSource?.includes('Local')) setPill('ok', 'Receiving');
  else if (data && status.isLive && status.lastSource?.includes('Cloud')) setPill('warn', 'Fallback');
  else if (data && !status.isLive) setPill('idle', 'Stale');
  else setPill('idle', 'No Data');

  updateMap(data);
}

window.api.getConfig().then(applyConfig);

visibilityButtons = Array.from(document.querySelectorAll('.toggle-visibility'));
visibilityButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const nextType = input.type === 'password' ? 'text' : 'password';
    input.type = nextType;
    btn.textContent = nextType === 'password' ? 'Show' : 'Hide';
  });
});

if (els.followToggle) {
  els.followToggle.addEventListener('change', () => {
    followEnabled = els.followToggle.checked;
    if (followEnabled && lastPosition && map) {
      map.setView(lastPosition, followZoomValue, { animate: true, duration: 0.6 });
    }
  });
}

if (els.followZoom) {
  els.followZoom.addEventListener('input', () => {
    const nextZoom = Number(els.followZoom.value);
    if (!Number.isFinite(nextZoom) || !map) return;
    followZoomValue = nextZoom;
    map.setZoom(nextZoom);
  });
}

styleSelect = document.getElementById('styleSelect');
if (styleSelect) {
  styleSelect.addEventListener('change', () => {
    const nextKey = styleSelect.value;
    if (!map || !baseLayers || !baseLayers[nextKey]) return;
    if (activeBaseLayer) map.removeLayer(activeBaseLayer);
    activeBaseLayer = baseLayers[nextKey];
    activeBaseLayer.addTo(map);
  });
}

els.saveBtn.addEventListener('click', async () => {
  const saved = await window.api.setConfig(getFormConfig());
  applyConfig(saved);
});

els.mapFullscreenBtn.addEventListener('click', () => {
  setMapFullscreen(!mapFullscreen);
});

window.api.onStatus(updateStatus);
window.api.onToggleConfig(setConfigVisible);

initMap();
