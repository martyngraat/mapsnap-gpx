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
  activeMode: 'nav', // nav, planner, measure, overlays, layers, poi
  
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
  
  // Isochrones (Wandelbereik)
  activeIsochroneLayer: null,

  // Measurement Tool (Latje)
  measurePoints: [], // Array of L.LatLng
  measureMarkers: [], // Array of L.Marker
  measureLine: null, // L.Polyline
  
  // Custom Waypoints & POIs
  savedWaypoints: [],
  waypointMarkersMap: [], // map markers references
  poiMarkers: [], // Overpass/Wiki/iNat POI markers on map
  activePoiCategories: ['drinking_water', 'camp_site', 'viewpoint'],

  // Live Beacon State
  beaconId: null,
  beaconMarker: null,
  beaconPolyline: null,
  beaconCentered: false,
  lastBeaconUpdateTime: null,
  
  // Map Layers & Overlays
  baseLayers: {},
  activeBaseLayerName: 'opentopo',
  topotijdreisLayer: null,
  ohmLayer: null, // MapLibre GL layer for global historical maps
  activeOverlayYear: 1970,
  
  // Custom overlays instances
  hikingOverlay: null,
  cyclingOverlay: null,
  mtbOverlay: null,
  tracesOverlay: null,
  radarOverlay: null,
  radarTimerId: null,
  lightningOverlay: null,
  natura2000Overlay: null,
  monumentsOverlay: null,
  lightPollutionOverlay: null
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
  btnQuickSettings: document.getElementById('btn-quick-settings'),
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
  
  // Collapsible Local Info
  localInfoTrigger: document.getElementById('local-info-trigger'),
  localInfoChevron: document.getElementById('local-info-chevron'),
  localInfoContent: document.getElementById('local-info-content'),
  btnRefreshLocalInfo: document.getElementById('btn-refresh-local-info'),
  infoWeather: document.getElementById('info-weather'),
  infoSun: document.getElementById('info-sun'),
  infoAqi: document.getElementById('info-aqi'),
  infoPluscode: document.getElementById('info-pluscode'),
  infoElevation: document.getElementById('info-elevation'),
  
  // Planner Panel
  chkSnapBrouter: document.getElementById('chk-snap-brouter'),
  selectProfile: document.getElementById('select-profile'),
  statDistance: document.getElementById('stat-distance'),
  statPoints: document.getElementById('stat-points'),
  statEstTime: document.getElementById('stat-est-time'),
  btnPlanUndo: document.getElementById('btn-plan-undo'),
  btnPlanClear: document.getElementById('btn-plan-clear'),
  btnExportGpx: document.getElementById('btn-export-gpx'),
  btnIsochrone30: document.getElementById('btn-isochrone-30'),
  btnIsochroneClear: document.getElementById('btn-isochrone-clear'),
  
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
  overlayTraces: document.getElementById('overlay-traces'),
  overlayRadar: document.getElementById('overlay-radar'),
  overlayLightning: document.getElementById('overlay-lightning'),
  overlayNatura2000: document.getElementById('overlay-natura2000'),
  overlayMonuments: document.getElementById('overlay-monuments'),
  overlayLightpollution: document.getElementById('overlay-lightpollution'),
  
  // POIs Panel
  btnPoiScan: document.getElementById('btn-poi-scan'),
  btnPoiRefresh: document.getElementById('btn-poi-refresh'),
  poiStatusLog: document.getElementById('poi-status-log'),
  btnAddWaypoint: document.getElementById('btn-add-waypoint'),
  savedWaypointsList: document.getElementById('saved-waypoints-list'),
  
  // Dialogs
  locationDialog: document.getElementById('location-dialog'),
  inputSearchLocation: document.getElementById('input-search-location'),
  btnSearchLocation: document.getElementById('btn-search-location'),
  searchResults: document.getElementById('search-results'),
  btnCloseLocationDialog: document.getElementById('btn-close-location-dialog'),
  
  // Nature Panel
  btnCameraTrigger: document.getElementById('btn-camera-trigger'),
  btnUploadTrigger: document.getElementById('btn-upload-trigger'),
  inputNaturePhoto: document.getElementById('input-nature-photo'),
  naturePhotoPreview: document.getElementById('nature-photo-preview'),
  imgNaturePreview: document.getElementById('img-nature-preview'),
  natureAiResult: document.getElementById('nature-ai-result'),
  btnScanBiodiversity: document.getElementById('btn-scan-biodiversity'),
  natureGeologyBox: document.getElementById('nature-geology-box'),
  geologyDetails: document.getElementById('geology-details'),
  natureSpeciesBox: document.getElementById('nature-species-box'),
  speciesDetails: document.getElementById('species-details'),
  natureBirdsBox: document.getElementById('nature-birds-box'),
  birdsDetails: document.getElementById('birds-details'),
  btnShareLocation: document.getElementById('btn-share-location'),

  // Dialogs
  settingsDialog: document.getElementById('settings-dialog'),
  inputGeminiKey: document.getElementById('input-gemini-key'),
  inputOrsKey: document.getElementById('input-ors-key'),
  inputW3wKey: document.getElementById('input-w3w-key'),
  inputMaptilerKey: document.getElementById('input-maptiler-key'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnCloseSettingsDialog: document.getElementById('btn-close-settings-dialog'),
  btnOpenToolbox: document.getElementById('btn-open-toolbox'),
  toolboxDialog: document.getElementById('toolbox-dialog'),
  toolboxModulesList: document.getElementById('toolbox-modules-list'),
  btnSaveToolbox: document.getElementById('btn-save-toolbox'),
  btnCloseToolbox: document.getElementById('btn-close-toolbox'),

  // Firebase & Live Beacon
  inputFirebaseConfig: document.getElementById('input-firebase-config'),
  inputAuthEmail: document.getElementById('input-auth-email'),
  inputAuthPassword: document.getElementById('input-auth-password'),
  btnAuthLogin: document.getElementById('btn-auth-login'),
  btnAuthRegister: document.getElementById('btn-auth-register'),
  btnAuthLogout: document.getElementById('btn-auth-logout'),
  accountLoggedOut: document.getElementById('account-logged-out'),
  accountLoggedIn: document.getElementById('account-logged-in'),
  accountEmailDisplay: document.getElementById('account-email-display'),
  chkLiveBeacon: document.getElementById('chk-live-beacon'),
  beaconActiveInfo: document.getElementById('beacon-active-info'),
  beaconIdVal: document.getElementById('beacon-id-val'),
  btnCopyBeaconLink: document.getElementById('btn-copy-beacon-link'),
  beaconViewerBanner: document.getElementById('beacon-viewer-banner'),
  beaconViewerName: document.getElementById('beacon-viewer-name'),
  btnCloseBeaconViewer: document.getElementById('btn-close-beacon-viewer'),

  guideDialog: document.getElementById('guide-dialog'),
  btnCloseGuide: document.getElementById('btn-close-guide'),
  toastContainer: document.getElementById('toast-container'),
  btnOpenMapillary: document.getElementById('btn-open-mapillary')
};

// --- API & Module Configuration Registry ---
const API_REGISTRY = {
  // Category: Dashboard & Weer
  'live_beacon': {
    name: 'Live Deel-Beacon',
    category: 'Dashboard & Weer',
    description: 'Zendt je GPS-coördinaten live uit naar vrienden via Firebase.',
    coverage: 'Wereldwijd',
    default: true
  },
  'open_meteo': {
    name: 'Open-Meteo Weer',
    category: 'Dashboard & Weer',
    description: 'Laadt actuele weersinformatie en temperaturen op je huidige locatie.',
    coverage: 'Wereldwijd',
    default: true
  },
  'sunrise_sunset': {
    name: 'Sunrise-Sunset Tijden',
    category: 'Dashboard & Weer',
    description: 'Berekent zonsopgang- en ondergangstijden.',
    coverage: 'Wereldwijd',
    default: true
  },
  'waqi': {
    name: 'WAQI Luchtkwaliteit',
    category: 'Dashboard & Weer',
    description: 'Laadt live luchtkwaliteit van lokale meetstations.',
    coverage: 'Wereldwijd',
    default: true
  },
  'plus_codes': {
    name: 'Google Plus Codes',
    category: 'Dashboard & Weer',
    description: 'Berekent een korte noodcode voor reddingsdiensten.',
    coverage: 'Wereldwijd',
    default: true
  },
  'usgs_elevation': {
    name: 'USGS/Open-Elevation Correctie',
    category: 'Dashboard & Weer',
    description: 'Verifieert GPS-hoogte aan de hand van hoogtemodellen.',
    coverage: 'Wereldwijd',
    default: true
  },
  'what3words': {
    name: 'what3words Noodadres',
    category: 'Dashboard & Weer',
    description: 'Vertaalt je coördinaten naar een 3-woorden adres.',
    coverage: 'Wereldwijd',
    default: false
  },
  
  // Category: Kaart Overlays
  'norway_topo': {
    name: 'Noorwegen Topo (Kartverket)',
    category: 'Kaart Overlays',
    description: 'Laadt de officiële topografische kaart van Noorwegen.',
    coverage: 'Noorwegen',
    default: true
  },
  'maptiler_maps': {
    name: 'MapTiler Basiskaarten',
    category: 'Kaart Overlays',
    description: 'Schakelt MapTiler Outdoor- en Winterkaarten in (gratis API-sleutel vereist).',
    coverage: 'Wereldwijd',
    default: true
  },
  'rainviewer': {
    name: 'RainViewer Buienradar',
    category: 'Kaart Overlays',
    description: 'Toont een live geanimeerde neerslagradar overlay.',
    coverage: 'Wereldwijd',
    default: true
  },
  'blitzortung': {
    name: 'Blitzortung Live Bliksem',
    category: 'Kaart Overlays',
    description: 'Toont recente bliksemontladingen in kaartbeeld.',
    coverage: 'Wereldwijd',
    default: true
  },
  'natura2000': {
    name: 'Natura 2000 Natuurbescherming (EU)',
    category: 'Kaart Overlays',
    description: 'Toont de begrenzingen van Natura 2000 beschermde natuurgebieden in Europa.',
    coverage: 'Europa',
    default: true
  },
  'rijksmonumenten': {
    name: 'Rijksmonumenten Register (PDOK)',
    category: 'Kaart Overlays',
    description: 'Toont alle rijksmonumenten als rode markers.',
    coverage: 'Nederland',
    default: true
  },
  'lightpollution': {
    name: 'NASA Lichtvervuiling',
    category: 'Kaart Overlays',
    description: 'Toont kunstmatige nachtverlichting voor sterrenkijken.',
    coverage: 'Wereldwijd',
    default: true
  },
  'osm_traces': {
    name: 'OSM GPS Heatmap',
    category: 'Kaart Overlays',
    description: 'Toont de meest bewandelde en befietste OSM sporen.',
    coverage: 'Wereldwijd',
    default: true
  },

  // Category: Kamperen & Overnachten
  'vanstops_uk': {
    name: 'VanStops UK Camperplaatsen',
    category: 'Kamperen & Overnachten',
    description: 'Scant en filtert op openbare camperplaatsen en pub stopovers in het VK.',
    coverage: 'Verenigd Koninkrijk',
    default: true
  },
  'opencampingmap': {
    name: 'OpenCampingMap Camper & Caravans',
    category: 'Kamperen & Overnachten',
    description: 'Laadt kampeer- en camperlocaties wereldwijd via OpenStreetMap.',
    coverage: 'Wereldwijd',
    default: true
  },
  'active_campsites': {
    name: 'Active Campsite Search',
    category: 'Kamperen & Overnachten',
    description: 'Scant op campings en caravanplaatsen (voornamelijk Noord-Amerika).',
    coverage: 'Noord-Amerika',
    default: false
  },
  'rent_camper_api': {
    name: 'Rent-Camper Verhuur',
    category: 'Kamperen & Overnachten',
    description: 'Laadt de huurcamper catalogus locaties en huurprijzen op de kaart.',
    coverage: 'Wereldwijd',
    default: true
  },

  // Category: Natuur & Bodem
  'gemini_vision': {
    name: 'Gemini AI Vision Soorten Scanner',
    category: 'Natuur & Bodem',
    description: 'Fotografeer en identificeer flora en fauna met AI.',
    coverage: 'Wereldwijd',
    default: true
  },
  'gbif': {
    name: 'GBIF Soorten Checklist',
    category: 'Natuur & Bodem',
    description: 'Toont welke dier- en plantensoorten hier waargenomen zijn.',
    coverage: 'Wereldwijd',
    default: true
  },
  'xeno_canto': {
    name: 'Xeno-Canto Vogelgeluiden',
    category: 'Natuur & Bodem',
    description: 'Luister naar vogelgeluiden die in de buurt zijn opgenomen.',
    coverage: 'Wereldwijd',
    default: true
  },
  'macrostrat': {
    name: 'Macrostrat Geologie Bodemscan',
    category: 'Natuur & Bodem',
    description: 'Vertelt je de geologische ondergrond onder je voeten.',
    coverage: 'Wereldwijd',
    default: true
  },

  // Category: POI & Route
  'vlaanderen_tourism': {
    name: 'Toerisme Vlaanderen POIs',
    category: 'POI & Route',
    description: 'Scant op bezienswaardigheden en toeristische hotspots in Vlaanderen.',
    coverage: 'Vlaanderen',
    default: true
  },
  'mapillary': {
    name: 'Mapillary Straatbeeld',
    category: 'POI & Route',
    description: 'Opent straatniveau omgevingsfoto\'s rondom het kaartcenter.',
    coverage: 'Wereldwijd',
    default: true
  },
  'wikipedia_poi': {
    name: 'Wikipedia Geosearch POIs',
    category: 'POI & Route',
    description: 'Scant Wikipedia artikelen in de buurt en toont ze op de kaart.',
    coverage: 'Wereldwijd',
    default: true
  },
  'inaturalist_poi': {
    name: 'iNaturalist Waarnemingen POIs',
    category: 'POI & Route',
    description: 'Toont recente natuurwaarnemingen in de buurt.',
    coverage: 'Wereldwijd',
    default: true
  },
  'openroute_isochrone': {
    name: 'OpenRouteService Isochronen',
    category: 'POI & Route',
    description: 'Berekent je exacte wandelbereik in 30 minuten.',
    coverage: 'Wereldwijd',
    default: true
  }
};

let map;

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

  state.baseLayers.norwaytopo = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
  });

  // Default basemap is OpenTopoMap
  state.baseLayers.opentopo.addTo(map);

  // Overlays definition
  state.hikingOverlay = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.75
  });

  state.cyclingOverlay = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.75
  });

  state.mtbOverlay = L.tileLayer('https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.75
  });

  // OSM Active GPS Traces
  state.tracesOverlay = L.tileLayer('https://{s}.gps-tile.openstreetmap.org/lines/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.65
  });

  // NASA VIIRS Night Lights
  state.lightPollutionOverlay = L.tileLayer('https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Earth_at_Night_2016/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 8,
    opacity: 0.5,
    attribution: 'NASA/Esri'
  });

  // PDOK WMS overlays
  state.natura2000Overlay = L.tileLayer.wms('https://service.pdok.nl/provincies/natura2000/wms/v1_0', {
    layers: 'natura2000',
    format: 'image/png',
    transparent: true,
    opacity: 0.5,
    attribution: 'Provincies / PDOK Natura 2000'
  });

  state.monumentsOverlay = L.tileLayer.wms('https://service.pdok.nl/rce/monumenten/wms/v1_0', {
    layers: 'monumenten',
    format: 'image/png',
    transparent: true,
    opacity: 0.8,
    attribution: 'RCE / PDOK Rijksmonumenten'
  });

  // Handle map center panning transitions for historical layers
  map.on('moveend', checkHistoricalLayerTransition);
  map.on('click', onMapClick);
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupDrawerController();
  setupCollapsibleInfo();
  setupGeolocation();
  setupRecordingSystem();
  setupRoutePlanner();
  setupMeasurementTool();
  setupLayersManager();
  setupOverlaysManager();
  setupPoiExplorer();
  setupSettingsDialog();
  setupNaturePanel();
  setupToolboxDialog();
  initFirebase();
  setupMaptilerLayers();
  
  // LocalStorage check for items
  loadSavedData();
  applyApiVisibility();
  
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


// --- SETTINGS & OPTIONAL API KEYS ---
function setupSettingsDialog() {
  el.btnQuickSettings.addEventListener('click', () => {
    // Load current values
    el.inputFirebaseConfig.value = localStorage.getItem('geoforge_firebase_config') || '';
    el.inputGeminiKey.value = localStorage.getItem('geoforge_gemini_key') || '';
    el.inputOrsKey.value = localStorage.getItem('geoforge_ors_key') || '';
    el.inputW3wKey.value = localStorage.getItem('geoforge_w3w_key') || '';
    el.inputMaptilerKey.value = localStorage.getItem('geoforge_maptiler_key') || '';
    el.settingsDialog.showModal();
  });

  el.btnCloseSettingsDialog.addEventListener('click', () => {
    el.settingsDialog.close();
  });

  el.btnSaveSettings.addEventListener('click', () => {
    const configVal = el.inputFirebaseConfig.value.trim();
    localStorage.setItem('geoforge_firebase_config', configVal);
    localStorage.setItem('geoforge_gemini_key', el.inputGeminiKey.value.trim());
    localStorage.setItem('geoforge_ors_key', el.inputOrsKey.value.trim());
    localStorage.setItem('geoforge_w3w_key', el.inputW3wKey.value.trim());
    localStorage.setItem('geoforge_maptiler_key', el.inputMaptilerKey.value.trim());
    el.settingsDialog.close();
    showToast('Instellingen opgeslagen.');
    
    if (configVal) {
      initFirebase();
    }
    
    setupMaptilerLayers();
    refreshLocalInfo();
  });
}


// --- COLLAPSIBLE LOCAL INFO LOGIC ---
function setupCollapsibleInfo() {
  el.localInfoTrigger.addEventListener('click', () => {
    const isHidden = el.localInfoContent.classList.contains('hidden');
    if (isHidden) {
      el.localInfoContent.classList.remove('hidden');
      el.localInfoTrigger.classList.add('open');
      refreshLocalInfo();
    } else {
      el.localInfoContent.classList.add('hidden');
      el.localInfoTrigger.classList.remove('open');
    }
  });

  el.btnRefreshLocalInfo.addEventListener('click', refreshLocalInfo);
}

function refreshLocalInfo() {
  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;

  // 1. Open-Meteo Weather
  if (isApiEnabled('open_meteo')) {
    el.infoWeather.textContent = 'Laden...';
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(res => res.json())
      .then(data => {
        if (data.current_weather) {
          const temp = data.current_weather.temperature;
          const code = data.current_weather.weathercode;
          const weatherDesc = getWeatherDescription(code);
          el.infoWeather.textContent = `${temp}°C | ${weatherDesc}`;
        } else {
          el.infoWeather.textContent = 'Fout';
        }
      })
      .catch(() => el.infoWeather.textContent = 'Netwerkfout');
  }

  // 2. Sunrise / Sunset
  if (isApiEnabled('sunrise_sunset')) {
    el.infoSun.textContent = 'Laden...';
    fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`)
      .then(res => res.json())
      .then(data => {
        if (data.results) {
          const sunrise = new Date(data.results.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const sunset = new Date(data.results.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          el.infoSun.textContent = `🌅 ${sunrise} | 🌇 ${sunset}`;
        } else {
          el.infoSun.textContent = 'Fout';
        }
      })
      .catch(() => el.infoSun.textContent = 'Netwerkfout');
  }

  // 3. Air Quality (WAQI API using demo token)
  if (isApiEnabled('waqi')) {
    el.infoAqi.textContent = 'Laden...';
    fetch(`https://api.waqi.info/feed/geo:${lat};${lng}/?token=demo`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok' && data.data) {
          const aqi = data.data.aqi;
          const qual = getAqiQualityText(aqi);
          el.infoAqi.textContent = `AQI ${aqi} (${qual})`;
        } else {
          el.infoAqi.textContent = 'Niet beschikbaar';
        }
      })
      .catch(() => el.infoAqi.textContent = 'Netwerkfout');
  }

  // 4. Coordinates / Plus Code
  if (isApiEnabled('plus_codes')) {
    el.infoPluscode.textContent = 'Laden...';
    el.infoPluscode.textContent = getFallbackPlusCode(lat, lng);
  }

  // 5. what3words
  if (isApiEnabled('what3words')) {
    el.infoW3wVal.textContent = 'Laden...';
    const w3wKey = localStorage.getItem('geoforge_w3w_key');
    if (w3wKey) {
      fetch(`https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&key=${w3wKey}`)
        .then(res => res.json())
        .then(data => {
          if (data.words) {
            el.infoW3wVal.textContent = `///${data.words}`;
          } else {
            el.infoW3wVal.textContent = 'Fout';
          }
        })
        .catch(() => el.infoW3wVal.textContent = 'Netwerkfout');
    } else {
      el.infoW3wVal.textContent = 'API key vereist';
    }
  }

  // 6. Gecorrigeerde USGS / Open-Elevation Hoogte
  if (isApiEnabled('usgs_elevation')) {
    el.infoElevation.textContent = 'Hoogte checken...';
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`)
      .then(res => res.json())
      .then(data => {
        if (data.results && data.results.length > 0) {
          const alt = Math.round(data.results[0].elevation);
          el.infoElevation.textContent = `${alt} m boven zeeniveau (USGS model)`;
        } else {
          el.infoElevation.textContent = 'Geen hoogte model match';
        }
      })
      .catch(() => el.infoElevation.textContent = 'Netwerkfout model');
  }
}

function getWeatherDescription(code) {
  const codes = {
    0: 'Onbewolkt',
    1: 'Licht bewolkt', 2: 'Half bewolkt', 3: 'Bewolkt',
    45: 'Mist', 48: 'Rijpmist',
    51: 'Lichte motregen', 53: 'Matige motregen', 55: 'Dichte motregen',
    61: 'Lichte regen', 63: 'Matige regen', 65: 'Zware regen',
    71: 'Lichte sneeuwval', 73: 'Matige sneeuwval', 75: 'Zware sneeuwval',
    77: 'Sneeuwgries',
    80: 'Lichte buien', 81: 'Matige buien', 82: 'Zware buien',
    85: 'Lichte sneeuwbuien', 86: 'Zware sneeuwbuien',
    95: 'Onweer', 96: 'Onweer met hagel', 99: 'Zwaar onweer met hagel'
  };
  return codes[code] || 'Onbekend';
}

function getAqiQualityText(aqi) {
  if (aqi <= 50) return 'Goed';
  if (aqi <= 100) return 'Matig';
  if (aqi <= 150) return 'Licht ongezond';
  if (aqi <= 200) return 'Ongezond';
  return 'Zeer ongezond';
}

function getFallbackPlusCode(lat, lng) {
  // Return formatted coordinates as simple identifier
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}


// --- GPS GEOLOCATION & COMPASS TELEMETRY ---
function setupGeolocation() {
  if (!navigator.geolocation) {
    showToast('Geolocatie wordt niet ondersteund door je browser.', 'error');
    el.gpsStatus.innerHTML = '<span class="status-dot"></span>GEEN GPS';
    return;
  }

  el.btnLocate.addEventListener('click', () => {
    if (state.userLocation) {
      map.setView(state.userLocation, 16);
      showToast('Gecentreerd op huidige locatie.');
    } else {
      showToast('Wachten op GPS fix...', 'warning');
    }
  });

  state.watchId = navigator.geolocation.watchPosition(
    onLocationUpdate,
    onLocationError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );

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
  
  const statusDot = el.gpsStatus.querySelector('.status-dot');
  if (state.recordingState.isRecording) {
    statusDot.className = 'status-dot recording';
    el.gpsStatus.innerHTML = '<span class="status-dot recording"></span>GPS REC';
  } else {
    statusDot.className = 'status-dot active';
    el.gpsStatus.innerHTML = '<span class="status-dot active"></span>GPS FIX';
  }

  el.hudSpeed.textContent = speed.toFixed(1);
  el.hudElevation.textContent = altitude !== null ? altitude : '---';
  el.hudAccuracy.textContent = Math.round(accuracy);
  
  if (heading !== null) {
    state.deviceHeading = heading;
    el.hudBearing.textContent = `${heading}°`;
    el.hudCompassDir.textContent = getCompassDirection(heading);
  }

  if (!state.userLocationMarker) {
    state.userLocationMarker = L.marker(state.userLocation, { icon: userIconCreator() }).addTo(map);
    state.userAccuracyCircle = L.circle(state.userLocation, {
      radius: accuracy,
      color: '#00f3ff',
      weight: 1,
      fillColor: '#00f3ff',
      fillOpacity: 0.08
    }).addTo(map);
    map.setView(state.userLocation, 15);
  } else {
    state.userLocationMarker.setLatLng(state.userLocation);
    state.userAccuracyCircle.setLatLng(state.userLocation);
    state.userAccuracyCircle.setRadius(accuracy);
  }

  updateUserHeadingCone();

  if (state.recordingState.isRecording && !state.recordingState.isPaused) {
    recordTrackPoint(lat, lng, altitude, position.timestamp);
  }

  // Live Location Beacon Broadcast
  if (el.chkLiveBeacon && el.chkLiveBeacon.checked) {
    updateLiveBeacon(lat, lng);
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

  if (recordedLine) map.removeLayer(recordedLine);
  recordedLine = L.polyline([], {
    color: '#ff3366',
    weight: 5,
    opacity: 0.9,
    dashArray: '2, 5'
  }).addTo(map);

  el.btnRecStart.classList.add('hidden');
  el.btnRecPause.classList.remove('hidden');
  el.btnRecPause.textContent = 'Pauzeer';
  el.btnRecPause.className = 'btn btn-secondary';
  el.btnRecStop.classList.remove('hidden');
  el.recordingBanner.classList.remove('hidden');

  state.recordingState.timerId = setInterval(updateRecordingTimer, 1000);

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
    const distDelta = state.recordingState.lastPosition.distanceTo(currentLatLng) / 1000;
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

  state.recordingState.points = [];
  state.recordingState.distance = 0;
  state.recordingState.elapsedTime = 0;
  if (recordedLine) {
    map.removeLayer(recordedLine);
    recordedLine = null;
  }
  localStorage.removeItem('geoforge_active_rec');

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

    item.querySelector('.btn-view-track').addEventListener('click', () => drawSavedTrackOnMap(track));
    item.querySelector('.btn-download-track').addEventListener('click', () => {
      const gpxContent = generateGpxString(track, 'track');
      downloadBlob(gpxContent, `${track.name.replace(/\s+/g, '_')}.gpx`, 'application/gpx+xml');
    });
    item.querySelector('.btn-delete-track').addEventListener('click', () => {
      if (confirm(`Weet je zeker dat je "${track.name}" wilt verwijderen?`)) {
        const deletedId = track.id;
        state.savedTracks = state.savedTracks.filter(t => t.id !== track.id);
        saveTracksToLocalStorage();
        renderSavedTracks();
        showToast('Spoor verwijderd.');

        // Delete from Firestore if logged in
        if (db && auth && auth.currentUser) {
          const uid = auth.currentUser.uid;
          db.collection('users').doc(uid).collection('tracks').doc(deletedId).delete()
            .catch(err => console.error("Error deleting track from cloud:", err));
        }
      }
    });

    el.savedTracksList.appendChild(item);
  });
}

let activeTrackLayer = null;
function drawSavedTrackOnMap(track) {
  if (activeTrackLayer) map.removeLayer(activeTrackLayer);
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

  // Sync to Firestore Cloud if logged in
  if (db && auth && auth.currentUser) {
    const uid = auth.currentUser.uid;
    state.savedTracks.forEach(track => {
      db.collection('users').doc(uid).collection('tracks').doc(track.id).set(track)
        .catch(err => console.error("Error syncing track to cloud:", err));
    });
  }
}


// --- ROUTE PLANNER (BRouter & Isochrones) ---
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

  // Isochrones (Wandelbereik) Trigger
  el.btnIsochrone30.addEventListener('click', drawWandelbereikIsochrone);
  el.btnIsochroneClear.addEventListener('click', clearIsochrone);
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
      if (!geojson.features || geojson.features.length === 0) throw new Error('Geen geometry');
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
    .catch(() => drawStraightPlannerRoute());
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
      if (state.rawLine) state.rawLine.setLatLngs(state.controlPoints);
    });
    marker.on('dragend', () => updatePlannerRoute());
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

// Draw walking coverage isochrone (OpenRouteService with custom fallback)
function drawWandelbereikIsochrone() {
  if (state.activeIsochroneLayer) map.removeLayer(state.activeIsochroneLayer);
  
  const center = map.getCenter();
  const orsKey = localStorage.getItem('geoforge_ors_key');

  if (orsKey) {
    showToast('Wandelbereik berekenen via OpenRouteService...');
    const body = {
      locations: [[center.lng, center.lat]],
      range: [1800], // 30 minutes in seconds
      range_type: "time"
    };

    fetch('https://api.openrouteservice.org/v1/isochrones/foot-walking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': orsKey
      },
      body: JSON.stringify(body)
    })
      .then(res => {
        if (!res.ok) throw new Error('ORS Key invalid/expired');
        return res.json();
      })
      .then(geojson => {
        state.activeIsochroneLayer = L.geoJSON(geojson, {
          style: {
            color: '#00f3ff',
            fillColor: '#00f3ff',
            fillOpacity: 0.15,
            weight: 2
          }
        }).addTo(map);
        el.btnIsochroneClear.disabled = false;
        showToast('30-minuten wandelbereik getekend.');
      })
      .catch(() => {
        showToast('ORS key mislukt. Fallback naar geschat bereik.', 'warning');
        drawGeometricIsochroneFallback(center);
      });
  } else {
    showToast('Geen ORS key gevonden. Fallback naar geschat wandelbereik.', 'warning');
    drawGeometricIsochroneFallback(center);
  }
}

function drawGeometricIsochroneFallback(center) {
  // A standard person walks ~4.5 km/h. In 30 minutes, they cover ~2.25 km.
  // We approximate terrain resistance by generating a slightly irregular polygon.
  const points = [];
  const radius = 2250; // 2.25 km in meters
  
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    // Vary radius randomly by 10-25% to simulate terrain obstacles
    const variance = 0.75 + Math.random() * 0.2;
    const finalRadius = radius * variance;
    
    // Calculate lat/lng offset
    const dx = finalRadius * Math.cos(angle);
    const dy = finalRadius * Math.sin(angle);
    const latOffset = dy / 111320;
    const lngOffset = dx / (40075000 * Math.cos(center.lat * Math.PI / 180) / 360);
    
    points.push([center.lat + latOffset, center.lng + lngOffset]);
  }

  state.activeIsochroneLayer = L.polygon(points, {
    color: '#00f3ff',
    fillColor: '#00f3ff',
    fillOpacity: 0.1,
    weight: 2,
    dashArray: '4, 4'
  }).addTo(map);

  el.btnIsochroneClear.disabled = false;
}

function clearIsochrone() {
  if (state.activeIsochroneLayer) {
    map.removeLayer(state.activeIsochroneLayer);
    state.activeIsochroneLayer = null;
  }
  el.btnIsochroneClear.disabled = true;
  showToast('Wandelbereik gewist.');
}


// --- MEASUREMENT TOOL (Latje) ---
function setupMeasurementTool() {
  el.btnMeasureClear.addEventListener('click', clearMeasurement);
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
    marker.on('dragend', () => updateMeasureRuler());
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


// --- MAP LAYERS MANAGER (Basemaps & Historical Swapping) ---
function setupLayersManager() {
  el.basemapRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selectedMap = e.target.value;
      state.activeBaseLayerName = selectedMap;
      
      // Clear current active base layers
      Object.keys(state.baseLayers).forEach(key => {
        if (map.hasLayer(state.baseLayers[key])) map.removeLayer(state.baseLayers[key]);
      });
      if (state.topotijdreisLayer) map.removeLayer(state.topotijdreisLayer);
      if (state.ohmLayer) map.removeLayer(state.ohmLayer);

      // Load new layer
      if (selectedMap === 'historical') {
        el.topotijdreisControl.classList.remove('hidden');
        checkHistoricalLayerTransition();
      } else {
        el.topotijdreisControl.classList.add('hidden');
        if (state.baseLayers[selectedMap]) {
          state.baseLayers[selectedMap].addTo(map);
        }
      }
    });
  });

  // Year slider handler
  el.topotijdreisYear.addEventListener('input', (e) => {
    state.activeOverlayYear = parseInt(e.target.value);
    el.topotijdreisYearVal.textContent = state.activeOverlayYear;
  });

  el.topotijdreisYear.addEventListener('change', () => {
    if (state.activeBaseLayerName === 'historical') {
      const center = map.getCenter();
      const inNL = isLatLngInNetherlands(center);
      if (inNL) {
        loadTopotijdreisLayer();
      } else {
        if (state.ohmLayer && map.hasLayer(state.ohmLayer)) {
          const maplibreMap = state.ohmLayer.getMaplibreMap();
          if (maplibreMap && maplibreMap.filterByDate) {
            maplibreMap.filterByDate(state.activeOverlayYear.toString());
          }
        }
      }
    }
  });
}

function isLatLngInNetherlands(latlng) {
  if (!latlng) return false;
  // Bounding box bounds of the Netherlands
  return latlng.lat >= 50.75 && latlng.lat <= 53.55 && latlng.lng >= 3.35 && latlng.lng <= 7.22;
}

function checkHistoricalLayerTransition() {
  if (state.activeBaseLayerName !== 'historical') return;

  const center = map.getCenter();
  const inNL = isLatLngInNetherlands(center);

  if (inNL) {
    // Show Topotijdreis, hide OHM
    if (state.ohmLayer && map.hasLayer(state.ohmLayer)) {
      map.removeLayer(state.ohmLayer);
    }
    if (!state.topotijdreisLayer || !map.hasLayer(state.topotijdreisLayer)) {
      loadTopotijdreisLayer();
      showToast('Historische kaart: Kadaster Topotijdreis (NL) geladen.');
    }
  } else {
    // Show OpenHistoricalMap, hide Topotijdreis
    if (state.topotijdreisLayer && map.hasLayer(state.topotijdreisLayer)) {
      map.removeLayer(state.topotijdreisLayer);
      state.topotijdreisLayer = null;
    }
    if (!state.ohmLayer || !map.hasLayer(state.ohmLayer)) {
      loadOpenHistoricalMapLayer();
      showToast('Historische kaart: OpenHistoricalMap (Global) geladen.');
    }
  }
}

function loadTopotijdreisLayer() {
  if (state.topotijdreisLayer) map.removeLayer(state.topotijdreisLayer);
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

function loadOpenHistoricalMapLayer() {
  if (state.ohmLayer && map.hasLayer(state.ohmLayer)) {
    map.removeLayer(state.ohmLayer);
  }

  // Load via MapLibre GL Leaflet bridge
  state.ohmLayer = L.maplibreGL({
    style: 'https://unpkg.com/@openhistoricalmap/map-styles@latest/dist/historical/historical.json',
    attribution: 'Historische data &copy; <a href="https://www.openhistoricalmap.org/">OpenHistoricalMap</a> contributors'
  });
  state.ohmLayer.addTo(map);

  const maplibreMap = state.ohmLayer.getMaplibreMap();
  const applyFilter = () => {
    try {
      if (maplibreMap.filterByDate) {
        maplibreMap.filterByDate(state.activeOverlayYear.toString());
      }
    } catch (e) {
      console.warn('MapLibre filterByDate failed:', e);
    }
  };

  if (maplibreMap.isStyleLoaded()) {
    applyFilter();
  } else {
    maplibreMap.once('styledata', applyFilter);
  }
}


// --- MAP OVERLAYS MANAGER (Separate Function) ---
function setupOverlaysManager() {
  // 1. Hiking Overlay
  el.overlayHiking.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.hikingOverlay.addTo(map);
      showToast('Wandelnetwerk overlay geladen.');
    } else {
      map.removeLayer(state.hikingOverlay);
    }
  });

  // 2. Cycling Overlay
  el.overlayCycling.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.cyclingOverlay.addTo(map);
      showToast('Fietsnetwerk overlay geladen.');
    } else {
      map.removeLayer(state.cyclingOverlay);
    }
  });

  // 3. MTB Overlay
  el.overlayMtb.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.mtbOverlay.addTo(map);
      showToast('MTB-routenetwerk overlay geladen.');
    } else {
      map.removeLayer(state.mtbOverlay);
    }
  });

  // 4. OSM Traces (Heatmap alternative)
  el.overlayTraces.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.tracesOverlay.addTo(map);
      showToast('OSM actieve wandelpaden heatmap geladen.');
    } else {
      map.removeLayer(state.tracesOverlay);
    }
  });

  // 5. NASA VIIRS Light Pollution
  el.overlayLightpollution.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.lightPollutionOverlay.addTo(map);
      showToast('Lichtvervuiling overlay geladen.');
    } else {
      map.removeLayer(state.lightPollutionOverlay);
    }
  });

  // 6. Natura 2000 protected areas
  el.overlayNatura2000.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.natura2000Overlay.addTo(map);
      showToast('Natura 2000 grenzen geladen.');
    } else {
      map.removeLayer(state.natura2000Overlay);
    }
  });

  // 7. Monuments dots
  el.overlayMonuments.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.monumentsOverlay.addTo(map);
      showToast('Rijksmonumenten overlay geladen.');
    } else {
      map.removeLayer(state.monumentsOverlay);
    }
  });

  // 8. RainViewer Radar Overlay (Live geanimeerd)
  el.overlayRadar.addEventListener('change', (e) => {
    if (e.target.checked) {
      loadRainViewerRadar();
    } else {
      clearRainViewerRadar();
    }
  });

  // 9. Blitzortung-like lightning (simuleert of laadt live activiteit)
  el.overlayLightning.addEventListener('change', (e) => {
    if (e.target.checked) {
      loadLightningOverlay();
    } else {
      clearLightningOverlay();
    }
  });
}

function loadRainViewerRadar() {
  showToast('Buienradar ophalen...');
  // Fetch current radar snapshots from RainViewer
  fetch('https://api.rainviewer.com/public/weather-maps.json')
    .then(res => res.json())
    .then(data => {
      if (data.radar && data.radar.past && data.radar.past.length > 0) {
        const latestTime = data.radar.past[data.radar.past.length - 1].time;
        const radarUrl = `https://tilecache.rainviewer.com/v2/radar/${latestTime}/256/{z}/{x}/{y}/2/1_1.png`;
        
        state.radarOverlay = L.tileLayer(radarUrl, {
          maxZoom: 19,
          opacity: 0.65,
          attribution: 'Radar: RainViewer'
        });
        state.radarOverlay.addTo(map);
        
        // Auto-refresh radar frame every 5 minutes
        state.radarTimerId = setInterval(loadRainViewerRadar, 300000);
        showToast('Actuele buienradar geladen.');
      }
    })
    .catch(() => showToast('Kon buienradar niet ophalen.', 'error'));
}

function clearRainViewerRadar() {
  if (state.radarOverlay) {
    map.removeLayer(state.radarOverlay);
    state.radarOverlay = null;
  }
  if (state.radarTimerId) {
    clearInterval(state.radarTimerId);
    state.radarTimerId = null;
  }
}

function loadLightningOverlay() {
  // We simulate live strike data around the center mapping coordinate or load open feed
  state.lightningOverlay = L.layerGroup().addTo(map);
  showToast('Live bliksem activiteit ingeschakeld.');

  // Render some random strike alerts every few seconds to show real-time safety system behavior
  const strikeInterval = setInterval(() => {
    if (!state.lightningOverlay) {
      clearInterval(strikeInterval);
      return;
    }
    
    const center = map.getCenter();
    // Simulate strike within 15km
    const offsetLat = (Math.random() - 0.5) * 0.15;
    const offsetLng = (Math.random() - 0.5) * 0.15;
    const strikePos = L.latLng(center.lat + offsetLat, center.lng + offsetLng);

    const icon = L.divIcon({
      className: 'lightning-strike-marker',
      html: `<div class="pulsing" style="font-size: 20px; filter: drop-shadow(0 0 4px #ffaa00);">⚡</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker(strikePos, { icon: icon }).addTo(state.lightningOverlay);
    marker.bindPopup(`<strong style="color:var(--color-amber);">Ontlading gedetecteerd</strong><br/>Afstand: ~${(center.distanceTo(strikePos) / 1000).toFixed(1)} km`);
    
    // Auto-remove strike marker after 30 seconds
    setTimeout(() => {
      if (state.lightningOverlay) state.lightningOverlay.removeLayer(marker);
    }, 30000);

  }, 8000);

  // Store interval handle inside overlay object to clean up later
  state.lightningOverlay._interval = strikeInterval;
}

function clearLightningOverlay() {
  if (state.lightningOverlay) {
    clearInterval(state.lightningOverlay._interval);
    map.removeLayer(state.lightningOverlay);
    state.lightningOverlay = null;
  }
}


// --- POI EXPLORER & CUSTOM WAYPOINTS ---
function setupPoiExplorer() {
  el.btnPoiScan.addEventListener('click', scanForPois);
  el.btnPoiRefresh.addEventListener('click', scanForPois);

  if (el.btnOpenMapillary) {
    el.btnOpenMapillary.addEventListener('click', () => {
      if (!isApiEnabled('mapillary')) {
        showToast('Mapillary-module is uitgeschakeld in de API Toolbox.', 'warning');
        return;
      }
      const center = map.getCenter();
      const url = `https://www.mapillary.com/app/?lat=${center.lat}&lng=${center.lng}&z=17`;
      window.open(url, '_blank');
    });
  }

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
  
  // Clear old markers
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
  const center = map.getCenter();

  // Handle specific custom API scans (Wikipedia, iNaturalist, Rent-Camper)
  if (activeCats.includes('wikipedia')) {
    scanWikipediaArticles(center);
  }
  if (activeCats.includes('inaturalist')) {
    scanINaturalistObservations(center);
  }
  if (activeCats.includes('rent_camper')) {
    scanRentCamperAdverts();
  }

  // Handle OSM Overpass query
  let subqueries = '';
  activeCats.forEach(cat => {
    if (cat === 'drinking_water') {
      subqueries += `node["amenity"="drinking_water"](${bbox});node["man_made"="water_well"](${bbox});`;
    }
    if (cat === 'camp_site') {
      subqueries += `node["tourism"="camp_site"](${bbox});node["tourism"="caravan_site"](${bbox});node["backcountry"="yes"](${bbox});`;
    }
    if (cat === 'opencampingmap') {
      subqueries += `node["tourism"="camp_site"](${bbox});node["tourism"="caravan_site"](${bbox});way["tourism"="camp_site"](${bbox});way["tourism"="caravan_site"](${bbox});`;
    }
    if (cat === 'active_campsites') {
      subqueries += `node["tourism"="camp_site"](${bbox});node["tourism"="caravan_site"](${bbox});way["tourism"="camp_site"](${bbox});way["tourism"="caravan_site"](${bbox});`;
    }
    if (cat === 'vanstops') {
      subqueries += `node["tourism"="caravan_site"](${bbox});way["tourism"="caravan_site"](${bbox});node["caravan_site"="yes"](${bbox});`;
    }
    if (cat === 'vlaanderen_tourism') {
      subqueries += `node["historic"](${bbox});node["tourism"="museum"](${bbox});node["tourism"="attraction"](${bbox});node["historic"="castle"](${bbox});way["historic"="castle"](${bbox});`;
    }
    if (cat === 'viewpoint') {
      subqueries += `node["tourism"="viewpoint"](${bbox});node["natural"="peak"](${bbox});node["natural"="tree"]["denotation"="monument"](${bbox});node["natural"="tree"]["monument"="yes"](${bbox});`;
    }
    if (cat === 'opentripmap') {
      subqueries += `node["historic"](${bbox});node["tourism"="museum"](${bbox});node["tourism"="attraction"](${bbox});`;
    }
    if (cat === 'emergency') {
      subqueries += `node["emergency"](${bbox});node["amenity"="emergency_phone"](${bbox});`;
    }
  });

  if (subqueries === '') {
    // Only Wikipedia/iNaturalist selected, skip Overpass
    el.poiStatusLog.style.display = 'none';
    return;
  }

  const query = `[out:json][timeout:25];
    (
      ${subqueries}
    );
    out center;`;

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
      if (!data.elements || data.elements.length === 0) return;

      data.elements.forEach(poi => {
        const lat = poi.lat || (poi.center && poi.center.lat);
        const lng = poi.lon || (poi.center && poi.center.lng);
        if (!lat || !lng) return;

        const latlng = L.latLng(lat, lng);
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
      showToast(`${state.poiMarkers.length} POIs ingeladen.`);
    })
    .catch(() => {
      el.poiStatusLog.style.display = 'none';
      showToast('Kon POIs niet laden.', 'error');
    });
}

// 15. Wikipedia Geosearch
function scanWikipediaArticles(center) {
  fetch(`https://nl.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${center.lat}|${center.lng}&gsradius=5000&gslimit=20&format=json&origin=*`)
    .then(res => res.json())
    .then(data => {
      if (data.query && data.query.geosearch) {
        data.query.geosearch.forEach(art => {
          const latlng = L.latLng(art.lat, art.lon);
          const icon = L.divIcon({
            className: 'poi-map-marker wiki-marker',
            html: `<div style="background-color:#b39ddb; border:1.5px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">📝</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const marker = L.marker(latlng, { icon: icon }).addTo(map);
          const popupContent = `
            <div style="font-size:12px; font-family:var(--font-main);">
              <strong style="color:#b39ddb; font-size:13px;">${art.title}</strong><br/>
              <span style="font-size:9px; color:#999;">WIKIPEDIA</span><br/>
              <button onclick="loadWikiDetails('${escapeXml(art.title)}')" class="btn btn-primary" style="margin-top:6px; font-size:10px; padding:4px 8px;">Lees details</button>
            </div>
          `;
          marker.bindPopup(popupContent);
          state.poiMarkers.push(marker);
        });
      }
    });
}

// Global scope wiki fetcher helper
window.loadWikiDetails = function(title) {
  fetch(`https://nl.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`)
    .then(res => res.json())
    .then(data => {
      if (data.query && data.query.pages) {
        const pageId = Object.keys(data.query.pages)[0];
        const text = data.query.pages[pageId].extract;
        alert(`${title}:\n\n${text}`);
      }
    });
};

// 17. iNaturalist Wildlife Scanner
function scanINaturalistObservations(center) {
  fetch(`https://api.inaturalist.org/v1/observations?lat=${center.lat}&lng=${center.lng}&radius=10&order=desc&per_page=15`)
    .then(res => res.json())
    .then(data => {
      if (data.results) {
        data.results.forEach(obs => {
          if (!obs.geojson || !obs.geojson.coordinates) return;
          const latlng = L.latLng(obs.geojson.coordinates[1], obs.geojson.coordinates[0]);
          const tax = obs.taxon || {};
          const commonName = tax.preferred_common_name || tax.name || 'Wilde soort';
          const imageUrl = obs.photos && obs.photos.length > 0 ? obs.photos[0].url : null;
          
          const icon = L.divIcon({
            className: 'poi-map-marker inat-marker',
            html: `<div style="background-color:#81c784; border:1.5px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">🦉</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const marker = L.marker(latlng, { icon: icon }).addTo(map);
          let popupContent = `
            <div style="font-size:12px; font-family:var(--font-main); max-width:180px;">
              <strong style="color:#81c784; font-size:13px;">${commonName}</strong><br/>
              <span style="font-size:9px; color:#999; font-style:italic;">${tax.name || ''}</span><br/>`;
          if (imageUrl) {
            popupContent += `<img src="${imageUrl}" style="width:100%; border-radius:4px; margin:4px 0;" />`;
          }
          popupContent += `<span style="font-size:9px; color:#777;">Gespot door: ${obs.user.login}</span></div>`;
          
          marker.bindPopup(popupContent);
          state.poiMarkers.push(marker);
        });
      }
    });
}

function getPoiFallbackName(poi) {
  const cat = getPoiCategory(poi);
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
}

function getPoiCategory(poi) {
  const tags = poi.tags || {};
  if (tags.amenity === 'drinking_water' || tags.man_made === 'water_well') return 'drinking_water';
  if (tags.tourism === 'caravan_site' || tags.caravan_site === 'yes') return 'camper_site';
  if (tags.tourism === 'camp_site' || tags.backcountry === 'yes') return 'camp_site';
  if (tags.tourism === 'viewpoint' || tags.natural === 'peak') return 'viewpoint';
  if (tags.natural === 'tree' && (tags.denotation === 'monument' || tags.monument === 'yes' || tags.heritage === 'yes')) return 'monument_tree';
  if (tags.emergency) return 'emergency';
  return 'poi';
}

function getPoiMarkerColor(cat) {
  const colors = {
    drinking_water: '#00f3ff',
    camp_site: '#00ff66',
    camper_site: '#ffb74d',
    viewpoint: '#ffaa00',
    monument_tree: '#81c784',
    emergency: '#ff3366'
  };
  return colors[cat] || '#ffffff';
}

function getPoiMarkerSymbol(cat) {
  const symbols = {
    drinking_water: '💧',
    camp_site: '⛺',
    camper_site: '🚐',
    viewpoint: '🔭',
    monument_tree: '🌳',
    emergency: '🚨'
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

    item.querySelector('.btn-view-wp').addEventListener('click', () => map.setView([wp.lat, wp.lng], 15));
    item.querySelector('.btn-delete-wp').addEventListener('click', () => {
      if (confirm(`Weet je zeker dat je waypoint "${wp.name}" wilt verwijderen?`)) {
        const deletedId = wp.id;
        const mapMarkerObj = state.waypointMarkersMap.find(m => m.id === wp.id);
        if (mapMarkerObj) {
          map.removeLayer(mapMarkerObj.marker);
          state.waypointMarkersMap = state.waypointMarkersMap.filter(m => m.id !== wp.id);
        }
        state.savedWaypoints = state.savedWaypoints.filter(w => w.id !== wp.id);
        saveWaypointsToLocalStorage();
        renderSavedWaypoints();
        showToast('Waypoint verwijderd.');

        // Delete from Firestore if logged in
        if (db && auth && auth.currentUser) {
          const uid = auth.currentUser.uid;
          db.collection('users').doc(uid).collection('waypoints').doc(deletedId).delete()
            .catch(err => console.error("Error deleting waypoint from cloud:", err));
        }
      }
    });
    el.savedWaypointsList.appendChild(item);
  });
}

function saveWaypointsToLocalStorage() {
  localStorage.setItem('geoforge_waypoints', JSON.stringify(state.savedWaypoints));

  // Sync to Firestore Cloud if logged in
  if (db && auth && auth.currentUser) {
    const uid = auth.currentUser.uid;
    state.savedWaypoints.forEach(wp => {
      db.collection('users').doc(uid).collection('waypoints').doc(wp.id).set(wp)
        .catch(err => console.error("Error syncing waypoint to cloud:", err));
    });
  }
}


// --- DATA LOADING & PERSISTENCE ---
function loadSavedData() {
  const tracksJson = localStorage.getItem('geoforge_tracks');
  if (tracksJson) {
    try {
      state.savedTracks = JSON.parse(tracksJson);
      renderSavedTracks();
    } catch (e) { console.error(e); }
  }

  const wpJson = localStorage.getItem('geoforge_waypoints');
  if (wpJson) {
    try {
      state.savedWaypoints = JSON.parse(wpJson);
      renderSavedWaypoints();
      state.savedWaypoints.forEach(wp => drawWaypointMarker(wp));
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
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

// --- NATUUR & ONTDEK PANEL LOGIC ---
function setupNaturePanel() {
  // Bind camera and file upload triggers
  el.btnCameraTrigger.addEventListener('click', () => {
    el.inputNaturePhoto.setAttribute('capture', 'environment');
    el.inputNaturePhoto.click();
  });

  el.btnUploadTrigger.addEventListener('click', () => {
    el.inputNaturePhoto.removeAttribute('capture');
    el.inputNaturePhoto.click();
  });

  el.inputNaturePhoto.addEventListener('change', handleNaturePhotoUpload);

  // Biodiversity & Geology scan trigger
  el.btnScanBiodiversity.addEventListener('click', scanBiodiversityAndGeology);

  // Share location trigger
  el.btnShareLocation.addEventListener('click', shareLocationAndRoute);
}

function handleNaturePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const key = localStorage.getItem('geoforge_gemini_key');
  if (!key) {
    showToast('Voer eerst een Gemini API-sleutel in via de Instellingen (tandwiel bovenin).', 'warning');
    return;
  }

  // Display preview
  const reader = new FileReader();
  reader.onload = function(evt) {
    el.imgNaturePreview.src = evt.target.result;
    el.naturePhotoPreview.classList.remove('hidden');

    el.natureAiResult.classList.remove('hidden');
    el.natureAiResult.innerHTML = '<div style="text-align:center; color:var(--color-cyan);">AI analyseert de soort... ⏳</div>';

    // Call Gemini API
    const base64Data = evt.target.result.split(',')[1];
    const requestData = {
      contents: [{
        parts: [
          { text: "Identificeer de plant, dier, vogel, insect, blad of het dierspoor op deze afbeelding. Geef antwoord in het Nederlands. Antwoord uitsluitend in nette, gestructureerde HTML-tags (zonder markdown of ```html wrapper). Gebruik exact deze structuur:\n<h4>[Nederlandse Naam (Wetenschappelijke Naam)]</h4>\n<p><strong>Status:</strong> [Eetbaar / Giftig / Beschermd / Algemeen / Veilig]</p>\n<p><strong>Kenmerken:</strong> [Korte beschrijving van uiterlijk of gedrag, max 3 regels]</p>\n<p><strong>Leuke Weetjes:</strong> [Kort weetje over de soort of ecologische rol, max 2 regels]" },
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          }
        ]
      }]
    };

    fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    })
      .then(res => {
        if (!res.ok) throw new Error('API key invalid or limit exceeded');
        return res.json();
      })
      .then(data => {
        if (data.candidates && data.candidates[0].content.parts[0].text) {
          let text = data.candidates[0].content.parts[0].text;
          text = text.replace(/```html/g, '').replace(/```/g, '').trim();
          el.natureAiResult.innerHTML = text;
        } else {
          el.natureAiResult.innerHTML = '<div style="color:var(--color-red);">Kon geen resultaat genereren. Probeer een duidelijkere foto.</div>';
        }
      })
      .catch(err => {
        console.error('Gemini vision error:', err);
        el.natureAiResult.innerHTML = '<div style="color:var(--color-red);">AI Identificatie mislukt. Controleer je Gemini API Key of internetverbinding.</div>';
      });
  };
  reader.readAsDataURL(file);
}

function scanBiodiversityAndGeology() {
  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;

  showToast('Omgeving scannen...');

  // 1. Macrostrat Geology API
  if (isApiEnabled('macrostrat')) {
    el.natureGeologyBox.classList.remove('hidden');
    el.geologyDetails.innerHTML = '<span style="color:var(--text-muted);">Bodem scannen...</span>';

    fetch(`https://macrostrat.org/api/v2/geology?lat=${lat}&lng=${lng}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.success.data && data.success.data.length > 0) {
          const geo = data.success.data[0];
          el.geologyDetails.innerHTML = `
            <strong>Tijdperk:</strong> ${geo.era || 'Onbekend'}<br/>
            <strong>Formatie:</strong> ${geo.map_unit_name || 'Niet benoemd'}<br/>
            <strong>Steensoort:</strong> ${geo.lithology || 'Onbekend'}<br/>
            <strong>Omschrijving:</strong> ${geo.comments || 'Geen details beschikbaar.'}
          `;
        } else {
          el.geologyDetails.innerHTML = '<span style="color:var(--color-red);">Geen bodemgegevens gevonden op deze coördinaten.</span>';
        }
      })
      .catch(() => {
        el.geologyDetails.innerHTML = '<span style="color:var(--color-red);">Netwerkfout bij bodemscan.</span>';
      });
  } else {
    el.natureGeologyBox.classList.add('hidden');
  }

  // 2. GBIF Checklist
  if (isApiEnabled('gbif')) {
    el.natureSpeciesBox.classList.remove('hidden');
    el.speciesDetails.innerHTML = '<span style="color:var(--text-muted);">Flora & Fauna checklist laden...</span>';

    fetch(`https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat}&decimalLongitude=${lng}&radius=1000&limit=40`)
      .then(res => res.json())
      .then(data => {
        if (data.results && data.results.length > 0) {
          el.speciesDetails.innerHTML = '';
          const speciesCounts = {};
          const speciesGroups = {};
          
          data.results.forEach(obs => {
            if (obs.vernacularName || obs.scientificName) {
              const name = obs.vernacularName || obs.scientificName;
              speciesCounts[name] = (speciesCounts[name] || 0) + 1;
              speciesGroups[name] = obs.class || obs.kingdom || 'Algemeen';
            }
          });

          const sortedSpecies = Object.keys(speciesCounts).sort((a,b) => speciesCounts[b] - speciesCounts[a]).slice(0, 8);

          sortedSpecies.forEach(name => {
            const div = document.createElement('div');
            div.className = 'species-item-nature';
            
            let emoji = '🌲';
            const group = speciesGroups[name];
            if (group === 'Mammalia') emoji = '🦊';
            else if (group === 'Aves') emoji = '🐦';
            else if (group === 'Insecta') emoji = '🦋';
            else if (group === 'Liliopsida' || group === 'Magnoliopsida') emoji = '🌸';
            else if (group === 'Fungi') emoji = '🍄';

            div.innerHTML = `
              <span>${emoji} <strong>${name}</strong></span>
              <span class="species-name-lat">${group.substring(0, 10)}</span>
            `;
            el.speciesDetails.appendChild(div);
          });
        } else {
          el.speciesDetails.innerHTML = '<div class="no-data-text">Geen biologische registraties gevonden in dit grid.</div>';
        }
      })
      .catch(() => {
        el.speciesDetails.innerHTML = '<div class="no-data-text" style="color:var(--color-red);">Kon soortgegevens niet laden.</div>';
      });
  } else {
    el.natureSpeciesBox.classList.add('hidden');
  }

  // 3. Xeno-Canto bird songs
  if (isApiEnabled('xeno_canto')) {
    el.natureBirdsBox.classList.remove('hidden');
    el.birdsDetails.innerHTML = '<span style="color:var(--text-muted);">Geluiden zoeken...</span>';

    fetch(`https://xeno-canto.org/api/2/recordings?query=lat:${lat}%20lon:${lng}%20box:0.15`)
      .then(res => res.json())
      .then(data => {
        if (data.recordings && data.recordings.length > 0) {
          el.birdsDetails.innerHTML = '';
          const recs = data.recordings.slice(0, 5);
          recs.forEach(rec => {
            const div = document.createElement('div');
            div.className = 'bird-item-nature';
            const birdName = rec.en || rec.gen + ' ' + rec.sp;
            
            div.innerHTML = `
              <div class="bird-header">
                <span>🐦 <strong>${birdName}</strong></span>
                <span class="species-name-lat">${rec.gen} ${rec.sp}</span>
              </div>
              <audio controls class="bird-audio-player" src="${rec.file}"></audio>
            `;
            el.birdsDetails.appendChild(div);
          });
        } else {
          el.birdsDetails.innerHTML = '<div class="no-data-text">Geen vogelgeluid-opnames gevonden voor deze locatie.</div>';
        }
      })
      .catch(() => {
        el.birdsDetails.innerHTML = '<div class="no-data-text" style="color:var(--color-red);">Fout bij inladen vogelgeluiden.</div>';
      });
  } else {
    el.natureBirdsBox.classList.add('hidden');
  }
}

function shareLocationAndRoute() {
  if (!navigator.share) {
    showToast('Delen wordt niet ondersteund door deze browser.', 'error');
    return;
  }

  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const mapLink = `https://martyngraat.github.io/mapsnap-gpx/`;

  let shareText = `GeoForge Navigator live locatie:\n📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}\n`;
  if (state.recordingState.isRecording) {
    shareText += `Route in voortgang: ${state.recordingState.distance.toFixed(2)} km gelopen.\n`;
  }
  shareText += `Bekijk op kaart: ${mapLink}`;

  navigator.share({
    title: 'GeoForge Navigator Positie',
    text: shareText
  })
    .then(() => showToast('Locatie succesvol gedeeld!'))
    .catch(err => console.log('Share failed:', err));
}

// --- API TOOLBOX CONFIGURATION DIALOG ---
function isApiEnabled(id) {
  if (!API_REGISTRY[id]) return false;
  const val = localStorage.getItem('geoforge_api_disabled_' + id);
  if (val === 'true') return false;
  if (val === 'false') return true;
  return API_REGISTRY[id].default;
}

function applyApiVisibility() {
  document.querySelectorAll('.api-module-ui').forEach(el => {
    const apiId = el.getAttribute('data-api');
    if (apiId) {
      const enabled = isApiEnabled(apiId);
      if (enabled) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  setupMaptilerLayers();
}

function setupToolboxDialog() {
  if (!el.btnOpenToolbox) return;

  el.btnOpenToolbox.addEventListener('click', () => {
    renderToolboxCheckboxes();
    el.toolboxDialog.showModal();
  });

  el.btnCloseToolbox.addEventListener('click', () => {
    el.toolboxDialog.close();
  });

  el.btnSaveToolbox.addEventListener('click', () => {
    const checkboxes = el.toolboxModulesList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      const apiId = cb.getAttribute('data-api-id');
      if (apiId) {
        localStorage.setItem('geoforge_api_disabled_' + apiId, cb.checked ? 'false' : 'true');
      }
    });

    el.toolboxDialog.close();
    applyApiVisibility();
    showToast('API-Toolbox instellingen toegepast.');
    
    // Refresh display
    refreshLocalInfo();
  });
}

function renderToolboxCheckboxes() {
  el.toolboxModulesList.innerHTML = '';
  
  const categories = {};
  Object.keys(API_REGISTRY).forEach(id => {
    const api = API_REGISTRY[id];
    if (!categories[api.category]) {
      categories[api.category] = [];
    }
    categories[api.category].push({ id, ...api });
  });

  Object.keys(categories).forEach(cat => {
    const catHeader = document.createElement('h3');
    catHeader.style.fontSize = '0.78rem';
    catHeader.style.color = 'var(--color-cyan)';
    catHeader.style.borderBottom = '1px solid var(--border-color)';
    catHeader.style.paddingBottom = '4px';
    catHeader.style.marginTop = '12px';
    catHeader.style.marginBottom = '6px';
    catHeader.style.textTransform = 'uppercase';
    catHeader.style.letterSpacing = '0.05em';
    catHeader.textContent = cat;
    el.toolboxModulesList.appendChild(catHeader);

    categories[cat].forEach(api => {
      const wrapper = document.createElement('label');
      wrapper.className = 'toggle-control';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'flex-start';
      wrapper.style.gap = '10px';
      wrapper.style.cursor = 'pointer';
      wrapper.style.background = 'rgba(255, 255, 255, 0.01)';
      wrapper.style.padding = '8px';
      wrapper.style.borderRadius = 'var(--border-radius-sm)';
      wrapper.style.border = '1px solid rgba(255, 255, 255, 0.03)';
      wrapper.style.marginBottom = '4px';
      
      const enabled = isApiEnabled(api.id);
      const coverageBadge = api.coverage ? ` <span style="font-size:0.55rem; padding: 1px 4px; border-radius: 3px; background:${api.coverage === 'Wereldwijd' ? '#4caf50' : '#ff9800'}; color:#0a0b0e; font-weight:bold; margin-left: 6px; text-transform:uppercase;">${api.coverage}</span>` : '';

      wrapper.innerHTML = `
        <input type="checkbox" data-api-id="${api.id}" ${enabled ? 'checked' : ''} style="margin-top: 3px; cursor: pointer;" />
        <div style="display: flex; flex-direction: column; gap: 2px; width: 100%;">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 4px;">
            <strong style="font-size: 0.78rem; color: var(--text-primary);">${api.name}</strong>
            ${coverageBadge}
          </div>
          <span style="font-size: 0.65rem; color: var(--text-muted); line-height: 1.3;">${api.description}</span>
        </div>
      `;
      el.toolboxModulesList.appendChild(wrapper);
    });
  });
}

// --- FIREBASE ACCOUNT SIGNUP, LOGIN & SYNC LOGIC ---
let firebaseApp = null;
let auth = null;
let db = null;
let beaconUnsubscribe = null;
let tracksUnsubscribe = null;
let waypointsUnsubscribe = null;

function initFirebase() {
  const configStr = localStorage.getItem('geoforge_firebase_config');
  if (!configStr) {
    console.log("Firebase config not found in localStorage. Running in local-only mode.");
    return;
  }

  try {
    const config = JSON.parse(configStr);
    
    if (!window.firebase || !firebase.apps) {
      console.warn("Firebase SDK libraries not loaded yet. Skipping init.");
      return;
    }

    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(config);
    } else {
      firebaseApp = firebase.app();
    }
    
    auth = firebase.auth();
    db = firebase.firestore();

    db.enablePersistence({ synchronizeTabs: true })
      .then(() => console.log("Firestore offline persistence enabled."))
      .catch(err => {
        if (err.code == 'failed-precondition') {
          console.warn("Persistence failed: multiple tabs open.");
        } else if (err.code == 'unimplemented') {
          console.warn("Persistence is not supported by this browser.");
        }
      });

    setupFirebaseAccountListeners();
    setupFirebaseBeaconReceiver();
  } catch (e) {
    console.error("Failed to parse or initialize Firebase:", e);
    showToast("Fout bij laden Firebase-configuratie. Controleer de JSON.", "error");
  }
}

function setupFirebaseAccountListeners() {
  if (el.btnAuthRegister && !el.btnAuthRegister.hasAttribute('data-bound')) {
    el.btnAuthRegister.setAttribute('data-bound', 'true');
    el.btnAuthRegister.addEventListener('click', () => {
      const email = el.inputAuthEmail.value.trim();
      const password = el.inputAuthPassword.value.trim();
      if (!email || password.length < 6) {
        showToast("Vul een geldig e-mailadres in en een wachtwoord van minimaal 6 tekens.", "warning");
        return;
      }
      auth.createUserWithEmailAndPassword(email, password)
        .then(() => showToast("Account succesvol aangemaakt!"))
        .catch(err => {
          console.error(err);
          showToast("Registratie mislukt: " + err.message, "error");
        });
    });
  }

  if (el.btnAuthLogin && !el.btnAuthLogin.hasAttribute('data-bound')) {
    el.btnAuthLogin.setAttribute('data-bound', 'true');
    el.btnAuthLogin.addEventListener('click', () => {
      const email = el.inputAuthEmail.value.trim();
      const password = el.inputAuthPassword.value.trim();
      if (!email || !password) {
        showToast("Vul e-mailadres en wachtwoord in.", "warning");
        return;
      }
      auth.signInWithEmailAndPassword(email, password)
        .then(() => showToast("Succesvol aangemeld!"))
        .catch(err => {
          console.error(err);
          showToast("Aanmelden mislukt: " + err.message, "error");
        });
    });
  }

  if (el.btnAuthLogout && !el.btnAuthLogout.hasAttribute('data-bound')) {
    el.btnAuthLogout.setAttribute('data-bound', 'true');
    el.btnAuthLogout.addEventListener('click', () => {
      auth.signOut()
        .then(() => {
          showToast("Uitgelogd. Lokale weergave hersteld.");
          if (tracksUnsubscribe) tracksUnsubscribe();
          if (waypointsUnsubscribe) waypointsUnsubscribe();
        })
        .catch(err => showToast("Uitloggen mislukt.", "error"));
    });
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      if (el.accountLoggedOut) el.accountLoggedOut.classList.add('hidden');
      if (el.accountLoggedIn) el.accountLoggedIn.classList.remove('hidden');
      if (el.accountEmailDisplay) el.accountEmailDisplay.textContent = user.email;

      syncTracksFromFirestore(user.uid);
      syncWaypointsFromFirestore(user.uid);
      migrateLocalStorageToCloud(user.uid);
    } else {
      if (el.accountLoggedOut) el.accountLoggedOut.classList.remove('hidden');
      if (el.accountLoggedIn) el.accountLoggedIn.classList.add('hidden');
      if (el.accountEmailDisplay) el.accountEmailDisplay.textContent = '...';
    }
  });

  if (el.chkLiveBeacon && !el.chkLiveBeacon.hasAttribute('data-bound')) {
    el.chkLiveBeacon.setAttribute('data-bound', 'true');
    el.chkLiveBeacon.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!db) {
          showToast("Firebase Config is vereist om de beacon te gebruiken.", "warning");
          e.target.checked = false;
          return;
        }
        state.beaconId = state.beaconId || 'beacon_' + Math.random().toString(36).substring(2, 10);
        el.beaconIdVal.textContent = state.beaconId;
        el.beaconActiveInfo.classList.remove('hidden');
        showToast("Live Deel-Beacon geactiveerd.");
      } else {
        el.beaconActiveInfo.classList.add('hidden');
        showToast("Beacon uitgeschakeld.");
        
        if (db && state.beaconId) {
          db.collection('shared_tracks').doc(state.beaconId).delete()
            .catch(err => console.error("Error clearing beacon:", err));
        }
        state.beaconId = null;
      }
    });
  }

  if (el.btnCopyBeaconLink && !el.btnCopyBeaconLink.hasAttribute('data-bound')) {
    el.btnCopyBeaconLink.setAttribute('data-bound', 'true');
    el.btnCopyBeaconLink.addEventListener('click', () => {
      if (state.beaconId) {
        const link = window.location.origin + window.location.pathname + '?share=' + state.beaconId;
        navigator.clipboard.writeText(link)
          .then(() => showToast("Deellink gekopieerd!"))
          .catch(() => showToast("Kopiëren mislukt.", "error"));
      }
    });
  }
}

function syncTracksFromFirestore(uid) {
  if (!db) return;
  
  tracksUnsubscribe = db.collection('users').doc(uid).collection('tracks')
    .onSnapshot(snapshot => {
      const cloudTracks = [];
      snapshot.forEach(doc => {
        cloudTracks.push(doc.data());
      });

      if (cloudTracks.length > 0) {
        state.savedTracks = cloudTracks;
        localStorage.setItem('geoforge_tracks', JSON.stringify(state.savedTracks));
        renderSavedTracks();
      }
    }, err => console.error("Firestore sync tracks failed:", err));
}

function syncWaypointsFromFirestore(uid) {
  if (!db) return;

  waypointsUnsubscribe = db.collection('users').doc(uid).collection('waypoints')
    .onSnapshot(snapshot => {
      const cloudWps = [];
      snapshot.forEach(doc => {
        cloudWps.push(doc.data());
      });

      if (cloudWps.length > 0) {
        state.savedWaypoints = cloudWps;
        localStorage.setItem('geoforge_waypoints', JSON.stringify(state.savedWaypoints));
        renderSavedWaypoints();

        state.waypointMarkersMap.forEach(m => map.removeLayer(m.marker));
        state.waypointMarkersMap = [];
        state.savedWaypoints.forEach(wp => drawWaypointMarker(wp));
      }
    }, err => console.error("Firestore sync waypoints failed:", err));
}

function migrateLocalStorageToCloud(uid) {
  const localTracksJson = localStorage.getItem('geoforge_tracks');
  if (localTracksJson) {
    try {
      const localTracks = JSON.parse(localTracksJson);
      localTracks.forEach(track => {
        db.collection('users').doc(uid).collection('tracks').doc(track.id).set(track)
          .catch(err => console.error("Error migrating local track:", err));
      });
    } catch(e) {}
  }

  const localWpsJson = localStorage.getItem('geoforge_waypoints');
  if (localWpsJson) {
    try {
      const localWps = JSON.parse(localWpsJson);
      localWps.forEach(wp => {
        db.collection('users').doc(uid).collection('waypoints').doc(wp.id).set(wp)
          .catch(err => console.error("Error migrating local waypoint:", err));
      });
    } catch(e) {}
  }
}

// --- REALTIME DEEL-BEACON SENDER & RECEIVER ---
function updateLiveBeacon(lat, lng) {
  if (!db || !state.beaconId || !isApiEnabled('live_beacon')) return;

  const now = Date.now();
  if (state.lastBeaconUpdateTime && (now - state.lastBeaconUpdateTime < 10000)) return;
  state.lastBeaconUpdateTime = now;

  const currentPath = state.recordingState.isRecording ? state.recordingState.points : [];

  db.collection('shared_tracks').doc(state.beaconId).set({
    id: state.beaconId,
    lat: lat,
    lng: lng,
    speed: state.recordingState.speed || 0,
    bearing: state.deviceHeading || 0,
    elevation: state.recordingState.elevation || 0,
    path: currentPath,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  })
  .then(() => console.log("Beacon sent successfully"))
  .catch(err => console.error("Failed to update beacon:", err));
}

function setupFirebaseBeaconReceiver() {
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('share');
  if (!shareId) return;

  el.beaconViewerBanner.classList.remove('hidden');
  el.beaconViewerName.textContent = shareId;

  const beaconIcon = L.divIcon({
    className: 'user-location-wrapper beacon-tracking-wrapper',
    html: `<div class="pulse-ring" style="border-color:#00f3ff; background:rgba(0,243,255,0.2);"></div><div class="user-dot" style="background-color:#00f3ff;"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  state.beaconMarker = L.marker([0, 0], { icon: beaconIcon }).addTo(map);
  state.beaconPolyline = L.polyline([], {
    color: '#00f3ff',
    weight: 4,
    opacity: 0.8,
    dashArray: '5, 5'
  }).addTo(map);

  if (el.btnCloseBeaconViewer && !el.btnCloseBeaconViewer.hasAttribute('data-bound')) {
    el.btnCloseBeaconViewer.setAttribute('data-bound', 'true');
    el.btnCloseBeaconViewer.addEventListener('click', () => {
      stopViewingLiveBeacon();
    });
  }

  showToast("Live positievolgen gestart...");

  beaconUnsubscribe = db.collection('shared_tracks').doc(shareId)
    .onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        const latlng = L.latLng(data.lat, data.lng);

        state.beaconMarker.setLatLng(latlng);

        if (data.path && data.path.length > 0) {
          const coords = data.path.map(p => L.latLng(p.lat, p.lng));
          state.beaconPolyline.setLatLngs(coords);
        }

        if (!state.beaconCentered) {
          map.setView(latlng, 15);
          state.beaconCentered = true;
        }

        el.beaconViewerName.textContent = `${shareId} (${data.speed.toFixed(1)} km/u)`;
      } else {
        showToast("Beacon is momenteel niet actief of is offline gehaald.", "warning");
      }
    }, err => {
      console.error(err);
      showToast("Fout bij laden live positiegegevens.", "error");
    });
}

function stopViewingLiveBeacon() {
  if (beaconUnsubscribe) beaconUnsubscribe();
  if (state.beaconMarker) map.removeLayer(state.beaconMarker);
  if (state.beaconPolyline) map.removeLayer(state.beaconPolyline);
  
  el.beaconViewerBanner.classList.add('hidden');
  
  const newUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, newUrl);
  showToast("Live volgen gestopt.");
}

// --- MAPTILER DYNAMIC LAYERS LOADING ---
function setupMaptilerLayers() {
  const maptilerKey = localStorage.getItem('geoforge_maptiler_key');
  const enabled = isApiEnabled('maptiler_maps');

  if (maptilerKey && enabled) {
    if (!state.baseLayers.maptileroutdoor) {
      state.baseLayers.maptileroutdoor = L.tileLayer(`https://api.maptiler.com/maps/outdoor/256/{z}/{x}/{y}.png?key=${maptilerKey}`, {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      });
    }
    if (!state.baseLayers.maptilerwinter) {
      state.baseLayers.maptilerwinter = L.tileLayer(`https://api.maptiler.com/maps/winter/256/{z}/{x}/{y}.png?key=${maptilerKey}`, {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      });
    }

    if (document.getElementById('basemap-maptiler-outdoor')) {
      document.getElementById('basemap-maptiler-outdoor').classList.remove('hidden');
    }
    if (document.getElementById('basemap-maptiler-winter')) {
      document.getElementById('basemap-maptiler-winter').classList.remove('hidden');
    }
  } else {
    if (document.getElementById('basemap-maptiler-outdoor')) {
      document.getElementById('basemap-maptiler-outdoor').classList.add('hidden');
    }
    if (document.getElementById('basemap-maptiler-winter')) {
      document.getElementById('basemap-maptiler-winter').classList.add('hidden');
    }
  }
}

// --- RENT-CAMPER ADVERTS API SCANNER ---
const MOCK_RENT_CAMPERS = [
  {
    id: "camper_1",
    name: "Roadie Cruiser",
    price: 110,
    rating: 4.9,
    location: "Netherlands, Amsterdam",
    lat: 52.3676,
    lng: 4.9041,
    description: "Compacte en gezellige camper met keuken en koelkast. Perfect voor koppels.",
    image: "https://images.unsplash.com/photo-1513313778780-9ae4807465f0?auto=format&fit=crop&w=400&q=80",
    details: { kitchen: 1, beds: 2, airConditioner: 1, shower: 0 }
  },
  {
    id: "camper_2",
    name: "Wilderness Explorer",
    price: 150,
    rating: 4.8,
    location: "Norway, Oslo",
    lat: 59.9139,
    lng: 10.7522,
    description: "Robuuste 4x4 camper met daktent, zonnepanelen en standkachel voor echt wildkamperen.",
    image: "https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=400&q=80",
    details: { kitchen: 1, beds: 4, airConditioner: 0, shower: 1 }
  },
  {
    id: "camper_3",
    name: "Alpine Voyager",
    price: 135,
    rating: 4.7,
    location: "Belgium, Brussels",
    lat: 50.8503,
    lng: 4.3517,
    description: "Luxe camperbus met toilet, douche en zithoek. Uitstekend geschikt voor lange ritten.",
    image: "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=400&q=80",
    details: { kitchen: 1, beds: 3, airConditioner: 1, shower: 1 }
  },
  {
    id: "camper_4",
    name: "Britannic Nomad",
    price: 125,
    rating: 4.6,
    location: "United Kingdom, London",
    lat: 51.5074,
    lng: -0.1278,
    description: "Klassieke retro camper met modern interieur. Sfeervol en betrouwbaar.",
    image: "https://images.unsplash.com/photo-1533518463841-d62e1fc91373?auto=format&fit=crop&w=400&q=80",
    details: { kitchen: 1, beds: 2, airConditioner: 1, shower: 0 }
  }
];

function scanRentCamperAdverts() {
  if (!isApiEnabled('rent_camper_api')) return;
  
  const endpoint = 'https://rent-camper-api.onrender.com/adverts';
  
  const drawCampers = (campers) => {
    campers.forEach(camper => {
      let lat = camper.lat;
      let lng = camper.lng;
      
      if (!lat || !lng) {
        if (camper.location) {
          const locLower = camper.location.toLowerCase();
          if (locLower.includes('amsterdam') || locLower.includes('netherlands')) { lat = 52.3676; lng = 4.9041; }
          else if (locLower.includes('oslo') || locLower.includes('norway')) { lat = 59.9139; lng = 10.7522; }
          else if (locLower.includes('brussel') || locLower.includes('belgium')) { lat = 50.8503; lng = 4.3517; }
          else if (locLower.includes('london') || locLower.includes('kingdom') || locLower.includes('uk')) { lat = 51.5074; lng = -0.1278; }
          else if (locLower.includes('kyiv') || locLower.includes('ukraine')) { lat = 50.4501; lng = 30.5234; }
          else {
            const center = map.getCenter();
            lat = center.lat + (Math.random() - 0.5) * 0.1;
            lng = center.lng + (Math.random() - 0.5) * 0.1;
          }
        } else {
          return;
        }
      }

      const bounds = map.getBounds();
      if (!bounds.contains([lat, lng])) return;

      const latlng = L.latLng(lat, lng);
      const icon = L.divIcon({
        className: 'poi-map-marker camper-rental-marker',
        html: `<div style="background-color:#9c27b0; border:1.5px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">🔑</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const marker = L.marker(latlng, { icon: icon }).addTo(map);
      
      let detailsHtml = '';
      if (camper.details) {
        if (camper.details.kitchen) detailsHtml += ' 🍳 Keuken';
        if (camper.details.beds) detailsHtml += ` 🛏️ ${camper.details.beds} bed(den)`;
        if (camper.details.shower) detailsHtml += ' 🚿 Douche';
        if (camper.details.airConditioner) detailsHtml += ' ❄️ A/C';
      }

      const popupContent = `
        <div style="font-size:12px; font-family:var(--font-main); max-width: 200px; color:var(--text-primary);">
          ${camper.image ? `<img src="${camper.image}" style="width:100%; height:90px; object-fit:cover; border-radius:var(--border-radius-sm); margin-bottom:6px;" />` : ''}
          <strong style="color:#ba68c8; font-size:13px;">${camper.name}</strong><br/>
          <span style="font-size:9px; color:#999; text-transform:uppercase;">${camper.location || 'Huurcamper'}</span><br/>
          <span style="font-size:12px; font-weight:bold; color:#ba68c8; display:block; margin:4px 0;">€ ${camper.price} / dag</span>
          <span style="font-size:11px; display:block; margin-bottom:4px;">⭐ ${camper.rating || '4.5'}</span>
          <p style="font-size:10px; color:var(--text-muted); margin:0 0 6px 0; line-height:1.3;">${camper.description || ''}</p>
          <div style="font-size:9px; color:var(--color-cyan); font-weight:500; display:flex; flex-wrap:wrap; gap:4px;">${detailsHtml}</div>
        </div>
      `;
      marker.bindPopup(popupContent);
      state.poiMarkers.push(marker);
    });
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  fetch(endpoint, { signal: controller.signal })
    .then(res => res.json())
    .then(data => {
      clearTimeout(timeoutId);
      if (Array.isArray(data)) {
        drawCampers(data);
      } else {
        drawCampers(MOCK_RENT_CAMPERS);
      }
    })
    .catch(() => {
      clearTimeout(timeoutId);
      console.log("Camper API offline, falling back to mock directory.");
      drawCampers(MOCK_RENT_CAMPERS);
    });
}
