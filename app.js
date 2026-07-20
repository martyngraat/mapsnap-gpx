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
  activeMode: 'nav', // nav, plan, measure, photosnap
  
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
  activeOverlayYear: 1970,
  
  // MapSnap Calibration / Photo Snapping
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  scale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  calibrationPoints: [
    { photo: null, map: null, marker: null }, // Red (Point 1)
    { photo: null, map: null, marker: null }  // Blue (Point 2)
  ],
  calibrationStep: 0, // 0: inactive, 1: wait photo 1, 2: wait map 1, 3: wait photo 2, 4: wait map 2
  transform: null, // Affine or similarity transform coefficients
  isCalibrated: false,
  photoOverlay: null,
  tracingMode: 'color', // color, manual
  colorTolerance: 40,
  colorTarget: { r: 220, g: 38, b: 38 },
  rawPoints: [], // pixel tracing points
  isDrawing: false, // drawing drag state
  drawPath: [] // drawing coordinates
};

// --- Offscreen Canvas for Pixel Analysis ---
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

// --- Custom Photo Overlay (Leaflet Layer) ---
const PhotoOverlay = L.Layer.extend({
  initialize: function(imageElement, corners, options) {
    this._image = imageElement;
    this._corners = corners; // { tl, tr, bl, br } L.LatLng
    L.setOptions(this, options);
  },
  onAdd: function(map) {
    this._map = map;
    if (!this._canvas) {
      this._initCanvas();
    }
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend', this._update, this);
    map.on('zoomend', this._update, this);
    this._update();
  },
  onRemove: function(map) {
    map.getPanes().overlayPane.removeChild(this._canvas);
    map.off('moveend', this._update, this);
    map.off('zoomend', this._update, this);
  },
  _initCanvas: function() {
    this._canvas = L.DomUtil.create('canvas', 'leaflet-image-layer leaflet-zoom-animated');
    this._canvas.style.pointerEvents = 'none';
    this._canvas.style.zIndex = '400';
    if (this.options.opacity !== undefined) {
      this._canvas.style.opacity = this.options.opacity;
    }
  },
  _update: function() {
    if (!this._map || !this._image) return;
    const size = this._map.getSize();
    const lt = this._map.containerPointToLayerPoint([0, 0]);
    
    this._canvas.width = size.x;
    this._canvas.height = size.y;
    L.DomUtil.setPosition(this._canvas, lt);
    
    const ctx = this._canvas.getContext('2d');
    ctx.clearRect(0, 0, size.x, size.y);
    
    // Project corners to screen container points
    const p_tl = this._map.latLngToContainerPoint(this._corners.tl);
    const p_tr = this._map.latLngToContainerPoint(this._corners.tr);
    const p_bl = this._map.latLngToContainerPoint(this._corners.bl);
    
    const w = this._image.naturalWidth;
    const h = this._image.naturalHeight;
    
    // Affine transform mapping photo coordinates to container pixel coordinates
    const a = (p_tr.x - p_tl.x) / w;
    const b = (p_tr.y - p_tl.y) / w;
    const c = (p_bl.x - p_tl.x) / h;
    const d = (p_bl.y - p_tl.y) / h;
    const e = p_tl.x;
    const f = p_tl.y;
    
    ctx.save();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(this._image, 0, 0);
    ctx.restore();
  },
  setOpacity: function(opacity) {
    this.options.opacity = opacity;
    if (this._canvas) {
      this._canvas.style.opacity = opacity;
    }
  },
  setCorners: function(corners) {
    this._corners = corners;
    this._update();
  }
});

L.photoOverlay = function(imageElement, corners, options) {
  return new PhotoOverlay(imageElement, corners, options);
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
  btnToggleOverlay: document.getElementById('btn-toggle-overlay'),
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
  overlayHiking: document.getElementById('overlay-hiking'),
  overlayCycling: document.getElementById('overlay-cycling'),
  photoOverlayManagement: document.getElementById('photo-overlay-management'),
  sliderOpacity: document.getElementById('slider-opacity'),
  opacityValue: document.getElementById('opacity-value'),
  
  // POIs Panel
  btnPoiScan: document.getElementById('btn-poi-scan'),
  poiStatusLog: document.getElementById('poi-status-log'),
  btnAddWaypoint: document.getElementById('btn-add-waypoint'),
  savedWaypointsList: document.getElementById('saved-waypoints-list'),
  
  // Photo Overlay Panel (MapSnap)
  inputApiKey: document.getElementById('input-api-key'),
  chkSaveKey: document.getElementById('chk-save-key'),
  uploadContainer: document.getElementById('upload-container'),
  cameraInput: document.getElementById('camera-input'),
  fileInput: document.getElementById('file-input'),
  photoViewer: document.getElementById('photo-viewer'),
  photoCanvas: document.getElementById('photo-canvas'),
  photoModeIndicator: document.getElementById('photo-mode-indicator'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnPhotoReset: document.getElementById('btn-photo-reset'),
  btnTraceUndo: document.getElementById('btn-trace-undo'),
  btnTraceClear: document.getElementById('btn-trace-clear'),
  btnAiAnalyze: document.getElementById('btn-ai-analyze'),
  aiStatus: document.getElementById('ai-status'),
  sliderTolerance: document.getElementById('slider-tolerance'),
  toleranceValue: document.getElementById('tolerance-value'),
  colorPreview: document.getElementById('color-preview'),
  colorRgb: document.getElementById('color-rgb'),
  inputColorPicker: document.getElementById('input-color-picker'),
  btnCalClear: document.getElementById('btn-cal-clear'),
  
  // Dialogs
  locationDialog: document.getElementById('location-dialog'),
  inputSearchLocation: document.getElementById('input-search-location'),
  btnSearchLocation: document.getElementById('btn-search-location'),
  searchResults: document.getElementById('search-results'),
  btnCloseLocationDialog: document.getElementById('btn-close-location-dialog'),
  guideDialog: document.getElementById('guide-dialog'),
  btnForceUpdate: document.getElementById('btn-force-update'),
  btnGuide: document.getElementById('btn-guide'),
  btnCloseGuide: document.getElementById('btn-close-guide'),
  toastContainer: document.getElementById('toast-container')
};

// --- Map Initialization ---
let map;
let baseLayers = {};
let hikingOverlay;
let cyclingOverlay;

function initMap() {
  // Utrecht defaults
  map = L.map('map', {
    zoomControl: false, // We float our own zoom buttons or rely on Leaflet defaults, but placed top-left
    tap: false
  }).setView([52.0907, 5.1214], 9);
  
  // Add Leaflet zoom control at bottom-right on mobile, top-left on desktop
  L.control.zoom({ position: window.innerWidth >= 768 ? 'topleft' : 'bottomright' }).addTo(map);

  // Basemaps definition
  baseLayers.opentopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Kaart: &copy; OSM-auteurs | Stijl: &copy; OpenTopoMap (CC-BY-SA)'
  });

  baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });

  baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  baseLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });

  // Default basemap is OpenTopoMap
  baseLayers.opentopo.addTo(map);

  // Overlays
  hikingOverlay = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.7
  });

  cyclingOverlay = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.7
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
  setupPoiExplorer();
  setupPhotoCalibration();
  
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
  state.activeMode = panelId; // nav/dashboard, planner, measure, photosnap, layers, poi
  
  // If switching away from photo calibration, do not clear image, but reset cursor
  if (panelId !== 'photosnap') {
    el.photoCanvas.style.cursor = 'default';
  } else {
    el.photoCanvas.style.cursor = 'crosshair';
  }

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
    layers: 'Kaartlagen & Historie',
    poi: 'POI & Waypoints',
    photosnap: 'Foto-Overlay Kalibratie'
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

  // Location marker icon (cyan pulsing dot)
  const userIcon = L.divIcon({
    className: 'user-location-wrapper',
    html: `<div class="pulse-ring"></div><div class="user-dot"></div><div class="direction-cone" id="user-heading-cone" style="display:none;"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  // Watch Position
  state.watchId = navigator.geolocation.watchPosition(
    onLocationUpdate,
    onLocationError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );

  // Locate me fab button
  el.btnLocate.addEventListener('click', () => {
    if (state.userLocation) {
      map.setView(state.userLocation, 16);
      showToast('Gecentreerd op huidige locatie.');
    } else {
      showToast('Wachten op GPS fix...', 'warning');
    }
  });

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
  // If it's a timeout, continue silently
}

function handleOrientation(e) {
  let heading = null;
  
  if (e.webkitCompassHeading) {
    // iOS Device
    heading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    // Android device (requires transformation usually)
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
let recordedLine = null; // Leaflet line for active recording

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

  // Trigger GPS immediately to grab starting point
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
  
  // Calculate distance from previous point if accuracy is acceptable
  if (state.recordingState.lastPosition) {
    const distDelta = state.recordingState.lastPosition.distanceTo(currentLatLng) / 1000; // in km
    
    // Filter out sudden GPS jumps (jumps of more than 500m in 1s is unrealistic on foot/bike)
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
  
  // Calculate Avg speed
  const hours = seconds / 3600;
  const avgSpeed = hours > 0 ? state.recordingState.distance / hours : 0;
  
  // Update HUD Banner
  el.recDurationBanner.textContent = timeStr;
  el.recDistanceBanner.textContent = distStr;
  
  // Update Panel
  el.recTime.textContent = timeStr;
  el.recDistance.textContent = distStr;
  el.recAvgSpeed.textContent = `${avgSpeed.toFixed(1)} km/u`;
  
  // Compute altitude difference if possible
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

    // Bind views
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
    
    // Remove last control point
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
    // Add point to route planner
    addPlannerPoint(e.latlng);
  } else if (state.activeMode === 'measure') {
    // Add point to measurement latje
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

  // Draw dashed base line connecting points
  drawPlannerRawLine();

  // Render draggable markers
  renderPlannerWaypointMarkers();

  // Draw route snapped or straight
  if (state.snapToPaths && state.brouterProfile !== 'straight' && state.controlPoints.length > 1) {
    fetchBRouterSnappedRoute();
  } else {
    drawStraightPlannerRoute();
  }

  // Update button states
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
  state.snappedCoordinates = []; // Reset snapping cache

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
      const coords = feature.geometry.coordinates; // [[lon, lat, ele], ...]
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

      const distance = parseFloat(feature.properties['track-length']) / 1000; // in km
      updatePlannerStats(distance, state.controlPoints.length);
    })
    .catch(err => {
      console.warn('BRouter error, falling back to straight:', err);
      drawStraightPlannerRoute();
    });
}

function renderPlannerWaypointMarkers() {
  // Clear old markers
  state.waypointMarkers.forEach(m => map.removeLayer(m));
  state.waypointMarkers = [];

  state.controlPoints.forEach((latlng, index) => {
    // Determine marker color. Start is green, end is red, intermediate is yellow
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
    
    // Draggable callback
    marker.on('drag', (e) => {
      state.controlPoints[index] = e.target.getLatLng();
      if (state.rawLine) {
        state.rawLine.setLatLngs(state.controlPoints);
      }
    });

    marker.on('dragend', () => {
      updatePlannerRoute();
    });

    // Tap to delete waypoint
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

  // Est. time: walk speed 4.5km/h, cycling 18km/h
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

  // Enable/disable GPX export button
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
  // Clear old markers & lines
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

  // Draw polyline connecting points
  state.measureLine = L.polyline(state.measurePoints, {
    color: '#00f3ff',
    weight: 3,
    dashArray: '6, 6',
    opacity: 0.95
  }).addTo(map);

  // Calculate cumulative distance and display segments
  let totalDistance = 0;
  const segments = [];

  state.measurePoints.forEach((latlng, index) => {
    const isFirst = index === 0;
    
    // Draw numbered marker
    const icon = L.divIcon({
      className: 'ruler-wp-marker',
      html: `<div style="background-color:#050608; border:2px solid #00f3ff; color:#00f3ff; width:20px; height:20px; border-radius:50%; text-align:center; font-family:var(--font-mono); font-size:10px; font-weight:bold; line-height:16px; box-shadow:0 2px 6px rgba(0,0,0,0.6);">${index + 1}</div>`,
      iconSize: [20, 24],
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

    // Calculate segment details
    if (!isFirst) {
      const prevLatLng = state.measurePoints[index - 1];
      const segmentDist = prevLatLng.distanceTo(latlng) / 1000; // in km
      totalDistance += segmentDist;

      // Calculate bearing
      const bearing = getGeodesicBearing(prevLatLng.lat, prevLatLng.lng, latlng.lat, latlng.lng);
      const compassDir = getCompassDirection(bearing);

      segments.push({
        num: index,
        from: index,
        to: index + 1,
        dist: segmentDist,
        bearing: bearing,
        dir: compassDir
      });
    }
  });

  // Update total distance UI
  el.measureTotalDist.textContent = `${totalDistance.toFixed(2)} km`;

  // Render segment listing
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


// --- MAP LAYERS MANAGER (Topotijdreis Slider) ---
function setupLayersManager() {
  // Listen to basemaps radio selection
  el.basemapRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selectedMap = e.target.value;
      state.activeBaseLayerName = selectedMap;
      
      // Remove all base layers
      Object.keys(baseLayers).forEach(key => {
        if (map.hasLayer(baseLayers[key])) {
          map.removeLayer(baseLayers[key]);
        }
      });

      if (state.topotijdreisLayer) {
        map.removeLayer(state.topotijdreisLayer);
      }

      // Add selected layer
      if (selectedMap === 'topotijdreis') {
        el.topotijdreisControl.classList.remove('hidden');
        loadTopotijdreisLayer();
      } else {
        el.topotijdreisControl.classList.add('hidden');
        if (baseLayers[selectedMap]) {
          baseLayers[selectedMap].addTo(map);
        }
      }
    });
  });

  // Topotijdreis year slider
  el.topotijdreisYear.addEventListener('input', (e) => {
    state.activeOverlayYear = parseInt(e.target.value);
    el.topotijdreisYearVal.textContent = state.activeOverlayYear;
  });

  el.topotijdreisYear.addEventListener('change', (e) => {
    if (state.activeBaseLayerName === 'topotijdreis') {
      loadTopotijdreisLayer();
    }
  });

  // Checkboxes for overlays
  el.overlayHiking.addEventListener('change', (e) => {
    if (e.target.checked) {
      hikingOverlay.addTo(map);
    } else {
      map.removeLayer(hikingOverlay);
    }
  });

  el.overlayCycling.addEventListener('change', (e) => {
    if (e.target.checked) {
      cyclingOverlay.addTo(map);
    } else {
      map.removeLayer(cyclingOverlay);
    }
  });

  // Photo calibration opacity
  el.sliderOpacity.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    el.opacityValue.textContent = `${val}%`;
    if (state.photoOverlay) {
      state.photoOverlay.setOpacity(val / 100);
    }
  });
}

function loadTopotijdreisLayer() {
  if (state.topotijdreisLayer) {
    map.removeLayer(state.topotijdreisLayer);
  }

  // Load ArcGIS Kadaster tile services
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


// --- POI EXPLORER & CUSTOM WAYPOINTS ---
function setupPoiExplorer() {
  el.btnPoiScan.addEventListener('click', scanForPois);
  el.btnPoiRefresh.addEventListener('click', scanForPois);

  // Add waypoint button
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
  
  // Clear previous POIs from map
  state.poiMarkers.forEach(m => map.removeLayer(m));
  state.poiMarkers = [];

  // Get active categories checked
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
  
  // Build Overpass QL query based on active categories
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
        
        // Custom color marker
        const color = getPoiMarkerColor(cat);
        const symbol = getPoiMarkerSymbol(cat);

        const icon = L.divIcon({
          className: 'poi-map-marker',
          html: `<div style="background-color:${color}; border: 1.5px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">${symbol}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const marker = L.marker(latlng, { icon: icon }).addTo(map);
        
        // Build popup HTML details
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
      showToast('Kon POIs niet laden. Probeer opnieuw.', 'error');
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
    drinking_water: '#00f3ff', // Cyan
    camp_site: '#00ff66',      // Green
    viewpoint: '#ffaa00',      // Orange/Amber
    peak: '#d2b48c',           // Light brown
    historic: '#b39ddb',       // Lavender purple
    picnic_site: '#fff59d'     // Yellow
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
        // Remove marker
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


// --- MAPSNAP PHOTO CALIBRATION (Original features integration) ---
function setupPhotoCalibration() {
  // Load saved API Key
  const savedKey = localStorage.getItem('mapsnap_gemini_key');
  if (savedKey) {
    el.inputApiKey.value = savedKey;
    el.chkSaveKey.checked = true;
  }
  
  el.inputApiKey.addEventListener('input', updateAiButtonState);
  el.chkSaveKey.addEventListener('change', () => {
    const key = el.inputApiKey.value.trim();
    if (!el.chkSaveKey.checked) {
      localStorage.removeItem('mapsnap_gemini_key');
    } else {
      localStorage.setItem('mapsnap_gemini_key', key);
    }
    updateAiButtonState();
  });
  
  el.btnAiAnalyze.addEventListener('click', runAiGeoreference);
  updateAiButtonState();

  // Canvas events
  el.photoCanvas.addEventListener('mousedown', startPanOrAction);
  el.photoCanvas.addEventListener('mousemove', dragOrDraw);
  el.photoCanvas.addEventListener('mouseup', endPanOrAction);
  el.photoCanvas.addEventListener('mouseleave', () => { state.isDragging = false; state.isDrawing = false; });

  // Touch equivalents
  el.photoCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      startPanOrAction({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    } else if (e.touches.length === 2) {
      state.isDragging = false;
      state.isDrawing = false;
      state.pinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  });

  el.photoCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && (state.isDragging || state.isDrawing)) {
      const touch = e.touches[0];
      dragOrDraw({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    } else if (e.touches.length === 2 && state.pinchDist) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const zoomFactor = dist / state.pinchDist;
      state.pinchDist = dist;
      zoomPhoto(zoomFactor);
    }
  });

  el.photoCanvas.addEventListener('touchend', (e) => {
    endPanOrAction(e);
    state.pinchDist = null;
  });

  // Canvas zooming
  el.btnZoomIn.addEventListener('click', () => zoomPhoto(1.3));
  el.btnZoomOut.addEventListener('click', () => zoomPhoto(1 / 1.3));
  el.btnPhotoReset.addEventListener('click', resetPhotoView);

  // Undo / Clear
  el.btnTraceUndo.addEventListener('click', () => {
    if (state.rawPoints.length === 0) return;
    state.rawPoints.pop();
    state.controlPoints.pop();
    updatePlannerRoute();
    drawPhotoCanvas();
    el.btnTraceUndo.disabled = state.rawPoints.length === 0;
  });

  el.btnTraceClear.addEventListener('click', () => {
    if (confirm('Wil je alle getraceerde lijnsegmenten wissen?')) {
      state.rawPoints = [];
      clearPlannerRoute();
      drawPhotoCanvas();
      el.btnTraceUndo.disabled = true;
    }
  });

  // Clear calibration
  el.btnCalClear.addEventListener('click', () => {
    clearCalibration();
    showToast('AI-kalibratie gewist.');
  });

  // Photo toggle overlay
  el.btnToggleOverlay.addEventListener('click', () => {
    if (state.photoOverlay) {
      if (map.hasLayer(state.photoOverlay)) {
        map.removeLayer(state.photoOverlay);
        el.btnToggleOverlay.classList.remove('active');
        showToast('Foto-overlay verborgen.');
      } else {
        state.photoOverlay.addTo(map);
        el.btnToggleOverlay.classList.add('active');
        showToast('Foto-overlay weergegeven.');
      }
    }
  });

  // Listen to file upload
  el.cameraInput.addEventListener('change', handleImageUpload);
  el.fileInput.addEventListener('change', handleImageUpload);
  
  // Color palette presets
  initColorPalette();
}

function updateAiButtonState() {
  const key = el.inputApiKey.value.trim();
  const hasImage = !!state.image;
  if (key && hasImage) {
    el.btnAiAnalyze.removeAttribute('disabled');
  } else {
    el.btnAiAnalyze.setAttribute('disabled', 'true');
  }
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      state.image = img;
      state.imageWidth = img.naturalWidth;
      state.imageHeight = img.naturalHeight;
      
      // Setup offscreen canvas
      offscreenCanvas.width = state.imageWidth;
      offscreenCanvas.height = state.imageHeight;
      offscreenCtx.drawImage(img, 0, 0);
      
      // UI
      el.uploadContainer.classList.add('hidden');
      el.photoViewer.classList.remove('hidden');
      
      resetPhotoView();
      updateAiButtonState();
      showToast('Routekaart geladen. Geef je API sleutel in of tik kalibratiepunten.');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function resetPhotoView() {
  if (!state.image) return;
  state.scale = Math.min(el.photoViewer.clientWidth / state.imageWidth, el.photoViewer.clientHeight / state.imageHeight) * 0.95;
  state.panX = (el.photoViewer.clientWidth - state.imageWidth * state.scale) / 2;
  state.panY = (el.photoViewer.clientHeight - state.imageHeight * state.scale) / 2;
  drawPhotoCanvas();
}

function zoomPhoto(factor) {
  const centerViewport = { x: el.photoViewer.clientWidth / 2, y: el.photoViewer.clientHeight / 2 };
  const imgCenter = {
    x: (centerViewport.x - state.panX) / state.scale,
    y: (centerViewport.y - state.panY) / state.scale
  };
  state.scale *= factor;
  state.scale = Math.max(0.05, Math.min(state.scale, 20));
  state.panX = centerViewport.x - imgCenter.x * state.scale;
  state.panY = centerViewport.y - imgCenter.y * state.scale;
  drawPhotoCanvas();
}

function drawPhotoCanvas() {
  if (!state.image) return;
  
  const canvas = el.photoCanvas;
  const ctx = canvas.getContext('2d');
  
  canvas.width = el.photoViewer.clientWidth;
  canvas.height = el.photoViewer.clientHeight;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.scale, state.scale);
  
  ctx.drawImage(state.image, 0, 0);
  
  if (state.drawPath.length > 1) {
    ctx.beginPath();
    ctx.moveTo(state.drawPath[0].x, state.drawPath[0].y);
    for (let i = 1; i < state.drawPath.length; i++) {
      ctx.lineTo(state.drawPath[i].x, state.drawPath[i].y);
    }
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 6 / state.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  
  if (state.rawPoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(state.rawPoints[0].x, state.rawPoints[0].y);
    for (let i = 1; i < state.rawPoints.length; i++) {
      ctx.lineTo(state.rawPoints[i].x, state.rawPoints[i].y);
    }
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 5 / state.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    state.rawPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6 / state.scale, 0, 2 * Math.PI);
      ctx.fillStyle = '#059669';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / state.scale;
      ctx.stroke();
    });
  }
  
  state.calibrationPoints.forEach((cp, index) => {
    if (cp.photo) {
      ctx.beginPath();
      ctx.arc(cp.photo.x, cp.photo.y, 10 / state.scale, 0, 2 * Math.PI);
      ctx.fillStyle = index === 0 ? '#ff3366' : '#00f3ff';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3 / state.scale;
      ctx.stroke();
      
      ctx.fillStyle = 'white';
      ctx.font = `bold ${11 / state.scale}px var(--font-main)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(index + 1, cp.photo.x, cp.photo.y);
    }
  });
  
  ctx.restore();
}

window.addEventListener('resize', () => {
  if (state.image && state.activeMode === 'photosnap') {
    drawPhotoCanvas();
  }
});

let clickStartX = 0;
let clickStartY = 0;

function startPanOrAction(e) {
  if (!state.image) return;
  
  const rect = el.photoCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  clickStartX = mouseX;
  clickStartY = mouseY;
  
  state.isDragging = true;
  state.dragStart = { x: e.clientX, y: e.clientY };
  el.photoCanvas.style.cursor = 'grabbing';
}

function dragOrDraw(e) {
  if (!state.isDragging) return;
  
  const dx = e.clientX - state.dragStart.x;
  const dy = e.clientY - state.dragStart.y;
  
  const dist = Math.hypot(dx, dy);
  if (dist > 6) {
    state.panX += dx;
    state.panY += dy;
    state.dragStart = { x: e.clientX, y: e.clientY };
    drawPhotoCanvas();
  }
}

function endPanOrAction(e) {
  el.photoCanvas.style.cursor = 'crosshair';
  
  const rect = el.photoCanvas.getBoundingClientRect();
  let clientX = e.clientX;
  let clientY = e.clientY;
  
  if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  }
  
  if (clientX === undefined) {
    state.isDragging = false;
    return;
  }
  
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;
  
  const dx = mouseX - clickStartX;
  const dy = mouseY - clickStartY;
  const dragDistance = Math.hypot(dx, dy);
  
  if (dragDistance <= 6) {
    const imgX = (mouseX - state.panX) / state.scale;
    const imgY = (mouseY - state.panY) / state.scale;
    
    if (imgX >= 0 && imgX <= state.imageWidth && imgY >= 0 && imgY <= state.imageHeight) {
      handlePhotoClick(imgX, imgY);
    }
  }
  
  state.isDragging = false;
}

function handlePhotoClick(x, y) {
  // Manual point calibration or color follow
  if (state.isCalibrated) {
    // Tracing mode is color follower
    const pixel = offscreenCtx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    state.colorTarget = { r: pixel[0], g: pixel[1], b: pixel[2] };
    
    el.colorPreview.style.backgroundColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    el.colorRgb.textContent = `RGB(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    
    showToast('Kleur geselecteerd. Traceren...');
    setTimeout(() => {
      const tracePoints = traceColorRoute(x, y, pixel[0], pixel[1], pixel[2]);
      if (tracePoints.length > 2) {
        processDrawingPath(tracePoints);
      } else {
        showToast('Kleur-volger mislukt. Verhoog de tolerantie.', 'warning');
      }
    }, 50);
  } else {
    // We are calibrating manually!
    if (state.calibrationStep === 0) {
      state.calibrationPoints[0].photo = { x, y };
      state.calibrationStep = 1;
      el.photoModeIndicator.textContent = "Stap 2: Klik op de digitale kaart op dezelfde locatie (Punt 1)";
      showToast('Punt 1 gekozen op de foto. Selecteer nu de corresponderende plek op de echte kaart.');
      drawPhotoCanvas();
    } else if (state.calibrationStep === 2) {
      state.calibrationPoints[1].photo = { x, y };
      state.calibrationStep = 3;
      el.photoModeIndicator.textContent = "Stap 4: Klik op de digitale kaart op dezelfde locatie (Punt 2)";
      showToast('Punt 2 gekozen op de foto. Selecteer nu de corresponderende plek op de echte kaart.');
      drawPhotoCanvas();
    }
  }
}

// When map is clicked and calibration step is active
map.on('click', (e) => {
  if (state.activeMode === 'photosnap') {
    if (state.calibrationStep === 1) {
      state.calibrationPoints[0].map = e.latlng;
      addCalMapMarker(0, e.latlng);
      state.calibrationStep = 2;
      el.photoModeIndicator.textContent = "Stap 3: Klik op Punt 2 op de foto";
      showToast('Punt 1 gekoppeld op de kaart. Klik nu op Punt 2 op de foto.');
    } else if (state.calibrationStep === 3) {
      state.calibrationPoints[1].map = e.latlng;
      addCalMapMarker(1, e.latlng);
      state.calibrationStep = 0;
      
      // Calculate Similarity transform
      calculateSimilarityFallback(state.calibrationPoints[0], state.calibrationPoints[1]);
      finalizeCalibration();
    }
  }
});

function addCalMapMarker(index, latlng) {
  if (state.calibrationPoints[index].marker) {
    map.removeLayer(state.calibrationPoints[index].marker);
  }
  const color = index === 0 ? '#ff3366' : '#00f3ff';
  const icon = L.divIcon({
    className: 'cal-wp-marker',
    html: `<div style="background-color:${color}; border:2px solid white; color:white; font-family:var(--font-mono); font-size:10px; font-weight:bold; width:20px; height:20px; line-height:16px; text-align:center; border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,0.5);">${index + 1}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
  state.calibrationPoints[index].marker = L.marker(latlng, { icon: icon }).addTo(map);
}

function finalizeCalibration() {
  el.photoModeIndicator.textContent = "Kaart gekalibreerd. Kleur-volger actief.";
  el.btnCalClear.classList.remove('hidden');
  el.photoOverlayManagement.classList.remove('hidden');
  el.btnToggleOverlay.classList.remove('hidden');
  el.btnToggleOverlay.classList.add('active');

  addPhotoOverlay();

  // Center map on center of photo coordinates translated to latlng
  const center = photoToLatLng(state.imageWidth / 2, state.imageHeight / 2);
  map.setView(center, 14);
}

function calculateSimilarityFallback(vp1, vp2) {
  const p1 = vp1.photo;
  const p2 = vp2.photo;
  const zoom = 18;
  const m1 = map.project(vp1.map, zoom);
  const m2 = map.project(vp2.map, zoom);
  
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dX = m2.x - m1.x;
  const dY = m2.y - m1.y;
  
  const denom = dx * dx + dy * dy;
  if (denom === 0) return;
  
  const a = (dX * dx + dY * dy) / denom;
  const b = (dY * dx - dX * dy) / denom;
  
  const cx = m1.x - a * p1.x + b * p1.y;
  const cy = m1.y - b * p1.x - a * p1.y;
  
  state.transform = { type: 'similarity', a, b, cx, cy, zoom };
  state.isCalibrated = true;
  
  showToast('Foto-kalibratie voltooid.');
}

function processDrawingPath(pixelPath) {
  const tolerance = 15;
  const simplifiedPixels = simplifyDouglasPeucker(pixelPath, tolerance);
  const newLatLngs = simplifiedPixels.map(pt => photoToLatLng(pt.x, pt.y));
  
  state.controlPoints = state.controlPoints.concat(newLatLngs);
  state.rawPoints = state.rawPoints.concat(simplifiedPixels);
  
  // Switch to Route Planner and draw snapped route
  switchPanel('planner');
  updatePlannerRoute();
  
  el.btnTraceUndo.removeAttribute('disabled');
}

function addPhotoOverlay() {
  if (state.photoOverlay) map.removeLayer(state.photoOverlay);

  const corners = {
    tl: photoToLatLng(0, 0),
    tr: photoToLatLng(state.imageWidth, 0),
    bl: photoToLatLng(0, state.imageHeight),
    br: photoToLatLng(state.imageWidth, state.imageHeight)
  };

  const opacity = parseInt(el.sliderOpacity.value) / 100;
  state.photoOverlay = L.photoOverlay(state.image, corners, { opacity: opacity }).addTo(map);
}

function clearCalibration() {
  state.isCalibrated = false;
  state.transform = null;
  state.calibrationStep = 0;
  
  if (state.photoOverlay) {
    map.removeLayer(state.photoOverlay);
    state.photoOverlay = null;
  }
  
  state.calibrationPoints.forEach(pt => {
    if (pt.marker) map.removeLayer(pt.marker);
    pt.marker = null;
    pt.photo = null;
    pt.map = null;
  });

  el.btnCalClear.classList.add('hidden');
  el.photoOverlayManagement.classList.add('hidden');
  el.btnToggleOverlay.classList.add('hidden');
  el.photoModeIndicator.textContent = "Klik op Punt 1 op de foto om te kalibreren.";

  drawPhotoCanvas();
}

function photoToLatLng(x, y) {
  if (!state.transform) return null;
  const { zoom } = state.transform;
  
  if (state.transform.type === 'affine') {
    const { c1, c2, c3, c4, c5, c6 } = state.transform;
    const X = c1 * x + c2 * y + c3;
    const Y = c4 * x + c5 * y + c6;
    return map.unproject([X, Y], zoom);
  } else {
    const { a, b, cx, cy } = state.transform;
    const X = a * x - b * y + cx;
    const Y = b * x + a * y + cy;
    return map.unproject([X, Y], zoom);
  }
}

// AI Auto Alignment via Gemini API
function runAiGeoreference() {
  const apiKey = el.inputApiKey.value.trim();
  if (!apiKey || !state.image) return;
  
  el.btnAiAnalyze.setAttribute('disabled', 'true');
  el.aiStatus.style.display = 'block';
  el.aiStatus.textContent = 'Kaart analyseren met AI...';
  
  const maxDim = 1024;
  let w = state.imageWidth;
  let h = state.imageHeight;
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(state.image, 0, 0, w, h);
  
  const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
  const base64Data = dataUrl.split(',')[1];
  
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [{
      parts: [
        { text: "Analyseer deze wandel- of fietsroutekaart foto. Identificeer 3 prominente, unieke herkenningspunten (zoals kruisingen van wegen, specifieke gebouwen, parkeerplaatsen of torens) die op zowel deze kaart als een standaard wegenkaart (OpenStreetMap) te vinden zijn. Geef antwoord in een strikt JSON-formaat met de volgende structuur:\n" +
              "{\n" +
              "  \"locationName\": \"naam van het wandelgebied of de plaats\",\n" +
              "  \"landmarks\": [\n" +
              "    {\n" +
              "      \"name\": \"beschrijvende naam van het punt (bijv. Kruising Bosweg en Duinweg, Schoorl)\",\n" +
              "      \"x\": 0.45,\n" +
              "      \"y\": 0.62,\n" +
              "      \"query\": \"zoekterm voor Nominatim geocoding (bijv. Kruising Duinweg Schoorlse Zeeweg, Schoorl)\"\n" +
              "    }\n" +
              "  ]\n" +
              "}\n" +
              "Geef GEEN markdown omhulsel (geen ```json), alleen de pure JSON string." },
        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
      ]
    }],
    generationConfig: { responseMimeType: "application/json" }
  };
  
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })
  .then(async res => {
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.error && errJson.error.message) {
          errMsg = errJson.error.message;
        }
      } catch (e) {}
      throw new Error(errMsg);
    }
    return res.json();
  })
  .then(data => {
    el.aiStatus.textContent = 'Herkenningspunten lokaliseren...';
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Geen antwoord van AI.');
    }
    
    const textResponse = data.candidates[0].content.parts[0].text;
    const result = JSON.parse(textResponse.trim());
    
    if (!result.landmarks || result.landmarks.length < 2) {
      throw new Error('Niet genoeg herkenningspunten gevonden door AI.');
    }
    
    const geocodePromises = result.landmarks.map((lm, idx) => {
      return new Promise(resolve => setTimeout(resolve, idx * 350))
        .then(() => fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(lm.query)}&limit=1`))
        .then(res => res.json())
        .then(json => {
          if (json && json.length > 0) {
            return {
              photo: { x: lm.x * state.imageWidth, y: lm.y * state.imageHeight },
              map: L.latLng(parseFloat(json[0].lat), parseFloat(json[0].lon)),
              name: lm.name
            };
          }
          return null;
        })
        .catch(err => {
          console.warn('Geocoding mislukt voor:', lm.name, err);
          return null;
        });
    });
    
    return Promise.all(geocodePromises).then(matchedPoints => {
      const validPoints = matchedPoints.filter(p => p !== null);
      
      if (validPoints.length < 2) {
        throw new Error('Kon herkenningspunten niet geolokaliseren via Nominatim.');
      }
      
      clearCalibration();
      const zoom = 18;
      
      if (validPoints.length >= 3) {
        // Affine Transform
        const p1 = validPoints[0].photo;
        const p2 = validPoints[1].photo;
        const p3 = validPoints[2].photo;
        
        const m1 = map.project(validPoints[0].map, zoom);
        const m2 = map.project(validPoints[1].map, zoom);
        const m3 = map.project(validPoints[2].map, zoom);
        
        const D = p1.x * (p2.y - p3.y) - p1.y * (p2.x - p3.x) + (p2.x * p3.y - p3.x * p2.y);
        
        if (Math.abs(D) < 0.0001) {
          calculateSimilarityFallback(validPoints[0], validPoints[1]);
          return;
        }
        
        const c1 = (m1.x * (p2.y - p3.y) - p1.y * (m2.x - m3.x) + (m2.x * p3.y - m3.x * p2.y)) / D;
        const c2 = (p1.x * (m2.x - m3.x) - m1.x * (p2.x - p3.x) + (p2.x * m3.x - p3.x * m2.x)) / D;
        const c3 = (p1.x * (p2.y * m3.x - p3.y * m2.x) - p1.y * (p2.x * m3.x - p3.x * m2.x) + m1.x * (p2.x * p3.y - p3.x * p2.y)) / D;
        
        const c4 = (m1.y * (p2.y - p3.y) - p1.y * (m2.y - m3.y) + (m2.y * p3.y - m3.y * p2.y)) / D;
        const c5 = (p1.x * (m2.y - m3.y) - m1.y * (p2.x - p3.x) + (p2.x * m3.y - p3.x * m2.y)) / D;
        const c6 = (p1.x * (p2.y * m3.y - p3.y * m2.y) - p1.y * (p2.x * m3.y - p3.x * m2.y) + m1.y * (p2.x * p3.y - p3.x * p2.y)) / D;
        
        state.transform = { type: 'affine', c1, c2, c3, c4, c5, c6, zoom };
        state.isCalibrated = true;
        
        validPoints.forEach((vp, index) => {
          state.calibrationPoints[index] = { photo: vp.photo, map: vp.map, marker: null };
          addCalMapMarker(index, vp.map);
        });
        
        showToast('Magische AI-kalibratie voltooid!');
      } else {
        calculateSimilarityFallback(validPoints[0], validPoints[1]);
      }
      
      finalizeCalibration();
    });
  })
  .catch(err => {
    console.error(err);
    showToast(`AI Kalibratie mislukt: ${err.message}`, 'error');
  })
  .finally(() => {
    el.aiStatus.style.display = 'none';
    updateAiButtonState();
  });
}

// Tracing via color presets
function initColorPalette() {
  const presetBtns = document.querySelectorAll('.color-preset-btn');
  
  function selectHexColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    state.colorTarget = { r, g, b };
    el.colorPreview.style.backgroundColor = hex;
    el.colorRgb.textContent = `RGB(${r}, ${g}, ${b})`;
    el.inputColorPicker.value = hex;
  }
  
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectHexColor(btn.getAttribute('data-color'));
    });
  });
  
  el.inputColorPicker.addEventListener('input', (e) => {
    presetBtns.forEach(b => b.classList.remove('active'));
    selectHexColor(e.target.value);
  });

  el.sliderTolerance.addEventListener('input', (e) => {
    el.toleranceValue.textContent = e.target.value;
  });
}

// Color Tracing logic (BFS flood fill over pixel tolerance)
function traceColorRoute(startX, startY, targetR, targetG, targetB) {
  const w = state.imageWidth;
  const h = state.imageHeight;
  const tolerance = parseInt(el.sliderTolerance.value);
  const data = offscreenCtx.getImageData(0, 0, w, h).data;
  
  const visited = new Uint8Array(w * h);
  const queue = [Math.round(startX), Math.round(startY)];
  visited[Math.round(startY) * w + Math.round(startX)] = 1;
  
  const pathPoints = [];
  let sumX = 0, sumY = 0, count = 0;
  
  const cells = [];
  
  while (queue.length > 0) {
    const cx = queue.shift();
    const cy = queue.shift();
    
    cells.push({ x: cx, y: cy });
    
    // Check 4 directions
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d][0] * 3; // jump 3 pixels to speed up
      const ny = cy + dirs[d][1] * 3;
      
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const vidx = ny * w + nx;
        if (!visited[vidx]) {
          visited[vidx] = 1;
          const idx = (ny * w + nx) * 4;
          const dr = data[idx] - targetR;
          const dg = data[idx+1] - targetG;
          const db = data[idx+2] - targetB;
          const dist = Math.sqrt(dr*dr + dg*dg + db*db);
          
          if (dist < tolerance) {
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  // Downsample coordinates by sorting them chronologically along the track
  // Sort from starting point outward
  const sorted = [{ x: startX, y: startY }];
  const remaining = cells.filter(c => Math.abs(c.x - startX) > 5 || Math.abs(c.y - startY) > 5);
  
  let current = sorted[0];
  while (remaining.length > 0 && sorted.length < 350) {
    let bestIdx = -1;
    let minDist = Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.hypot(remaining[i].x - current.x, remaining[i].y - current.y);
      if (d < minDist) {
        minDist = d;
        bestIdx = i;
      }
    }
    
    if (bestIdx === -1 || minDist > 80) break; // gap too large
    
    current = remaining.splice(bestIdx, 1)[0];
    sorted.push(current);
  }
  
  return sorted;
}

// Ramer-Douglas-Peucker simplification
function simplifyDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  
  let maxSqDist = 0;
  let index = 0;
  const end = points.length - 1;
  
  for (let i = 1; i < end; i++) {
    const sqDist = getSquareSegmentDistance(points[i], points[0], points[end]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }
  
  if (maxSqDist > tolerance * tolerance) {
    const results1 = simplifyDouglasPeucker(points.slice(0, index + 1), tolerance);
    const results2 = simplifyDouglasPeucker(points.slice(index), tolerance);
    return results1.slice(0, results1.length - 1).concat(results2);
  }
  
  return [points[0], points[end]];
}

function getSquareSegmentDistance(p, p1, p2) {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;
  
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}


// --- DATA LOADING & PERSISTENCE ---
function loadSavedData() {
  // Load saved tracks
  const tracksJson = localStorage.getItem('geoforge_tracks');
  if (tracksJson) {
    try {
      state.savedTracks = JSON.parse(tracksJson);
      renderSavedTracks();
    } catch (e) { console.error('Failed to parse saved tracks:', e); }
  }

  // Load saved waypoints
  const wpJson = localStorage.getItem('geoforge_waypoints');
  if (wpJson) {
    try {
      state.savedWaypoints = JSON.parse(wpJson);
      renderSavedWaypoints();
      state.savedWaypoints.forEach(wp => drawWaypointMarker(wp));
    } catch (e) { console.error('Failed to parse saved waypoints:', e); }
  }

  // Check if there was an active track recording in progress
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
        
        // Re-draw line
        recordedLine = L.polyline(state.recordingState.points.map(p => [p.lat, p.lng]), {
          color: '#ff3366',
          weight: 5,
          opacity: 0.9,
          dashArray: '2, 5'
        }).addTo(map);

        // Resume state UI
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
    // data is track object
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
    // data is state object for planned route
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoForge Navigator" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Geplande Route</name>`;
    
    const pointsToUse = (data.snappedCoordinates && data.snappedCoordinates.length > 0) 
      ? data.snappedCoordinates 
      : data.controlPoints;
      
    pointsToUse.forEach(pt => {
      // If snappedCoordinates: array format [lon, lat, ele]
      // If controlPoints: L.LatLng object
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
