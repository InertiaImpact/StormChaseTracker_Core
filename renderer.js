const els = {
  statusPill: document.getElementById('status-pill'),
  statusPillLabel: document.getElementById('statusPillLabel'),
  statusPollTimer: document.getElementById('statusPollTimer'),
  source: document.getElementById('source'),
  updated: document.getElementById('updated'),
  age: document.getElementById('age'),
  heading: document.getElementById('heading'),
  speed: document.getElementById('speed'),
  location: document.getElementById('location'),
  coords: document.getElementById('coords'),
  mapOverlayLocation: document.getElementById('mapOverlayLocation'),
  mapOverlayHeading: document.getElementById('mapOverlayHeading'),
  followToggle: document.getElementById('followToggle'),
  followZoom: document.getElementById('followZoom'),
  styleSelect: document.getElementById('styleSelect'),
  localDataUrl: document.getElementById('localDataUrl'),
  localFailoverSeconds: document.getElementById('localFailoverSeconds'),
  localRecheckSeconds: document.getElementById('localRecheckSeconds'),
  updateIntervalSeconds: document.getElementById('updateIntervalSeconds'),
  webPollIntervalSeconds: document.getElementById('webPollIntervalSeconds'),
  idlePollIntervalSeconds: document.getElementById('idlePollIntervalSeconds'),
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
  xpressionEnabled: document.getElementById('xpressionEnabled'),
  xpressionOutputPath: document.getElementById('xpressionOutputPath'),
  intellishiftEnabled: document.getElementById('intellishiftEnabled'),
  intellishiftBaseUrl: document.getElementById('intellishiftBaseUrl'),
  intellishiftAuthUrl: document.getElementById('intellishiftAuthUrl'),
  intellishiftVehicleId: document.getElementById('intellishiftVehicleId'),
  intellishiftAuthorizeBtn: document.getElementById('intellishiftAuthorizeBtn'),
  intellishiftTokenPill: document.getElementById('intellishiftTokenPill'),
  intellishiftTokenText: document.getElementById('intellishiftTokenText'),
  intellishiftAccountName: document.getElementById('intellishiftAccountName'),
  intellishiftRefreshBtn: document.getElementById('intellishiftRefreshBtn'),
  testingForceSource: document.getElementById('testingForceSource'),
  authModal: document.getElementById('authModal'),
  authUsername: document.getElementById('authUsername'),
  authPassword: document.getElementById('authPassword'),
  authCancelBtn: document.getElementById('authCancelBtn'),
  authSaveBtn: document.getElementById('authSaveBtn'),
  saveBanner: document.getElementById('saveBanner'),
  saveBtn: document.getElementById('saveBtn'),
  pollNowBtn: document.getElementById('pollNowBtn'),
  localStatus: document.getElementById('localStatus'),
  lastError: document.getElementById('lastError'),
  configPanel: document.getElementById('configPanel'),
  mapFullscreenBtn: document.getElementById('mapFullscreenBtn')
};

let map = null;
let baseMarker = null;
let headingMarker = null;
let mapFullscreen = false;
let baseLayers = null;
let activeBaseLayer = null;
let visibilityButtons = null;
let followEnabled = true;
let followZoomValue = 13;
let lastPosition = null;
let styleSelect = null;
let currentConfig = null;
let intellishiftVehiclesLoaded = false;
let intellishiftVehicleMap = new Map();
let isDirty = false;
let isSaving = false;
let pollCountdownTimer = null;
let nextPollAt = null;
let lastMapData = null;
let lastMapStatus = null;
const ROAD_WARRIOR_ICON_WIDTH = 60;
let roadWarriorIconSize = { width: ROAD_WARRIOR_ICON_WIDTH, height: ROAD_WARRIOR_ICON_WIDTH };
const roadWarriorImage = new Image();
roadWarriorImage.onload = () => {
  const w = roadWarriorImage.naturalWidth || ROAD_WARRIOR_ICON_WIDTH;
  const h = roadWarriorImage.naturalHeight || ROAD_WARRIOR_ICON_WIDTH;
  const scaledHeight = Math.max(1, Math.round((ROAD_WARRIOR_ICON_WIDTH * h) / w));
  roadWarriorIconSize = { width: ROAD_WARRIOR_ICON_WIDTH, height: scaledHeight };
  if (baseMarker) baseMarker.setIcon(createRoadWarriorIcon());
};
roadWarriorImage.src = './assets/RoadWarrior.png';

function setDirty(dirty) {
  isDirty = dirty;
  if (!els.saveBanner) return;
  if (isDirty) els.saveBanner.classList.remove('hidden');
  else els.saveBanner.classList.add('hidden');
}

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
    if (lastMapData && lastMapStatus) {
      updateMap(lastMapData, lastMapStatus);
    }
  });
}

function createHeadingIcon(deg) {
  const rotation = typeof deg === 'number' ? deg : 0;
  return L.divIcon({
    className: 'heading-icon',
    html: `<div class="arrow" style="transform: rotate(${rotation}deg)"></div>`,
    iconSize: [20, 22],
    iconAnchor: [10, 11]
  });
}

function isStationary(data) {
  return typeof data?.speedMph === 'number' && data.speedMph < 1;
}

function getHeadingOffsetLatLng(lat, lon, headingDeg, pixels = 22) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return [lat, lon];
  if (!map) return [lat, lon];
  const zoom = map.getZoom();
  const point = map.project([lat, lon], zoom);
  const rad = (typeof headingDeg === 'number' ? headingDeg : 0) * Math.PI / 180;
  const dx = Math.sin(rad) * pixels;
  const dy = -Math.cos(rad) * pixels;
  const nextPoint = L.point(point.x + dx, point.y + dy);
  const nextLatLng = map.unproject(nextPoint, zoom);
  return [nextLatLng.lat, nextLatLng.lng];
}

function createRoadWarriorIcon() {
  const width = roadWarriorIconSize.width || ROAD_WARRIOR_ICON_WIDTH;
  const height = roadWarriorIconSize.height || ROAD_WARRIOR_ICON_WIDTH;
  return L.icon({
    iconUrl: './assets/RoadWarrior.png',
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), Math.round(height / 2)]
  });
}

function createUnitCircleIcon(label) {
  const safeLabel = label ? String(label) : '';
  return L.divIcon({
    className: 'unit-marker',
    html: `<div class="unit-marker__circle">${safeLabel}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function getSelectedIntellishiftVehicle() {
  const vehicleId = currentConfig?.dataSource?.intellishift?.vehicleId;
  const name = vehicleId ? intellishiftVehicleMap.get(String(vehicleId)) : null;
  return { id: vehicleId ? String(vehicleId) : null, name };
}

function isRoadWarriorSelected() {
  const { name } = getSelectedIntellishiftVehicle();
  return !!(name && /road\s*warrior/i.test(name));
}

function getUnitLabel() {
  const { id, name } = getSelectedIntellishiftVehicle();
  if (name) {
    const match = name.match(/(\d+)/);
    if (match) return match[1];
    return name.length > 6 ? name.slice(0, 6) : name;
  }
  return id || '';
}

function getBaseMarkerIcon(status) {
  const sourceKey = String(status?.lastSource || '').toLowerCase();
  if (sourceKey.includes('intellishift')) {
    return isRoadWarriorSelected()
      ? createRoadWarriorIcon()
      : createUnitCircleIcon(getUnitLabel());
  }
  if (sourceKey.includes('netcloud') || sourceKey.includes('edge')) {
    return createRoadWarriorIcon();
  }
  return createRoadWarriorIcon();
}

function getHeadingOffsetPixels(status) {
  const sourceKey = String(status?.lastSource || '').toLowerCase();
  if (sourceKey.includes('intellishift') && !isRoadWarriorSelected()) {
    return 32;
  }
  return 34;
}

function formatTime(unixSeconds) {
  if (!unixSeconds) return '-';
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString();
}

function setPill(status, label) {
  els.statusPill.className = `pill ${status}`;
  if (els.statusPillLabel) {
    els.statusPillLabel.textContent = label;
  } else {
    els.statusPill.textContent = label;
  }
}

function updatePollCountdown() {
  if (!els.statusPollTimer) return;
  if (!nextPollAt) {
    els.statusPollTimer.textContent = '--';
    return;
  }
  const remaining = Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000));
  els.statusPollTimer.textContent = `${remaining}s`;
}

function setNextPollCountdown(seconds) {
  if (!els.statusPollTimer) return;
  if (!Number.isFinite(seconds)) {
    nextPollAt = null;
    updatePollCountdown();
    return;
  }
  nextPollAt = Date.now() + Math.max(0, seconds) * 1000;
  updatePollCountdown();
  if (!pollCountdownTimer) {
    pollCountdownTimer = setInterval(updatePollCountdown, 1000);
  }
}


function formatLocation(data) {
  if (!data) return '-';
  const parts = [data.streetName, data.townName, data.countyName, data.stateName].filter(Boolean);
  return parts.length ? parts.join(', ') : '-';
}

function formatTownState(data) {
  if (!data) return '-';
  const parts = [data.townName, data.stateName].filter(Boolean);
  return parts.length ? parts.join(', ') : '-';
}

function formatHeadingDirection(deg) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return '-';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45);
  return directions[idx] || '-';
}

function updateMap(data, status) {
  if (!data) return;
  const lat = data.latitude;
  const lon = data.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return;

  if (!map) initMap();

  lastMapData = data;
  lastMapStatus = status;

  lastPosition = [lat, lon];

  const baseIcon = getBaseMarkerIcon(status);
  if (!baseMarker) {
    baseMarker = L.marker([lat, lon], { icon: baseIcon, interactive: false }).addTo(map);
    map.setView([lat, lon], followZoomValue, { animate: true, duration: 0.6 });
  } else {
    baseMarker.setLatLng([lat, lon]);
    baseMarker.setIcon(baseIcon);
  }

  const headingValid = typeof data.headingDeg === 'number' && !Number.isNaN(data.headingDeg);
  const showHeading = headingValid && !isStationary(data);
  if (showHeading) {
    const headingPos = getHeadingOffsetLatLng(lat, lon, data.headingDeg, getHeadingOffsetPixels(status));
    if (!headingMarker) {
      headingMarker = L.marker(headingPos, { icon: createHeadingIcon(data.headingDeg), interactive: false }).addTo(map);
    } else {
      headingMarker.setLatLng(headingPos);
      headingMarker.setIcon(createHeadingIcon(data.headingDeg));
      if (!map.hasLayer(headingMarker)) headingMarker.addTo(map);
    }
  } else if (headingMarker && map.hasLayer(headingMarker)) {
    map.removeLayer(headingMarker);
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
  currentConfig = cfg;
  const dataSource = cfg.dataSource || {};
  const cradlepoint = cfg.cradlepoint || {};
  const geocode = cfg.geocode || {};
  const xpression = cfg.xpressionConnector || {};
  const intellishift = dataSource.intellishift || {};

  els.localDataUrl.value = dataSource.localDataUrl ?? '';
  els.localFailoverSeconds.value = dataSource.localFailoverSeconds ?? 30;
  els.localRecheckSeconds.value = dataSource.localRecheckSeconds ?? 60;
  els.updateIntervalSeconds.value = cfg.updateIntervalSeconds ?? 5;
  if (els.webPollIntervalSeconds) {
    els.webPollIntervalSeconds.value = cfg.webPollIntervalSeconds ?? 5;
  }
  if (els.idlePollIntervalSeconds) {
    els.idlePollIntervalSeconds.value = cfg.idlePollIntervalSeconds ?? 120;
  }

  if (els.cloudEnabled) {
    els.cloudEnabled.checked = !!(cradlepoint.cloudEnabled ?? true);
  }
  els.cloudStaleSeconds.value = cradlepoint.cloudStaleSeconds ?? 300;
  els.cloudUrl.value = cradlepoint.cloudUrl ?? '';
  els.cloudApiId.value = cradlepoint.cloudApiId ?? '';
  els.cloudApiKey.value = cradlepoint.cloudApiKey ?? '';
  els.cloudEcmApiId.value = cradlepoint.cloudEcmApiId ?? '';
  els.cloudEcmApiKey.value = cradlepoint.cloudEcmApiKey ?? '';
  els.cloudReferer.value = cradlepoint.cloudReferer ?? '';
  els.cloudUserAgent.value = cradlepoint.cloudUserAgent ?? '';

  els.geocodeUrl.value = geocode.geocodeUrl ?? '';
  els.geocodeApiKey.value = geocode.geocodeApiKey ?? '';

  if (els.xpressionEnabled) {
    els.xpressionEnabled.checked = !!(xpression.enabled ?? false);
  }
  if (els.xpressionOutputPath) {
    els.xpressionOutputPath.value = xpression.outputPath ?? '';
  }

  if (els.intellishiftEnabled) {
    els.intellishiftEnabled.checked = !!(intellishift.enabled ?? false);
  }
  if (els.intellishiftBaseUrl) {
    els.intellishiftBaseUrl.value = intellishift.baseUrl ?? '';
  }
  if (els.intellishiftAuthUrl) {
    els.intellishiftAuthUrl.value = intellishift.authUrl ?? '';
  }
  if (els.intellishiftVehicleId) {
    els.intellishiftVehicleId.value = intellishift.vehicleId ?? '';
  }
  if (els.testingForceSource) {
    els.testingForceSource.value = cfg.testing?.forceSource ?? 'off';
  }

  setDirty(false);
}

function getFormConfig() {
  return {
    updateIntervalSeconds: Number(els.updateIntervalSeconds.value || 5),
    webPollIntervalSeconds: Number(els.webPollIntervalSeconds?.value || 5),
    idlePollIntervalSeconds: Number(els.idlePollIntervalSeconds?.value || 120),
    dataSource: {
      localDataUrl: els.localDataUrl.value.trim(),
      localFailoverSeconds: Number(els.localFailoverSeconds.value || 30),
      localRecheckSeconds: Number(els.localRecheckSeconds.value || 60),
      intellishift: {
        enabled: !!els.intellishiftEnabled?.checked,
        baseUrl: els.intellishiftBaseUrl?.value.trim() || '',
        authUrl: els.intellishiftAuthUrl?.value.trim() || '',
        username: currentConfig?.dataSource?.intellishift?.username || '',
        password: currentConfig?.dataSource?.intellishift?.password || '',
        vehicleId: els.intellishiftVehicleId?.value || '',
        staleSeconds: currentConfig?.dataSource?.intellishift?.staleSeconds ?? 300
      }
    },
    cradlepoint: {
      cloudEnabled: !!els.cloudEnabled?.checked,
      cloudStaleSeconds: Number(els.cloudStaleSeconds.value || 300),
      cloudUrl: els.cloudUrl.value.trim(),
      cloudApiId: els.cloudApiId.value.trim(),
      cloudApiKey: els.cloudApiKey.value.trim(),
      cloudEcmApiId: els.cloudEcmApiId.value.trim(),
      cloudEcmApiKey: els.cloudEcmApiKey.value.trim(),
      cloudReferer: els.cloudReferer.value.trim(),
      cloudUserAgent: els.cloudUserAgent.value.trim()
    },
    geocode: {
      geocodeUrl: els.geocodeUrl.value.trim(),
      geocodeApiKey: els.geocodeApiKey.value.trim()
    },
    xpressionConnector: {
      enabled: !!els.xpressionEnabled?.checked,
      outputPath: els.xpressionOutputPath?.value.trim()
    },
    testing: {
      forceSource: els.testingForceSource?.value || 'off'
    }
  };
}

function setAuthModalVisible(show) {
  if (!els.authModal) return;
  els.authModal.classList.toggle('show', !!show);
  if (show && els.authUsername) {
    els.authUsername.focus();
  }
}

function updateIntellishiftTokenStatus(status) {
  if (!els.intellishiftTokenPill || !els.intellishiftTokenText) return;
  const valid = !!status?.valid;
  els.intellishiftTokenPill.classList.toggle('ok', valid);
  els.intellishiftTokenPill.classList.toggle('warn', !valid);
  els.intellishiftTokenText.textContent = valid
    ? `Authorized (${status?.expiresInSeconds ?? 0}s)`
    : status?.lastError || 'Authorization Required';

  if (els.intellishiftAccountName) {
    const account = status?.accountUsername ? status.accountUsername : '-';
    els.intellishiftAccountName.textContent = `Account: ${account}`;
  }

  if (els.intellishiftAuthorizeBtn) {
    els.intellishiftAuthorizeBtn.classList.toggle('pulse', !valid);
  }

  if (!valid) {
    intellishiftVehiclesLoaded = false;
  } else {
    refreshIntellishiftVehicles();
  }
}

function populateIntellishiftVehicles(vehicles, selectedId) {
  if (!els.intellishiftVehicleId) return;
  const current = selectedId ?? els.intellishiftVehicleId.value;
  intellishiftVehicleMap = new Map(vehicles.map((vehicle) => [String(vehicle.id), vehicle.name]));
  els.intellishiftVehicleId.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select vehicle...';
  els.intellishiftVehicleId.appendChild(placeholder);

  vehicles.forEach((vehicle) => {
    const opt = document.createElement('option');
    opt.value = String(vehicle.id);
    opt.textContent = vehicle.name;
    els.intellishiftVehicleId.appendChild(opt);
  });

  const idList = vehicles.map((vehicle) => String(vehicle.id));
  let nextSelected = current ? String(current) : '';
  if (!nextSelected && currentConfig?.dataSource?.intellishift?.vehicleId) {
    nextSelected = String(currentConfig.dataSource.intellishift.vehicleId);
  }
  if (!nextSelected || !idList.includes(nextSelected)) {
    nextSelected = idList[0] || '';
  }

  if (nextSelected) {
    const prevSelected = els.intellishiftVehicleId.value;
    els.intellishiftVehicleId.value = nextSelected;
    if (prevSelected !== nextSelected) {
      setDirty(true);
      saveConfigFromForm();
    }
  }

  intellishiftVehiclesLoaded = true;
}

async function refreshIntellishiftVehicles() {
  if (!els.intellishiftRefreshBtn) return;
  els.intellishiftRefreshBtn.disabled = true;
  try {
    const res = await window.api.intellishiftGetVehicles();
    if (res.ok) {
      populateIntellishiftVehicles(res.vehicles || [], els.intellishiftVehicleId?.value);
    }
  } finally {
    els.intellishiftRefreshBtn.disabled = false;
  }
}

function updateStatus(status) {
  const data = status.data || null;
  const age = status.dataAgeSeconds;
  const sourceLabel = String(status.lastSource || '');
  const sourceKey = sourceLabel.toLowerCase();

  els.source.textContent = status.lastSource || '-';
  els.updated.textContent = data?.updatedAtUnix ? formatTime(data.updatedAtUnix) : '-';
  els.age.textContent = typeof age === 'number' ? `${age}s` : '-';
  els.heading.textContent = data?.headingDeg != null ? `${Math.round(data.headingDeg)}°` : '-';
  els.speed.textContent = data?.speedMph != null ? `${data.speedMph.toFixed(1)} mph` : '-';
  els.location.textContent = formatLocation(data);
  els.coords.textContent = data ? `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}` : '-';
  if (els.mapOverlayLocation) {
    els.mapOverlayLocation.textContent = status.geocodingLocation || '';
  }
  if (els.mapOverlayHeading) {
    els.mapOverlayHeading.textContent = status.geocodingDirection ? `Traveling ${status.geocodingDirection}` : '';
  }
  if (status.useLocal) {
    els.localStatus.textContent = 'Primary (Edge)';
  } else if (sourceKey.includes('intellishift')) {
    els.localStatus.textContent = 'Fallback (Intellishift)';
  } else if (sourceKey.includes('netcloud')) {
    els.localStatus.textContent = 'Fallback (NetCloud)';
  } else if (sourceKey.includes('edge')) {
    els.localStatus.textContent = 'Fallback (Edge)';
  } else {
    els.localStatus.textContent = 'Fallback';
  }
  els.lastError.textContent = status.lastError || '-';

  if (data && status.isLive && sourceKey.includes('edge')) setPill('edge', 'Edge');
  else if (data && status.isLive && sourceKey.includes('netcloud')) setPill('netcloud', 'NetCloud');
  else if (data && status.isLive && sourceKey.includes('intellishift')) setPill('intellishift', 'Intellishift');
  else if (data && !status.isLive) setPill('stale', 'Stale');
  else setPill('offline', 'Offline');

  const nextSeconds = Number.isFinite(status?.nextPollInSeconds)
    ? status.nextPollInSeconds
    : (Number.isFinite(status?.pollIntervalSeconds) ? status.pollIntervalSeconds : null);
  setNextPollCountdown(nextSeconds);


  updateMap(data, status);
}

async function saveConfigFromForm() {
  isSaving = true;
  try {
    const saved = await window.api.setConfig(getFormConfig());
    applyConfig(saved);
    setDirty(false);
    return saved;
  } finally {
    isSaving = false;
  }
}

window.api.getConfig().then((cfg) => {
  applyConfig(cfg);
  window.api.intellishiftTokenStatus().then((status) => {
    updateIntellishiftTokenStatus(status);
    if (status?.valid) refreshIntellishiftVehicles();
  });
});

if (window.api?.onToggleConfig) {
  window.api.onToggleConfig((show) => setConfigVisible(!!show));
}

setConfigVisible(true);

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

const configInputs = Array.from(document.querySelectorAll('#configPanel input, #configPanel select, #configPanel textarea'));
configInputs.forEach((el) => {
  el.addEventListener('input', () => {
    if (isSaving) return;
    setDirty(true);
  });
  el.addEventListener('change', () => {
    if (isSaving) return;
    setDirty(true);
  });
});

if (els.saveBanner) {
  els.saveBanner.addEventListener('click', async () => {
    await saveConfigFromForm();
  });
}

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

if (els.intellishiftAuthorizeBtn) {
  els.intellishiftAuthorizeBtn.addEventListener('click', () => {
    if (els.authUsername) {
      els.authUsername.value = currentConfig?.dataSource?.intellishift?.username || '';
    }
    if (els.authPassword) {
      els.authPassword.value = currentConfig?.dataSource?.intellishift?.password || '';
    }
    setAuthModalVisible(true);
  });
}

if (els.authCancelBtn) {
  els.authCancelBtn.addEventListener('click', () => setAuthModalVisible(false));
}

if (els.authSaveBtn) {
  els.authSaveBtn.addEventListener('click', async () => {
    const nextCfg = getFormConfig();
    if (els.authUsername) {
      nextCfg.dataSource.intellishift.username = els.authUsername.value.trim();
    }
    if (els.authPassword) {
      nextCfg.dataSource.intellishift.password = els.authPassword.value;
    }

    const saved = await window.api.setConfig(nextCfg);
    applyConfig(saved);

    const authResult = await window.api.intellishiftAuthorize({
      username: els.authUsername?.value?.trim(),
      password: els.authPassword?.value || ''
    });

    if (authResult.ok) {
      setAuthModalVisible(false);
      refreshIntellishiftVehicles();
    } else {
      updateIntellishiftTokenStatus({ valid: false, lastError: authResult.message });
    }
  });
}

if (els.intellishiftRefreshBtn) {
  els.intellishiftRefreshBtn.addEventListener('click', refreshIntellishiftVehicles);
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
  await saveConfigFromForm();
});

if (els.pollNowBtn) {
  els.pollNowBtn.addEventListener('click', async () => {
    await window.api.pollNow();
  });
}

if (els.cloudEnabled) {
  els.cloudEnabled.addEventListener('change', saveConfigFromForm);
}

if (els.intellishiftEnabled) {
  els.intellishiftEnabled.addEventListener('change', saveConfigFromForm);
}

if (els.testingForceSource) {
  els.testingForceSource.addEventListener('change', saveConfigFromForm);
}

els.mapFullscreenBtn.addEventListener('click', () => {
  setMapFullscreen(!mapFullscreen);
});

window.api.onStatus(updateStatus);
window.api.onToggleConfig(setConfigVisible);
window.api.onIntellishiftTokenStatus(updateIntellishiftTokenStatus);

initMap();
