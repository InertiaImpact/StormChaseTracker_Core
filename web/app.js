let map = null;
let marker = null;
let baseLayers = null;
let activeBaseLayer = null;
let followEnabled = true;
let followZoomValue = 13;
let lastPosition = null;

const els = {
  statusPill: document.getElementById('status-pill'),
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
    html: `<div class="arrow" style="transform: rotate(${rotation}deg)"></div>`
  });
}

function formatTime(unixSeconds) {
  if (!unixSeconds) return '-';
  return new Date(unixSeconds * 1000).toLocaleString();
}

function setPill(status, label) {
  els.statusPill.className = `pill ${status}`;
  els.statusPill.textContent = label;
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

// ========== DATA SOURCE CONFIG ==========
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

function updateStatus(status) {
  const data = status.data || null;
  const sourceKey = String(status.lastSource || '').toLowerCase();

  if (data && status.isLive && sourceKey.includes('edge')) setPill('ok', 'Live');
  else if (data && status.isLive && sourceKey.includes('netcloud')) setPill('warn', 'Live NetCloud');
  else if (data && status.isLive && sourceKey.includes('intellishift')) setPill('warn', 'Live Intellishift');
  else if (data && !status.isLive) setPill('warn', 'Stale');
  else setPill('offline', 'Offline');

  if (els.mapOverlayLocation) {
    els.mapOverlayLocation.textContent = status.geocodingLocation || '';
  }
  if (els.mapOverlayHeading) {
    els.mapOverlayHeading.textContent = status.geocodingDirection ? `Traveling ${status.geocodingDirection}` : '';
  }

  updateMap(data);
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
  }
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
setInterval(poll, 5000);
