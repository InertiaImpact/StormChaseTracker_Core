let map = null;
let baseMarker = null;
let headingMarker = null;
let baseLayers = null;
let activeBaseLayer = null;
let followEnabled = true;
let followZoomValue = 13;
let lastPosition = null;
let pollTimer = null;
let pollIntervalSeconds = 5;
let pollCountdownTimer = null;
let nextPollAt = null;
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
roadWarriorImage.src = '/assets/RoadWarrior.png';

const els = {
  statusPill: document.getElementById('status-pill'),
  statusPillLabel: document.getElementById('statusPillLabel'),
  statusPollTimer: document.getElementById('statusPollTimer'),
  followToggle: document.getElementById('followToggle'),
  followZoom: document.getElementById('followZoom'),
  styleSelect: document.getElementById('styleSelect'),
  mapOverlayLocation: document.getElementById('mapOverlayLocation'),
  mapOverlayHeading: document.getElementById('mapOverlayHeading')
};

// ========== MAP CONFIGURATION ==========
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
    html: `<div class="arrow" style="transform: rotate(${rotation}deg)"></div>`,
    iconSize: [20, 22],
    iconAnchor: [10, 11]
  });
}

function createRoadWarriorIcon() {
  const width = roadWarriorIconSize.width || ROAD_WARRIOR_ICON_WIDTH;
  const height = roadWarriorIconSize.height || ROAD_WARRIOR_ICON_WIDTH;
  return L.icon({
    iconUrl: '/assets/RoadWarrior.png',
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

function isRoadWarriorData(status) {
  const sourceKey = String(status?.lastSource || '').toLowerCase();
  if (!sourceKey.includes('intellishift')) return true;
  const vehicleName = String(status?.data?.vehicleName || '');
  return /road\s*warrior/i.test(vehicleName);
}

function getUnitLabel(status) {
  const vehicleName = String(status?.data?.vehicleName || '');
  if (vehicleName) {
    const match = vehicleName.match(/(\d+)/);
    if (match) return match[1];
    return vehicleName.length > 6 ? vehicleName.slice(0, 6) : vehicleName;
  }
  const vehicleId = status?.data?.vehicleId;
  if (vehicleId !== null && vehicleId !== undefined && vehicleId !== '') return String(vehicleId);
  return '';
}

function getBaseMarkerIcon(status) {
  const sourceKey = String(status?.lastSource || '').toLowerCase();
  if (sourceKey.includes('intellishift')) {
    return isRoadWarriorData(status)
      ? createRoadWarriorIcon()
      : createUnitCircleIcon(getUnitLabel(status));
  }
  if (sourceKey.includes('netcloud') || sourceKey.includes('edge')) {
    return createRoadWarriorIcon();
  }
  return createRoadWarriorIcon();
}

function getHeadingOffsetPixels(status) {
  const sourceKey = String(status?.lastSource || '').toLowerCase();
  if (sourceKey.includes('intellishift') && !isRoadWarriorData(status)) {
    return 32;
  }
  return 34;
}

function formatTime(unixSeconds) {
  if (!unixSeconds) return '-';
  return new Date(unixSeconds * 1000).toLocaleString();
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

function headingTextFromDeg(deg) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return '';
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest', 'North'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45);
  return directions[idx] || '';
}

function formatCounty(countyName) {
  if (!countyName) return '';
  return /county/i.test(countyName) ? countyName : `${countyName} County`;
}

// ========== DATA SOURCE CONFIG ==========
function updateMap(data, status) {
  if (!data) return;
  const lat = data.latitude;
  const lon = data.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return;

  if (!map) initMap();

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

function updateStatus(status) {
  const data = status.data || null;
  const sourceKey = String(status.lastSource || '').toLowerCase();

  if (data && status.isLive && sourceKey.includes('edge')) setPill('ok', 'Live');
  else if (data && status.isLive && sourceKey.includes('netcloud')) setPill('warn', 'Live NetCloud');
  else if (data && status.isLive && sourceKey.includes('intellishift')) setPill('warn', 'Live Intellishift');
  else if (data && !status.isLive) setPill('warn', 'Stale');
  else setPill('offline', 'Offline');

  if (els.mapOverlayLocation) {
    const direction = headingTextFromDeg(data?.headingDeg);
    const road = data?.streetName || 'Unspecified Road';
    const travelLine = direction ? `Traveling ${direction}\non ${road}` : `Traveling\non ${road}`;
    els.mapOverlayLocation.textContent = data ? travelLine : '';
  }
  if (els.mapOverlayHeading) {
    const cityOrCounty = data?.townName || formatCounty(data?.countyName);
    els.mapOverlayHeading.textContent = data ? (cityOrCounty || '') : '';
  }

  updateMap(data, status);

  const nextInterval = Number(status.webPollIntervalSeconds || 5);
  if (Number.isFinite(nextInterval) && nextInterval > 0 && nextInterval !== pollIntervalSeconds) {
    pollIntervalSeconds = nextInterval;
    schedulePoll();
  }
}

// ========== API POLLING CONFIG ==========
async function poll() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updateStatus(data);
  } catch {
    setPill('offline', 'Offline');
  } finally {
    setNextPollCountdown(pollIntervalSeconds);
  }
}

function schedulePoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, Math.max(1, pollIntervalSeconds) * 1000);
  setNextPollCountdown(pollIntervalSeconds);
}

initMap();

// ========== EVENT LISTENERS CONFIG ==========
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

if (els.styleSelect) {
  els.styleSelect.addEventListener('change', () => {
    const nextKey = els.styleSelect.value;
    if (!map || !baseLayers || !baseLayers[nextKey]) return;
    if (activeBaseLayer) map.removeLayer(activeBaseLayer);
    activeBaseLayer = baseLayers[nextKey];
    activeBaseLayer.addTo(map);
  });
}
poll();
schedulePoll();
