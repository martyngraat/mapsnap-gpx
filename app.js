// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker geregistreerd', reg))
      .catch(err => console.error('Service Worker registratie mislukt', err));
  });
}

// --- App State ---
const state = {
  activeMode: 'nav', // nav, plan, measure, overlays, layers, poi
  
  // Geolocation & Telemetry
  userLocation: null,
  userLocationMarker: null,
  userAccuracyCircle: null,
  deviceHeading: null,
  watchId: null,
  
  // Track Recording (REC)
  recordingState: {
    isRecording: false,
    isPaused: false,
    startTime: null,
    elapsedTime: 0, // seconds
    distance: 0, // km
    points: [], // array of {lat, lng, ele, time}
    timerId: null,
    lastPosition: null
  },
  savedTracks: [],
  
  // Route Planner (BRouter)
  controlPoints: [], // Array of L.LatLng
  snappedCoordinates: [], // Array of [lon, lat, ele]
  waypointMarkers: [], // Draggable L.Marker on Leaflet
  routeLine: null, // Snapped route line (L.Polyline)
  rawLine: null, // Unsnapped route line (dashed)
  snapToPaths: true,
  brouterProfile: 'trekking', // trekking, hiking, fastbike, mtb, straight
  
  // Measurement Tool (Latje)
  measurePoints: [], // Array of L.LatLng
  measureMarkers: [], // Array of L.Marker
  measureLine: null, // L.Polyline
  
  // Custom Waypoints (POIs)
  savedWaypoints: [],
  waypointMarkersMap: [], // map markers references
  poiMarkers: [], // Overpass POI markers on map
  activePoiCategories: ['drinking_water', 'camp_site', 'viewpoint'],
  
  // Map Layers
  baseLayers: {},
  activeBaseLayerName: 'opentopo',
  topotijdreisLayer: null,
  activeOverlayYear: 1970
};

// --- DOM References ---
const el = {
  map: document.getElementById('map'),
  hudSpeed: document.getElementById('hud-speed'),
  hudElevation: document.getElementById('hud-elevation'),
  hudBearing: document.getElementById('hud-bearing'),
  hudCompassDir: document.getElementById('hud-compass-dir'),
  hudAccuracy: document.getElementById('hud-accuracy'),
  gpsStatus: document.getElementById('gps-status'),
  btnQuickSearch: document.getElementById('btn-quick-search'),
  btnLocate: document.getElementById('btn-locate'),
  btnPoiRefresh: document.getElementById('btn-poi-refresh'),
  recordingBanner: document.getElementById('recording-banner'),
  recDurationBanner: document.getElementById('rec-duration-banner'),
  recDistanceBanner: document.getElementById('rec-distance-banner'),
  
  // Drawer & Tabs
  bottomDrawer: document.getElementById('bottom-drawer'),
  drawerDragBar: document.getElementById('drawer-drag-bar'),
  activePanelTitle: document.getElementById('active-panel-title'),
  btnCloseDrawer: document.getElementById('btn-close-drawer'),
  navButtons: document.querySelectorAll('.nav-tab-btn'),
  drawerPanels: document.querySelectorAll('.drawer-panel'),
  
  // Rec Panel
  recTime: document.getElementById('rec-time'),
  recDistance: document.getElementById('rec-distance'),
  recAvgSpeed: document.getElementById('rec-avg-speed'),
  recElevation: document.getElementById('rec-elevation'),
  btnRecStart: document.getElementById('btn-rec-start'),
  btnRecPause: document.getElementById('btn-rec-pause'),
  btnRecStop: document.getElementById('btn-rec-stop'),
  savedTracksList: document.getElementById('saved-tracks-list'),
  btnForceUpdate: document.getElementById('btn-force-update'),
  
  // Planner Panel
  chkSnapBrouter: document.getElementById('chk-snap-brouter'),
  selectProfile: document.getElementById('select-profile'),
  statDistance: document.getElementById('stat-distance'),
  statPoints: document.getElementById('stat-points'),
  statEstTime: document.getElementById('stat-est-time'),
  btnPlanUndo: document.getElementById('btn-plan-undo'),
  btnPlanClear: document.getElementById('btn-plan-clear'),
  btnExportGpx: document.getElementById('btn-export-gpx'),
  
  // Measure Panel
  measureTotalDist: document.getElementById('measure-total-dist'),
  measureSegmentsList: document.getElementById('measure-segments-list'),
  btnMeasureClear: document.getElementById('btn-measure-clear'),
  
  // Layers Panel
  basemapRadios: document.getElementsByName('basemap'),
  topotijdreisControl: document.getElementById('topotijdreis-control'),
  topotijdreisYear: document.getElementById('topotijdreis-year'),
  topotijdreisYearVal: document.getElementById('topotijdreis-year-val'),
  
  // Overlays Panel
  overlayHiking: document.getElementById('overlay-hiking'),
  overlayCycling: document.getElementById('overlay-cycling'),
  overlayMtb: document.getElementById('overlay-mtb'),
  
  // POIs Panel
  btnPoiScan: document.getElementById('btn-poi-scan'),
  poiStatusLog: document.getElementById('poi-status-log'),
  btnAddWaypoint: document.getElementById('btn-add-waypoint'),
  savedWaypointsList: document.getElementById('saved-waypoints-list'),
  
  // Dialogs
  locationDialog: document.getElementById('location-dialog'),
  inputSearchLocation: document.getElementById('input-search-location'),
  btnSearchLocation: document.getElementById('btn-search-location'),
  searchResults: document.getElementById('search-results'),
  btnCloseLocationDialog: document.getElementById('btn-close-location-dialog'),
  guideDialog: document.getElementById('guide-dialog'),
  btnGuide: document.getElementById('btn-guide'),
  btnCloseGuide: document.getElementById('btn-close-guide'),
  toastContainer: document.getElementById('toast-container')
};

// --- Map Initialization ---
let map;
let hikingOverlay;
let cyclingOverlay;
let mtbOverlay;

function initMap() {
  // Utrecht defaults
  map = L.map('map', {
    zoomControl: false,
    tap: false
  }).setView([52.0907, 5.1214], 9);
  
  // Add Leaflet zoom control
  L.control.zoom({ position: window.innerWidth >= 768 ? 'topleft' : 'bottomright' }).addTo(map);

  // Basemaps definition
  state.baseLayers.opentopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Kaart: &copy; OSM-auteurs | Stijl: &copy; OpenTopoMap (CC-BY-SA)'
  });

  state.baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });

  state.baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
  });

  state.baseLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });

  // Default basemap is OpenTopoMap
  state.baseLayers.opentopo.addTo(map);

  // Overlays definition
  hikingOverlay = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.75
  });

  cyclingOverlay = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.75
  });

  mtbOverlay = L.tileLayer('https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.75
  });

  // Click handler on map
  map.on('click', onMapClick);
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupDrawerController();
  setupGeolocation();
  setupRecordingSystem();
  setupRoutePlanner();
  setupMeasurementTool();
  setupLayersManager();
  setupOverlaysManager();
  setupPoiExplorer();
  
  // LocalStorage check for items
  loadSavedData();
  
  // Show guide on first launch
  if (!localStorage.getItem('geoforge_guide_seen')) {
    el.guideDialog.showModal();
  }

  // Bind guide actions
  el.btnCloseGuide.addEventListener('click', () => {
    localStorage.setItem('geoforge_guide_seen', 'true');
    el.guideDialog.close();
  });

  // Cache reset handler
  if (el.btnForceUpdate) {
    el.btnForceUpdate.addEventListener('click', () => {
      if (confirm('Wil je de app forceer updaten en de cache leegmaken?')) {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
              registration.unregister();
            }
          });
        }
        if ('caches' in window) {
          caches.keys().then(names => {
            for (let name of names) {
              caches.delete(name);
            }
          });
        }
        setTimeout(() => {
          window.location.reload(true);
        }, 500);
      }
    });
  }
});

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- DRAWER & NAVIGATION CONTROLLER ---
function setupDrawerController() {
  // Toggle bottom drawer panels
  el.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.getAttribute('data-panel');
      switchPanel(panelId);
    });
  });

  el.btnCloseDrawer.addEventListener('click', closeDrawer);
  
  // Drag bar toggle
  el.drawerDragBar.addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-drawer') return;
    toggleDrawer();
  });

  // Search Address button
  el.btnQuickSearch.addEventListener('click', () => {
    el.locationDialog.showModal();
  });

  el.btnCloseLocationDialog.addEventListener('click', () => el.locationDialog.close());

  // Search Address API
  el.btnSearchLocation.addEventListener('click', searchLocationAddress);
}

function switchPanel(panelId) {
  // Update state mode
  state.activeMode = panelId;

  // Update tabs active state
  el.navButtons.forEach(btn => {
    if (btn.getAttribute('data-panel') === panelId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update panel views
  el.drawerPanels.forEach(panel => {
    if (panel.id === `panel-${panelId}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Update Title
  const titles = {
    dashboard: 'Dashboard / Track REC',
    planner: 'Route Planner',
    measure: 'Meetlatje (Ruler)',
    layers: 'Basiskaarten',
    overlays: 'Kaart Overlays',
    poi: 'POI & Waypoints'
  };
  el.activePanelTitle.textContent = titles[panelId] || 'Navigatie';

  // Make sure drawer is open
  openDrawer();

  // Invalidate map size
  setTimeout(() => map.invalidateSize(), 150);
}

function openDrawer() {
  el.bottomDrawer.className = ''; // Open state
}

function closeDrawer() {
  el.bottomDrawer.className = 'drawer-closed';
}

function toggleDrawer() {
  if (el.bottomDrawer.className === 'drawer-closed') {
    openDrawer();
  } else {
    closeDrawer();
  }
}

// Search address via OpenStreetMap Nominatim
function searchLocationAddress() {
  const query = el.inputSearchLocation.value.trim();
  if (!query) return;
  
  el.searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-secondary);">Zoeken...</div>';
  
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=4`)
    .then(res => res.json())
    .then(data => {
      el.searchResults.innerHTML = '';
      if (data.length === 0) {
        el.searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--color-red);">Geen locaties gevonden.</div>';
        return;
      }
      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = item.display_name;
        div.addEventListener('click', () => {
          map.setView([parseFloat(item.lat), parseFloat(item.lon)], 14);
          el.locationDialog.close();
          showToast(`Centreren op: ${item.display_name.split(',')[0]}`);
        });
        el.searchResults.appendChild(div);
      });
    })
    .catch(err => {
      console.error(err);
      el.searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--color-red);">Netwerkfout bij zoeken.</div>';
    });
}


// --- GPS GEOLOCATION & COMPASS TELEMETRY ---
function setupGeolocation() {
  if (!navigator.geolocation) {
    showToast('Geolocatie wordt niet ondersteund door je browser.', 'error');
    el.gpsStatus.innerHTML = '<span class="status-dot"></span>GEEN GPS';
    return;
  }

  // Locate me fab button
  el.btnLocate.addEventListener('click', () => {
    if (state.userLocation) {
      map.setView(state.userLocation, 16);
      showToast('Gecentreerd op huidige locatie.');
    } else {
      showToast('Wachten op GPS fix...', 'warning');
    }
  });

  // Watch Position
  state.watchId = navigator.geolocation.watchPosition(
    onLocationUpdate,
    onLocationError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );

  // Device orientation (Compass direction)
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
}

function onLocationUpdate(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = position.coords.accuracy;
  const speed = position.coords.speed !== null ? position.coords.speed * 3.6 : 0; // m/s to km/h
  const altitude = position.coords.altitude !== null ? Math.round(position.coords.altitude) : null;
  const heading = position.coords.heading !== null ? Math.round(position.coords.heading) : null;
  
  state.userLocation = L.latLng(lat, lng);
  
  // Status dot update
  const statusDot = el.gpsStatus.querySelector('.status-dot');
  if (state.recordingState.isRecording) {
    statusDot.className = 'status-dot recording';
    el.gpsStatus.innerHTML = '<span class="status-dot recording"></span>GPS REC';
  } else {
    statusDot.className = 'status-dot active';
    el.gpsStatus.innerHTML = '<span class="status-dot active"></span>GPS FIX';
  }

  // Update telemetry values
  el.hudSpeed.textContent = speed.toFixed(1);
  el.hudElevation.textContent = altitude !== null ? altitude : '---';
  el.hudAccuracy.textContent = Math.round(accuracy);
  
  if (heading !== null) {
    state.deviceHeading = heading;
    el.hudBearing.textContent = `${heading}°`;
    el.hudCompassDir.textContent = getCompassDirection(heading);
  }

  // Draw user marker
  if (!state.userLocationMarker) {
    state.userLocationMarker = L.marker(state.userLocation, { icon: userIconCreator() }).addTo(map);
    state.userAccuracyCircle = L.circle(state.userLocation, {
      radius: accuracy,
      color: '#00f3ff',
      weight: 1,
      fillColor: '#00f3ff',
      fillOpacity: 0.08
    }).addTo(map);
    
    // First location fix, center map
    map.setView(state.userLocation, 15);
  } else {
    state.userLocationMarker.setLatLng(state.userLocation);
    state.userAccuracyCircle.setLatLng(state.userLocation);
    state.userAccuracyCircle.setRadius(accuracy);
  }

  // Rotate user facing cone
  updateUserHeadingCone();

  // If track recording is active
  if (state.recordingState.isRecording && !state.recordingState.isPaused) {
    recordTrackPoint(lat, lng, altitude, position.timestamp);
  }
}

function userIconCreator() {
  return L.divIcon({
    className: 'user-location-wrapper',
    html: `<div class="pulse-ring"></div><div class="user-dot"></div><div class="direction-cone" id="user-heading-cone" style="display:none; transform: rotate(0deg);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function onLocationError(err) {
  console.warn('GPS position error:', err);
  el.gpsStatus.innerHTML = '<span class="status-dot"></span>GPS ERROR';
}

function handleOrientation(e) {
  let heading = null;
  
  if (e.webkitCompassHeading) {
    heading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    heading = 360 - e.alpha;
  }

  if (heading !== null) {
    state.deviceHeading = Math.round(heading);
    el.hudBearing.textContent = `${state.deviceHeading}°`;
    el.hudCompassDir.textContent = getCompassDirection(state.deviceHeading);
    updateUserHeadingCone();
  }
}

function updateUserHeadingCone() {
  const cone = document.getElementById('user-heading-cone');
  if (cone && state.deviceHeading !== null) {
    cone.style.display = 'block';
    cone.style.transform = `rotate(${state.deviceHeading}deg)`;
  }
}

function getCompassDirection(bearing) {
  const directions = ["N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO", "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(bearing / 22.5) % 16;
  return directions[index];
}


// --- LIVE TRACK RECORDER (REC) ---
let recordedLine = null;

function setupRecordingSystem() {
  el.btnRecStart.addEventListener('click', startTrackRecording);
  el.btnRecPause.addEventListener('click', togglePauseRecording);
  el.btnRecStop.addEventListener('click', stopTrackRecording);
}

function startTrackRecording() {
  if (state.recordingState.isRecording) return;
  
  state.recordingState.isRecording = true;
  state.recordingState.isPaused = false;
  state.recordingState.startTime = Date.now();
  state.recordingState.elapsedTime = 0;
  state.recordingState.distance = 0;
  state.recordingState.points = [];
  state.recordingState.lastPosition = null;

  // Initialize line on map
  if (recordedLine) {
    map.removeLayer(recordedLine);
  }
  recordedLine = L.polyline([], {
    color: '#ff3366',
    weight: 5,
    opacity: 0.9,
    dashArray: '2, 5'
  }).addTo(map);

  // Update UI button states
  el.btnRecStart.classList.add('hidden');
  el.btnRecPause.classList.remove('hidden');
  el.btnRecPause.textContent = 'Pauzeer';
  el.btnRecPause.className = 'btn btn-secondary';
  el.btnRecStop.classList.remove('hidden');
  el.recordingBanner.classList.remove('hidden');

  // Start timer interval
  state.recordingState.timerId = setInterval(updateRecordingTimer, 1000);

  // Trigger GPS immediately
  if (state.userLocation) {
    const lat = state.userLocation.lat;
    const lng = state.userLocation.lng;
    const alt = el.hudElevation.textContent !== '---' ? parseFloat(el.hudElevation.textContent) : null;
    recordTrackPoint(lat, lng, alt, Date.now());
  }

  showToast('Spooropname gestart. Beweeg om je spoor te registreren.');
}

function togglePauseRecording() {
  if (!state.recordingState.isRecording) return;

  state.recordingState.isPaused = !state.recordingState.isPaused;
  if (state.recordingState.isPaused) {
    el.btnRecPause.textContent = 'Hervat';
    el.btnRecPause.className = 'btn btn-primary';
    showToast('Opname gepauzeerd.');
  } else {
    el.btnRecPause.textContent = 'Pauzeer';
    el.btnRecPause.className = 'btn btn-secondary';
    showToast('Opname hervat.');
  }
}

function recordTrackPoint(lat, lng, alt, timestamp) {
  const currentLatLng = L.latLng(lat, lng);
  
  if (state.recordingState.lastPosition) {
    const distDelta = state.recordingState.lastPosition.distanceTo(currentLatLng) / 1000; // in km
    
    if (distDelta < 0.5) {
      state.recordingState.distance += distDelta;
      state.recordingState.points.push({ lat, lng, ele: alt, time: timestamp });
      state.recordingState.lastPosition = currentLatLng;
      recordedLine.addLatLng(currentLatLng);
    }
  } else {
    state.recordingState.points.push({ lat, lng, ele: alt, time: timestamp });
    state.recordingState.lastPosition = currentLatLng;
    recordedLine.addLatLng(currentLatLng);
  }

  // Backup recording in progress
  localStorage.setItem('geoforge_active_rec', JSON.stringify({
    startTime: state.recordingState.startTime,
    elapsedTime: state.recordingState.elapsedTime,
    distance: state.recordingState.distance,
    points: state.recordingState.points
  }));

  updateRecordingStatsUI();
}

function updateRecordingTimer() {
  if (state.recordingState.isPaused) return;

  state.recordingState.elapsedTime = Math.floor((Date.now() - state.recordingState.startTime) / 1000);
  updateRecordingStatsUI();
}

function updateRecordingStatsUI() {
  const seconds = state.recordingState.elapsedTime;
  const timeStr = formatDuration(seconds);
  const distStr = `${state.recordingState.distance.toFixed(2)} km`;
  
  const hours = seconds / 3600;
  const avgSpeed = hours > 0 ? state.recordingState.distance / hours : 0;
  
  el.recDurationBanner.textContent = timeStr;
  el.recDistanceBanner.textContent = distStr;
  
  el.recTime.textContent = timeStr;
  el.recDistance.textContent = distStr;
  el.recAvgSpeed.textContent = `${avgSpeed.toFixed(1)} km/u`;
  
  const points = state.recordingState.points;
  const elevations = points.map(p => p.ele).filter(e => e !== null && e !== undefined);
  if (elevations.length > 1) {
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    el.recElevation.textContent = `+${maxEle - minEle} m`;
  } else {
    el.recElevation.textContent = '---';
  }
}

function stopTrackRecording() {
  if (!state.recordingState.isRecording) return;

  clearInterval(state.recordingState.timerId);
  state.recordingState.isRecording = false;

  const trackName = prompt('Voer een naam in voor dit spoor:', `Spoor ${formatDate(new Date())}`);
  if (trackName) {
    const finalTrack = {
      id: 'track_' + Date.now(),
      name: trackName,
      startTime: state.recordingState.startTime,
      duration: state.recordingState.elapsedTime,
      distance: state.recordingState.distance,
      points: state.recordingState.points
    };

    state.savedTracks.push(finalTrack);
    saveTracksToLocalStorage();
    renderSavedTracks();
    showToast('Spoor succesvol opgeslagen.');
  }

  // Clear states
  state.recordingState.points = [];
  state.recordingState.distance = 0;
  state.recordingState.elapsedTime = 0;
  if (recordedLine) {
    map.removeLayer(recordedLine);
    recordedLine = null;
  }
  localStorage.removeItem('geoforge_active_rec');

  // Reset Buttons
  el.btnRecStart.classList.remove('hidden');
  el.btnRecPause.classList.add('hidden');
  el.btnRecStop.classList.add('hidden');
  el.recordingBanner.classList.add('hidden');
}

function renderSavedTracks() {
  el.savedTracksList.innerHTML = '';
  if (state.savedTracks.length === 0) {
    el.savedTracksList.innerHTML = '<div class="no-data-text">Geen opgenomen tracks gevonden.</div>';
    return;
  }

  state.savedTracks.forEach(track => {
    const item = document.createElement('div');
    item.className = 'saved-track-item';
    item.innerHTML = `
      <div class="track-item-info">
        <span class="item-title">${escapeXml(track.name)}</span>
        <span class="item-subtitle">${track.distance.toFixed(2)} km | ${formatDuration(track.duration)}</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon-small btn-view-track" title="Toon op kaart">👁️</button>
        <button class="btn-icon-small btn-download-track" title="Exporteer GPX">📥</button>
        <button class="btn-icon-small text-danger btn-delete-track" title="Verwijder">🗑️</button>
      </div>
    `;

    item.querySelector('.btn-view-track').addEventListener('click', () => {
      drawSavedTrackOnMap(track);
    });

    item.querySelector('.btn-download-track').addEventListener('click', () => {
      const gpxContent = generateGpxString(track, 'track');
      downloadBlob(gpxContent, `${track.name.replace(/\s+/g, '_')}.gpx`, 'application/gpx+xml');
    });

    item.querySelector('.btn-delete-track').addEventListener('click', () => {
      if (confirm(`Weet je zeker dat je "${track.name}" wilt verwijderen?`)) {
        state.savedTracks = state.savedTracks.filter(t => t.id !== track.id);
        saveTracksToLocalStorage();
        renderSavedTracks();
        showToast('Spoor verwijderd.');
      }
    });

    el.savedTracksList.appendChild(item);
  });
}

let activeTrackLayer = null;
function drawSavedTrackOnMap(track) {
  if (activeTrackLayer) {
    map.removeLayer(activeTrackLayer);
  }

  const latlngs = track.points.map(p => [p.lat, p.lng]);
  activeTrackLayer = L.polyline(latlngs, {
    color: '#00f3ff',
    weight: 5,
    opacity: 0.85
  }).addTo(map);

  map.fitBounds(activeTrackLayer.getBounds(), { padding: [50, 50] });
  showToast(`Spoor "${track.name}" geladen op de kaart.`);
}

function saveTracksToLocalStorage() {
  localStorage.setItem('geoforge_tracks', JSON.stringify(state.savedTracks));
}


// --- ROUTE PLANNER (BRouter API) ---
function setupRoutePlanner() {
  el.chkSnapBrouter.addEventListener('change', (e) => {
    state.snapToPaths = e.target.checked;
    updatePlannerRoute();
  });

  el.selectProfile.addEventListener('change', (e) => {
    state.brouterProfile = e.target.value;
    updatePlannerRoute();
  });

  el.btnPlanUndo.addEventListener('click', () => {
    if (state.controlPoints.length === 0) return;
    state.controlPoints.pop();
    updatePlannerRoute();
  });

  el.btnPlanClear.addEventListener('click', () => {
    if (confirm('Wil je de getekende planner route wissen?')) {
      clearPlannerRoute();
    }
  });

  el.btnExportGpx.addEventListener('click', () => {
    if (state.controlPoints.length < 2) return;
    const gpxString = generateGpxString(state, 'route');
    downloadBlob(gpxString, 'geplande_route.gpx', 'application/gpx+xml');
  });
}

function onMapClick(e) {
  if (state.activeMode === 'plan') {
    addPlannerPoint(e.latlng);
  } else if (state.activeMode === 'measure') {
    addMeasurePoint(e.latlng);
  }
}

function addPlannerPoint(latlng) {
  state.controlPoints.push(latlng);
  updatePlannerRoute();
}

function updatePlannerRoute() {
  if (state.controlPoints.length === 0) {
    clearPlannerMapLayers();
    updatePlannerStats(0, 0);
    return;
  }

  drawPlannerRawLine();
  renderPlannerWaypointMarkers();

  if (state.snapToPaths && state.brouterProfile !== 'straight' && state.controlPoints.length > 1) {
    fetchBRouterSnappedRoute();
  } else {
    drawStraightPlannerRoute();
  }

  el.btnPlanUndo.disabled = state.controlPoints.length === 0;
  el.btnPlanClear.disabled = state.controlPoints.length === 0;
}

function drawPlannerRawLine() {
  if (state.rawLine) map.removeLayer(state.rawLine);
  state.rawLine = L.polyline(state.controlPoints, {
    color: '#9ca3af',
    weight: 2,
    dashArray: '5, 8',
    opacity: 0.7
  }).addTo(map);
}

function drawStraightPlannerRoute() {
  if (state.routeLine) map.removeLayer(state.routeLine);
  state.snappedCoordinates = [];

  state.routeLine = L.polyline(state.controlPoints, {
    color: '#10b981',
    weight: 5,
    opacity: 0.9
  }).addTo(map);

  let distance = 0;
  for (let i = 0; i < state.controlPoints.length - 1; i++) {
    distance += state.controlPoints[i].distanceTo(state.controlPoints[i+1]);
  }

  updatePlannerStats(distance / 1000, state.controlPoints.length);
}

function fetchBRouterSnappedRoute() {
  const profile = state.brouterProfile;
  const lonlats = state.controlPoints.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|');
  const url = `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=${profile}&alternativeidx=0&format=geojson`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('BRouter snapfout');
      return res.json();
    })
    .then(geojson => {
      if (!geojson.features || geojson.features.length === 0) {
        throw new Error('Geen route geometry gevonden.');
      }
      
      const feature = geojson.features[0];
      const coords = feature.geometry.coordinates;
      const latlngs = coords.map(c => L.latLng(c[1], c[0]));

      if (state.routeLine) map.removeLayer(state.routeLine);
      
      state.routeLine = L.polyline(latlngs, {
        color: '#ffaa00',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      state.snappedCoordinates = coords;

      const distance = parseFloat(feature.properties['track-length']) / 1000;
      updatePlannerStats(distance, state.controlPoints.length);
    })
    .catch(err => {
      console.warn('BRouter error, falling back to straight:', err);
      drawStraightPlannerRoute();
    });
}

function renderPlannerWaypointMarkers() {
  state.waypointMarkers.forEach(m => map.removeLayer(m));
  state.waypointMarkers = [];

  state.controlPoints.forEach((latlng, index) => {
    const isStart = index === 0;
    const isEnd = index === state.controlPoints.length - 1;
    const markerColor = isStart ? '#00ff66' : (isEnd ? '#ff3366' : '#ffaa00');

    const icon = L.divIcon({
      className: 'custom-wp-marker',
      html: `<div style="background-color:${markerColor}; width:12px; height:12px; border:2px solid white; border-radius:50%; box-shadow:0 2px 5px rgba(0,0,0,0.5);"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const marker = L.marker(latlng, { icon: icon, draggable: true }).addTo(map);
    
    marker.on('drag', (e) => {
      state.controlPoints[index] = e.target.getLatLng();
      if (state.rawLine) {
        state.rawLine.setLatLngs(state.controlPoints);
      }
    });

    marker.on('dragend', () => {
      updatePlannerRoute();
    });

    marker.on('click', () => {
      if (confirm(`Verwijder routepunt ${index + 1}?`)) {
        state.controlPoints.splice(index, 1);
        updatePlannerRoute();
      }
    });

    state.waypointMarkers.push(marker);
  });
}

function updatePlannerStats(distance, numPoints) {
  el.statDistance.textContent = `${distance.toFixed(2)} km`;
  el.statPoints.textContent = numPoints;

  const speed = state.brouterProfile.includes('bike') || state.brouterProfile.includes('mtb') ? 18 : 4.5;
  const hours = distance / speed;
  const totalMins = Math.round(hours * 60);

  if (totalMins >= 60) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    el.statEstTime.textContent = `${h}u ${m}m`;
  } else {
    el.statEstTime.textContent = `${totalMins}m`;
  }

  el.btnExportGpx.disabled = numPoints < 2;
}

function clearPlannerRoute() {
  state.controlPoints = [];
  state.snappedCoordinates = [];
  clearPlannerMapLayers();
  updatePlannerStats(0, 0);

  el.btnPlanUndo.disabled = true;
  el.btnPlanClear.disabled = true;
}

function clearPlannerMapLayers() {
  if (state.routeLine) map.removeLayer(state.routeLine);
  if (state.rawLine) map.removeLayer(state.rawLine);
  state.routeLine = null;
  state.rawLine = null;

  state.waypointMarkers.forEach(m => map.removeLayer(m));
  state.waypointMarkers = [];
}


// --- MEASUREMENT TOOL (Latje) ---
function setupMeasurementTool() {
  el.btnMeasureClear.addEventListener('click', () => {
    clearMeasurement();
  });
}

function addMeasurePoint(latlng) {
  state.measurePoints.push(latlng);
  updateMeasureRuler();
}

function updateMeasureRuler() {
  state.measureMarkers.forEach(m => map.removeLayer(m));
  state.measureMarkers = [];
  
  if (state.measureLine) map.removeLayer(state.measureLine);
  
  if (state.measurePoints.length === 0) {
    el.measureTotalDist.textContent = '0.00 km';
    el.measureSegmentsList.innerHTML = '<div class="no-data-text">Tik op de kaart om te beginnen met meten.</div>';
    el.btnMeasureClear.disabled = true;
    return;
  }

  el.btnMeasureClear.disabled = false;

  state.measureLine = L.polyline(state.measurePoints, {
    color: '#00f3ff',
    weight: 3,
    dashArray: '6, 6',
    opacity: 0.95
  }).addTo(map);

  let totalDistance = 0;
  const segments = [];

  state.measurePoints.forEach((latlng, index) => {
    const isFirst = index === 0;
    
    const icon = L.divIcon({
      className: 'ruler-wp-marker',
      html: `<div style="background-color:#050608; border:2px solid #00f3ff; color:#00f3ff; width:20px; height:20px; border-radius:50%; text-align:center; font-family:var(--font-mono); font-size:10px; font-weight:bold; line-height:16px; box-shadow:0 2px 6px rgba(0,0,0,0.6);">${index + 1}</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker(latlng, { icon: icon, draggable: true }).addTo(map);
    
    marker.on('drag', (e) => {
      state.measurePoints[index] = e.target.getLatLng();
      if (state.measureLine) state.measureLine.setLatLngs(state.measurePoints);
    });

    marker.on('dragend', () => {
      updateMeasureRuler();
    });

    marker.on('click', () => {
      if (confirm(`Verwijder meetpunt ${index + 1}?`)) {
        state.measurePoints.splice(index, 1);
        updateMeasureRuler();
      }
    });

    state.measureMarkers.push(marker);

    if (!isFirst) {
      const prevLatLng = state.measurePoints[index - 1];
      const segmentDist = prevLatLng.distanceTo(latlng) / 1000;
      totalDistance += segmentDist;

      const bearing = getGeodesicBearing(prevLatLng.lat, prevLatLng.lng, latlng.lat, latlng.lng);
      const compassDir = getCompassDirection(bearing);

      segments.push({
        from: index,
        to: index + 1,
        dist: segmentDist,
        bearing: bearing,
        dir: compassDir
      });
    }
  });

  el.measureTotalDist.textContent = `${totalDistance.toFixed(2)} km`;
  renderMeasureSegmentsUI(segments);
}

function renderMeasureSegmentsUI(segments) {
  el.measureSegmentsList.innerHTML = '';
  
  if (segments.length === 0) {
    el.measureSegmentsList.innerHTML = '<div class="no-data-text">Voeg nog een punt toe om afstanden te berekenen.</div>';
    return;
  }

  segments.forEach(seg => {
    const div = document.createElement('div');
    div.className = 'segment-item';
    div.innerHTML = `
      <span class="segment-nr">SEG ${seg.from} ➔ ${seg.to}</span>
      <span class="segment-val">${seg.dist.toFixed(2)} km</span>
      <span class="segment-dir">${Math.round(seg.bearing)}° ${seg.dir}</span>
    `;
    el.measureSegmentsList.appendChild(div);
  });
}

function clearMeasurement() {
  state.measurePoints = [];
  state.measureMarkers.forEach(m => map.removeLayer(m));
  state.measureMarkers = [];
  if (state.measureLine) map.removeLayer(state.measureLine);
  state.measureLine = null;

  updateMeasureRuler();
}

function getGeodesicBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}


// --- MAP LAYERS MANAGER (Basemaps & Topotijdreis) ---
function setupLayersManager() {
  el.basemapRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selectedMap = e.target.value;
      state.activeBaseLayerName = selectedMap;
      
      // Remove current basemap
      Object.keys(state.baseLayers).forEach(key => {
        if (map.hasLayer(state.baseLayers[key])) {
          map.removeLayer(state.baseLayers[key]);
        }
      });

      if (state.topotijdreisLayer) {
        map.removeLayer(state.topotijdreisLayer);
      }

      // Add new basemap
      if (selectedMap === 'topotijdreis') {
        el.topotijdreisControl.classList.remove('hidden');
        loadTopotijdreisLayer();
      } else {
        el.topotijdreisControl.classList.add('hidden');
        if (state.baseLayers[selectedMap]) {
          state.baseLayers[selectedMap].addTo(map);
        }
      }
    });
  });

  // Topotijdreis year slider
  el.topotijdreisYear.addEventListener('input', (e) => {
    state.activeOverlayYear = parseInt(e.target.value);
    el.topotijdreisYearVal.textContent = state.activeOverlayYear;
  });

  el.topotijdreisYear.addEventListener('change', () => {
    if (state.activeBaseLayerName === 'topotijdreis') {
      loadTopotijdreisLayer();
    }
  });
}

function loadTopotijdreisLayer() {
  if (state.topotijdreisLayer) {
    map.removeLayer(state.topotijdreisLayer);
  }

  const year = state.activeOverlayYear;
  const tileUrl = `https://tiles.arcgis.com/tiles/nSZVuSZjIhHpYZzO/arcgis/rest/services/topotijdreis{year}/MapServer/tile/{z}/{y}/{x}`;
  
  state.topotijdreisLayer = L.tileLayer(tileUrl, {
    year: year,
    maxZoom: 18,
    minZoom: 0,
    attribution: 'Historische kaarten &copy; Kadaster'
  });

  state.topotijdreisLayer.addTo(map);
}


// --- MAP OVERLAYS MANAGER (Separate Function) ---
function setupOverlaysManager() {
  el.overlayHiking.addEventListener('change', (e) => {
    if (e.target.checked) {
      hikingOverlay.addTo(map);
      showToast('Wandelnetwerk overlay geladen.');
    } else {
      map.removeLayer(hikingOverlay);
    }
  });

  el.overlayCycling.addEventListener('change', (e) => {
    if (e.target.checked) {
      cyclingOverlay.addTo(map);
      showToast('Fietsnetwerk overlay geladen.');
    } else {
      map.removeLayer(cyclingOverlay);
    }
  });

  el.overlayMtb.addEventListener('change', (e) => {
    if (e.target.checked) {
      mtbOverlay.addTo(map);
      showToast('MTB-routenetwerk overlay geladen.');
    } else {
      map.removeLayer(mtbOverlay);
    }
  });
}


// --- POI EXPLORER & CUSTOM WAYPOINTS ---
function setupPoiExplorer() {
  el.btnPoiScan.addEventListener('click', scanForPois);
  el.btnPoiRefresh.addEventListener('click', scanForPois);

  el.btnAddWaypoint.addEventListener('click', () => {
    const center = map.getCenter();
    const wpName = prompt('Voer een naam in voor dit Waypoint:', `Waypoint ${state.savedWaypoints.length + 1}`);
    if (wpName) {
      createCustomWaypoint(wpName, center);
    }
  });
}

function scanForPois() {
  if (!map) return;
  
  el.poiStatusLog.style.display = 'block';
  el.poiStatusLog.textContent = 'Grenzen berekenen...';
  
  state.poiMarkers.forEach(m => map.removeLayer(m));
  state.poiMarkers = [];

  const activeCats = [];
  document.querySelectorAll('.poi-cat-chk:checked').forEach(c => {
    activeCats.push(c.value);
  });

  if (activeCats.length === 0) {
    el.poiStatusLog.textContent = 'Selecteer tenminste één categorie.';
    setTimeout(() => el.poiStatusLog.style.display = 'none', 2000);
    return;
  }

  const bounds = map.getBounds();
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  
  let subqueries = '';
  activeCats.forEach(cat => {
    if (cat === 'drinking_water') subqueries += `node["amenity"="drinking_water"](${bbox});`;
    if (cat === 'camp_site') subqueries += `node["tourism"="camp_site"](${bbox});`;
    if (cat === 'viewpoint') subqueries += `node["tourism"="viewpoint"](${bbox});`;
    if (cat === 'peak') subqueries += `node["natural"="peak"](${bbox});`;
    if (cat === 'historic') subqueries += `node["historic"](${bbox});`;
    if (cat === 'picnic_site') subqueries += `node["tourism"="picnic_site"](${bbox});`;
  });

  const query = `[out:json][timeout:25];
    (
      ${subqueries}
    );
    out body;`;

  el.poiStatusLog.textContent = 'OpenStreetMap bevragen...';

  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  })
    .then(res => {
      if (!res.ok) throw new Error('Overpass API error');
      return res.json();
    })
    .then(data => {
      el.poiStatusLog.style.display = 'none';
      if (!data.elements || data.elements.length === 0) {
        showToast('Geen POIs gevonden in dit gebied.', 'warning');
        return;
      }

      data.elements.forEach(poi => {
        if (!poi.lat || !poi.lon) return;

        const latlng = L.latLng(poi.lat, poi.lon);
        const tags = poi.tags || {};
        const name = tags.name || tags.operator || getPoiFallbackName(poi);
        const cat = getPoiCategory(poi);
        
        const color = getPoiMarkerColor(cat);
        const symbol = getPoiMarkerSymbol(cat);

        const icon = L.divIcon({
          className: 'poi-map-marker',
          html: `<div style="background-color:${color}; border: 1.5px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">${symbol}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const marker = L.marker(latlng, { icon: icon }).addTo(map);
        
        let popupHtml = `<div style="color:var(--text-primary); font-family:var(--font-main); font-size:12px; min-width: 140px;">
          <strong style="color:${color}; font-size:13px;">${name}</strong><br/>
          <span style="font-size:10px; color:#999; text-transform:uppercase;">${cat.replace('_', ' ')}</span>`;
          
        if (tags.description) popupHtml += `<p style="margin-top:4px; font-size:11px;">${tags.description}</p>`;
        if (tags.elevation) popupHtml += `<br/><strong>Hoogte:</strong> ${tags.elevation} m`;
        popupHtml += `</div>`;

        marker.bindPopup(popupHtml);
        state.poiMarkers.push(marker);
      });

      showToast(`${state.poiMarkers.length} POIs ingeladen op de kaart.`);
    })
    .catch(err => {
      console.error(err);
      el.poiStatusLog.textContent = 'Scannen mislukt.';
      setTimeout(() => el.poiStatusLog.style.display = 'none', 2000);
      showToast('Kon POIs niet laden.', 'error');
    });
}

function getPoiFallbackName(poi) {
  const cat = getPoiCategory(poi);
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
}

function getPoiCategory(poi) {
  const tags = poi.tags || {};
  if (tags.amenity === 'drinking_water') return 'drinking_water';
  if (tags.tourism === 'camp_site') return 'camp_site';
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  if (tags.natural === 'peak') return 'peak';
  if (tags.historic) return 'historic';
  if (tags.tourism === 'picnic_site') return 'picnic_site';
  return 'poi';
}

function getPoiMarkerColor(cat) {
  const colors = {
    drinking_water: '#00f3ff',
    camp_site: '#00ff66',
    viewpoint: '#ffaa00',
    peak: '#d2b48c',
    historic: '#b39ddb',
    picnic_site: '#fff59d'
  };
  return colors[cat] || '#ffffff';
}

function getPoiMarkerSymbol(cat) {
  const symbols = {
    drinking_water: '💧',
    camp_site: '⛺',
    viewpoint: '🔭',
    peak: '🏔️',
    historic: '🏰',
    picnic_site: '🧺'
  };
  return symbols[cat] || '📍';
}

// Custom Waypoints management
function createCustomWaypoint(name, latlng) {
  const wp = {
    id: 'wp_' + Date.now(),
    name: name,
    lat: latlng.lat,
    lng: latlng.lng
  };

  state.savedWaypoints.push(wp);
  saveWaypointsToLocalStorage();
  renderSavedWaypoints();
  drawWaypointMarker(wp);
  showToast(`Waypoint "${name}" gemaakt.`);
}

function drawWaypointMarker(wp) {
  const latlng = L.latLng(wp.lat, wp.lng);
  
  const icon = L.divIcon({
    className: 'custom-saved-wp',
    html: `<div style="background-color:#ff3366; border: 2px solid white; border-radius:50%; width:16px; height:16px; box-shadow:0 2px 5px rgba(0,0,0,0.6);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const marker = L.marker(latlng, { icon: icon }).addTo(map);
  marker.bindPopup(`<strong style="color:#ff3366;">${wp.name}</strong><br/>Waypoint`);
  
  state.waypointMarkersMap.push({ id: wp.id, marker: marker });
}

function renderSavedWaypoints() {
  el.savedWaypointsList.innerHTML = '';
  
  if (state.savedWaypoints.length === 0) {
    el.savedWaypointsList.innerHTML = '<div class="no-data-text">Geen eigen waypoints aangemaakt.</div>';
    return;
  }

  state.savedWaypoints.forEach(wp => {
    const item = document.createElement('div');
    item.className = 'saved-waypoint-item';
    item.innerHTML = `
      <div class="waypoint-item-info">
        <span class="item-title">${escapeXml(wp.name)}</span>
        <span class="item-subtitle">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon-small btn-view-wp" title="Focus">👁️</button>
        <button class="btn-icon-small text-danger btn-delete-wp" title="Verwijder">🗑️</button>
      </div>
    `;

    item.querySelector('.btn-view-wp').addEventListener('click', () => {
      map.setView([wp.lat, wp.lng], 15);
    });

    item.querySelector('.btn-delete-wp').addEventListener('click', () => {
      if (confirm(`Weet je zeker dat je waypoint "${wp.name}" wilt verwijderen?`)) {
        const mapMarkerObj = state.waypointMarkersMap.find(m => m.id === wp.id);
        if (mapMarkerObj) {
          map.removeLayer(mapMarkerObj.marker);
          state.waypointMarkersMap = state.waypointMarkersMap.filter(m => m.id !== wp.id);
        }

        state.savedWaypoints = state.savedWaypoints.filter(w => w.id !== wp.id);
        saveWaypointsToLocalStorage();
        renderSavedWaypoints();
        showToast('Waypoint verwijderd.');
      }
    });

    el.savedWaypointsList.appendChild(item);
  });
}

function saveWaypointsToLocalStorage() {
  localStorage.setItem('geoforge_waypoints', JSON.stringify(state.savedWaypoints));
}


// --- DATA LOADING & PERSISTENCE ---
function loadSavedData() {
  const tracksJson = localStorage.getItem('geoforge_tracks');
  if (tracksJson) {
    try {
      state.savedTracks = JSON.parse(tracksJson);
      renderSavedTracks();
    } catch (e) { console.error('Failed to parse saved tracks:', e); }
  }

  const wpJson = localStorage.getItem('geoforge_waypoints');
  if (wpJson) {
    try {
      state.savedWaypoints = JSON.parse(wpJson);
      renderSavedWaypoints();
      state.savedWaypoints.forEach(wp => drawWaypointMarker(wp));
    } catch (e) { console.error('Failed to parse saved waypoints:', e); }
  }

  const activeRecJson = localStorage.getItem('geoforge_active_rec');
  if (activeRecJson) {
    try {
      const rec = JSON.parse(activeRecJson);
      if (confirm('Er is een actieve track-opname afgebroken. Wil je deze hervatten?')) {
        state.recordingState.isRecording = true;
        state.recordingState.startTime = rec.startTime;
        state.recordingState.elapsedTime = rec.elapsedTime;
        state.recordingState.distance = rec.distance;
        state.recordingState.points = rec.points;
        state.recordingState.lastPosition = rec.points.length > 0 ? L.latLng(rec.points[rec.points.length - 1].lat, rec.points[rec.points.length - 1].lng) : null;
        
        recordedLine = L.polyline(state.recordingState.points.map(p => [p.lat, p.lng]), {
          color: '#ff3366',
          weight: 5,
          opacity: 0.9,
          dashArray: '2, 5'
        }).addTo(map);

        el.btnRecStart.classList.add('hidden');
        el.btnRecPause.classList.remove('hidden');
        el.btnRecStop.classList.remove('hidden');
        el.recordingBanner.classList.remove('hidden');
        state.recordingState.timerId = setInterval(updateRecordingTimer, 1000);
        updateRecordingStatsUI();
      } else {
        localStorage.removeItem('geoforge_active_rec');
      }
    } catch (e) { console.error('Failed to parse active rec backup:', e); }
  }
}


// --- GPX FILE GENERATOR ---
function generateGpxString(data, type) {
  if (type === 'track') {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoForge Navigator" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(data.name)}</name>
    <time>${new Date(data.startTime).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(data.name)}</name>
    <trkseg>`;
    
    data.points.forEach(pt => {
      const timeStr = pt.time ? `<time>${new Date(pt.time).toISOString()}</time>` : '';
      const eleStr = pt.ele !== undefined && pt.ele !== null ? `<ele>${pt.ele}</ele>` : '';
      gpx += `
      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${eleStr}${timeStr}</trkpt>`;
    });
    
    gpx += `
    </trkseg>
  </trk>
</gpx>`;
    return gpx;
  } else {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoForge Navigator" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Geplande Route</name>`;
    
    const pointsToUse = (data.snappedCoordinates && data.snappedCoordinates.length > 0) 
      ? data.snappedCoordinates 
      : data.controlPoints;
      
    pointsToUse.forEach(pt => {
      const lat = pt.lat !== undefined ? pt.lat : pt[1];
      const lon = pt.lng !== undefined ? pt.lng : pt[0];
      const ele = pt[2] !== undefined ? `<ele>${pt[2]}</ele>` : '';
      gpx += `
    <rtept lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${ele}</rtept>`;
    });
    
    gpx += `
  </rte>
</gpx>`;
    return gpx;
  }
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}


// --- HELPER UTILITIES ---
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hr = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hr}:${min}`;
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
