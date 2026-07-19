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
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  
  // Viewport for Photo Canvas (Zoom & Pan)
  scale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  
  // Calibration
  calibrationPoints: [
    { photo: null, map: null, marker: null }, // Point 1 (Red)
    { photo: null, map: null, marker: null }  // Point 2 (Blue)
  ],
  calibrationStep: 0, // 0: inactive, 1: wait photo 1, 2: wait map 1, 3: wait photo 2, 4: wait map 2
  transform: null,    // { a, b, cx, cy } similarity transform coefficients
  isCalibrated: false,
  photoOverlay: null, // Custom Leaflet layer
  
  // Tracing & Routes
  tracingMode: 'color', // Default to automatic color recognition
  colorTolerance: 40,
  colorTarget: { r: 220, g: 38, b: 38 }, // Red default
  
  rawPoints: [],       // Array of {x, y} relative to original image size
  controlPoints: [],   // Array of L.LatLng (simplified keypoints for BRouter)
  waypointMarkers: [], // Array of draggable L.Marker on Leaflet
  
  // Leaflet Layers
  routeLine: null,     // Snapped route line (L.Polyline)
  rawLine: null,       // Unsnapped route line (L.Polyline, shown in dashboard if needed)
  
  // Routing settings
  snapToPaths: true,
  brouterProfile: 'trekking', // trekking, hiking, fastbike, mtb
  
  // Drawing on photo canvas
  isDrawing: false,
  drawPath: [] // temporary pixel path during mouse/touch drag
};

// --- Leaflet Custom Photo Overlay Layer ---
const PhotoOverlay = L.Layer.extend({
  initialize: function(imageElement, corners, options) {
    this._image = imageElement;
    this._corners = corners; // { tl, tr, bl, br } LatLngs
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
    
    // Project corners to container points
    const p_tl = this._map.latLngToContainerPoint(this._corners.tl);
    const p_tr = this._map.latLngToContainerPoint(this._corners.tr);
    const p_bl = this._map.latLngToContainerPoint(this._corners.bl);
    
    const w = this._image.naturalWidth;
    const h = this._image.naturalHeight;
    
    // Calculate affine transform coefficients from photo pixels to screen container pixels
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

// --- DOM Elements ---
const el = {
  cameraInput: document.getElementById('camera-input'),
  fileInput: document.getElementById('file-input'),
  uploadContainer: document.getElementById('upload-container'),
  photoViewer: document.getElementById('photo-viewer'),
  photoCanvas: document.getElementById('photo-canvas'),
  
  statusPhoto: document.getElementById('status-photo'),
  statusCalibration: document.getElementById('status-calibration'),
  modeIndicator: document.getElementById('photo-mode-indicator'),
  
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnPhotoReset: document.getElementById('btn-photo-reset'),
  btnTraceUndo: document.getElementById('btn-trace-undo'),
  btnTraceClear: document.getElementById('btn-trace-clear'),
  
  btnLocate: document.getElementById('btn-locate'),
  btnToggleOverlay: document.getElementById('btn-toggle-overlay'),
  
  btnCalClear: document.getElementById('btn-cal-clear'),
  opacityControl: document.getElementById('opacity-control'),
  sliderOpacity: document.getElementById('slider-opacity'),
  opacityValue: document.getElementById('opacity-value'),
  
  calCoords1: document.getElementById('cal-coords-1'),
  calCoords2: document.getElementById('cal-coords-2'),
  calRow1: document.getElementById('cal-row-1'),
  calRow2: document.getElementById('cal-row-2'),
  btnCalReset1: document.getElementById('btn-cal-reset-1'),
  btnCalReset2: document.getElementById('btn-cal-reset-2'),
  
  colorTraceOptions: document.getElementById('color-trace-options'),
  colorPreview: document.getElementById('color-preview'),
  colorRgb: document.getElementById('color-rgb'),
  sliderTolerance: document.getElementById('slider-tolerance'),
  toleranceValue: document.getElementById('tolerance-value'),
  
  chkSnapBrouter: document.getElementById('chk-snap-brouter'),
  selectProfile: document.getElementById('select-profile'),
  
  statDistance: document.getElementById('stat-distance'),
  statPoints: document.getElementById('stat-points'),
  btnExportGpx: document.getElementById('btn-export-gpx'),
  
  guideDialog: document.getElementById('guide-dialog'),
  btnGuide: document.getElementById('btn-guide'),
  btnCloseGuide: document.getElementById('btn-close-guide'),
  
  locationDialog: document.getElementById('location-dialog'),
  inputSearchLocation: document.getElementById('input-search-location'),
  btnSearchLocation: document.getElementById('btn-search-location'),
  searchResults: document.getElementById('search-results'),
  btnCloseLocationDialog: document.getElementById('btn-close-location-dialog'),
  
  toastContainer: document.getElementById('toast-container'),
  
  inputApiKey: document.getElementById('input-api-key'),
  chkSaveKey: document.getElementById('chk-save-key'),
  btnAiAnalyze: document.getElementById('btn-ai-analyze'),
  aiStatus: document.getElementById('ai-status'),
  
  tabs: document.querySelectorAll('.tab-btn'),
  panels: document.querySelectorAll('.workspace-panel')
};

// --- Offscreen Canvas for Pixel Analysis ---
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

// --- Map Initialization ---
let map;
function initMap() {
  // Utrecht is centered by default
  map = L.map('map', {
    zoomControl: true,
    tap: false // Disable Leaflet tap handler to improve mobile touch click latency
  }).setView([52.0907, 5.1214], 8);

  const openTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Kaartgegevens: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-auteurs | Stijl: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  });

  const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> auteurs'
  });

  // Default is OpenTopoMap
  openTopoMap.addTo(map);

  const baseLayers = {
    "OpenTopoMap (Topografisch)": openTopoMap,
    "OpenStreetMap (Standaard)": openStreetMap
  };

  L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
  
  // Map click listener for calibration and manual waypoint plotting
  map.on('click', onMapClick);
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupEventListeners();
  initAiAssistant();
  initColorPalette();
  
  const btnForceUpdate = document.getElementById('btn-force-update');
  if (btnForceUpdate) {
    btnForceUpdate.addEventListener('click', () => {
      if (confirm('Wil je de app updaten en alle tijdelijke bestanden leegmaken?')) {
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
  
  // Show guide on first launch
  if (!localStorage.getItem('mapsnap_guide_seen')) {
    el.guideDialog.showModal();
  }
  
  // Attempt to grab current GPS position
  triggerGeolocation(false); // quiet attempt
});

// Show Guide Button
el.btnGuide.addEventListener('click', () => el.guideDialog.showModal());
el.btnCloseGuide.addEventListener('click', () => {
  localStorage.setItem('mapsnap_guide_seen', 'true');
  el.guideDialog.close();
});

// Toast notification system
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  
  // Automatically remove after animation
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// --- Geolocation ---
function triggerGeolocation(showError = true) {
  if (!navigator.geolocation) {
    if (showError) showToast('Geolocatie wordt niet ondersteund door je browser.', 'error');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      map.setView([lat, lng], 14);
      showToast('Kaart gecentreerd op je huidige locatie.');
    },
    (error) => {
      console.warn('GPS Fout:', error);
      if (showError) {
        showToast('Kan GPS locatie niet ophalen. Gebruik de zoekbalk.', 'error');
        el.locationDialog.showModal();
      }
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
}

el.btnLocate.addEventListener('click', () => triggerGeolocation(true));

// --- Location Search (Nominatim Geocoding) ---
el.btnSearchLocation.addEventListener('click', () => {
  const query = el.inputSearchLocation.value.trim();
  if (!query) return;
  
  el.searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-muted);">Zoeken...</div>';
  
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=3`)
    .then(res => res.json())
    .then(data => {
      el.searchResults.innerHTML = '';
      if (data.length === 0) {
        el.searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--color-danger);">Geen locaties gevonden.</div>';
        return;
      }
      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = item.display_name;
        div.addEventListener('click', () => {
          map.setView([parseFloat(item.lat), parseFloat(item.lon)], 13);
          el.locationDialog.close();
          showToast(`Gecentreerd op: ${item.display_name.split(',')[0]}`);
        });
        el.searchResults.appendChild(div);
      });
    })
    .catch(err => {
      console.error(err);
      el.searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--color-danger);">Fout bij zoeken. Probeer opnieuw.</div>';
    });
});

el.btnCloseLocationDialog.addEventListener('click', () => el.locationDialog.close());

// --- Tab Navigation (Mobile) ---
el.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    el.tabs.forEach(t => t.classList.remove('active'));
    el.panels.forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    const targetPanel = document.getElementById(tab.getAttribute('data-tab'));
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
    
    // Invalidate size on Leaflet map if map section becomes active
    if (tab.getAttribute('data-tab') === 'map-section') {
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }
  });
});

// --- Image Upload Handling ---
el.cameraInput.addEventListener('change', handleImageUpload);
el.fileInput.addEventListener('change', handleImageUpload);

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // Save original dimensions
      state.image = img;
      state.imageWidth = img.naturalWidth;
      state.imageHeight = img.naturalHeight;
      
      // Setup offscreen canvas for pixel inspection
      offscreenCanvas.width = state.imageWidth;
      offscreenCanvas.height = state.imageHeight;
      offscreenCtx.drawImage(img, 0, 0);
      
      // Update UI Status
      el.uploadContainer.classList.add('hidden');
      el.photoViewer.classList.remove('hidden');
      el.statusPhoto.textContent = 'Foto geladen';
      el.statusPhoto.className = 'badge badge-success';
      
      // Reset view variables
      state.scale = Math.min(el.photoViewer.clientWidth / state.imageWidth, el.photoViewer.clientHeight / state.imageHeight) * 0.95;
      state.panX = (el.photoViewer.clientWidth - state.imageWidth * state.scale) / 2;
      state.panY = (el.photoViewer.clientHeight - state.imageHeight * state.scale) / 2;
      
      // Clear previous calibrations
      clearCalibration();
      
      // Set to Calibration Step 1
      setCalibrationStep(1);
      
      drawPhotoCanvas();
      updateAiButtonState();
      detectRoutes();
      showToast('Routekaart geladen! Klik nu op Referentiepunt 1 op de foto.');
      
      // Switch to Photo Tab on mobile
      const photoTab = document.querySelector('[data-tab="photo-section"]');
      if (photoTab) photoTab.click();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// --- Canvas Drawing (Photo) ---
function drawPhotoCanvas() {
  if (!state.image) return;
  
  const canvas = el.photoCanvas;
  const ctx = canvas.getContext('2d');
  
  // Size canvas to viewport size
  canvas.width = el.photoViewer.clientWidth;
  canvas.height = el.photoViewer.clientHeight;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  // Apply Zoom and Pan
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.scale, state.scale);
  
  // Draw Image
  ctx.drawImage(state.image, 0, 0);
  
  // Draw temporary drawing path (if drawing)
  if (state.drawPath.length > 1) {
    ctx.beginPath();
    ctx.moveTo(state.drawPath[0].x, state.drawPath[0].y);
    for (let i = 1; i < state.drawPath.length; i++) {
      ctx.lineTo(state.drawPath[i].x, state.drawPath[i].y);
    }
    ctx.strokeStyle = state.tracingMode === 'color' ? '#f97316' : '#10b981';
    ctx.lineWidth = 6 / state.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  
  // Draw raw routes plotted on photo
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
    
    // Draw dots at raw points
    state.rawPoints.forEach((pt, index) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6 / state.scale, 0, 2 * Math.PI);
      ctx.fillStyle = '#059669';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / state.scale;
      ctx.stroke();
    });
  }
  
  // Draw Calibration Points
  state.calibrationPoints.forEach((cp, index) => {
    if (cp.photo) {
      ctx.beginPath();
      ctx.arc(cp.photo.x, cp.photo.y, 10 / state.scale, 0, 2 * Math.PI);
      ctx.fillStyle = index === 0 ? '#ef4444' : '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3 / state.scale;
      ctx.stroke();
      
      // Label "1" or "2"
      ctx.fillStyle = 'white';
      ctx.font = `bold ${11 / state.scale}px var(--font-main)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(index + 1, cp.photo.x, cp.photo.y);
    }
  });
  
  ctx.restore();
}

// Window resizing
window.addEventListener('resize', () => {
  if (state.image) {
    drawPhotoCanvas();
  }
});

// --- Photo Zoom & Pan Listeners ---
el.btnZoomIn.addEventListener('click', () => zoomPhoto(1.3));
el.btnZoomOut.addEventListener('click', () => zoomPhoto(1 / 1.3));
el.btnPhotoReset.addEventListener('click', () => {
  if (!state.image) return;
  state.scale = Math.min(el.photoViewer.clientWidth / state.imageWidth, el.photoViewer.clientHeight / state.imageHeight) * 0.95;
  state.panX = (el.photoViewer.clientWidth - state.imageWidth * state.scale) / 2;
  state.panY = (el.photoViewer.clientHeight - state.imageHeight * state.scale) / 2;
  drawPhotoCanvas();
});

function zoomPhoto(factor) {
  const centerViewport = { x: el.photoViewer.clientWidth / 2, y: el.photoViewer.clientHeight / 2 };
  
  // Calculate center relative to image coordinates before zoom
  const imgCenter = {
    x: (centerViewport.x - state.panX) / state.scale,
    y: (centerViewport.y - state.panY) / state.scale
  };
  
  state.scale *= factor;
  
  // Limit zoom extremes
  state.scale = Math.max(0.05, Math.min(state.scale, 20));
  
  // Re-adjust pan to keep the image centered on viewport center
  state.panX = centerViewport.x - imgCenter.x * state.scale;
  state.panY = centerViewport.y - imgCenter.y * state.scale;
  
  drawPhotoCanvas();
}

// Mouse & Touch events for Zooming & Dragging Photo
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
    // Pinch to zoom initialization
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

let clickStartX = 0;
let clickStartY = 0;

function startPanOrAction(e) {
  if (!state.image) return;
  
  const rect = el.photoCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  clickStartX = mouseX;
  clickStartY = mouseY;
  
  // Calculate image coordinates of clicked pixel
  const imgX = (mouseX - state.panX) / state.scale;
  const imgY = (mouseY - state.panY) / state.scale;
  
  // If Calibration is ongoing or Tracing manual (by simple taps)
  if (state.calibrationStep > 0 || (state.tracingMode === 'manual' && state.isCalibrated)) {
    // We treat this as a potential click, but we only commit it on mouseup/touchend 
    // if the user did not drag.
    state.isDragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
  } else if (state.tracingMode === 'color' && state.isCalibrated) {
    // Color tracing triggers on tap, we check on mouseup/touchend.
    state.isDragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
  } else {
    // Normal drag/pan
    state.isDragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
    el.photoCanvas.style.cursor = 'grabbing';
  }
  
  // Handle drawing path on photo
  if (state.isCalibrated && state.calibrationStep === 0 && state.tracingMode === 'manual') {
    state.isDrawing = true;
    state.drawPath = [{ x: imgX, y: imgY }];
  }
}

function dragOrDraw(e) {
  if (!state.isDragging && !state.isDrawing) return;
  
  const rect = el.photoCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const imgX = (mouseX - state.panX) / state.scale;
  const imgY = (mouseY - state.panY) / state.scale;
  
  const dx = e.clientX - state.dragStart.x;
  const dy = e.clientY - state.dragStart.y;
  
  // If we have moved more than 6 pixels, treat it as a drag/pan, not a click
  const dist = Math.hypot(dx, dy);
  
  if (dist > 6) {
    if (state.isDrawing) {
      // We are drawing a path on the photo
      state.drawPath.push({ x: imgX, y: imgY });
      drawPhotoCanvas();
    } else {
      // Normal pan
      state.panX += dx;
      state.panY += dy;
      state.dragStart = { x: e.clientX, y: e.clientY };
      drawPhotoCanvas();
    }
  }
}

function endPanOrAction(e) {
  el.photoCanvas.style.cursor = 'crosshair';
  
  const rect = el.photoCanvas.getBoundingClientRect();
  
  // Use last touch end coordinates if touch event
  let clientX = e.clientX;
  let clientY = e.clientY;
  
  if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  }
  
  if (clientX === undefined) {
    // Normal fallback
    state.isDragging = false;
    state.isDrawing = false;
    return;
  }
  
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;
  
  const dx = mouseX - clickStartX;
  const dy = mouseY - clickStartY;
  const dragDistance = Math.hypot(dx, dy);
  
  // If the drag distance is small, it's a click!
  if (dragDistance <= 6) {
    const imgX = (mouseX - state.panX) / state.scale;
    const imgY = (mouseY - state.panY) / state.scale;
    
    // Check boundaries
    if (imgX >= 0 && imgX <= state.imageWidth && imgY >= 0 && imgY <= state.imageHeight) {
      handlePhotoClick(imgX, imgY);
    }
  } else if (state.isDrawing && state.drawPath.length > 2) {
    // End of manual drawing path, process the trace!
    processDrawingPath(state.drawPath);
  }
  
  state.isDragging = false;
  state.isDrawing = false;
  state.drawPath = [];
  drawPhotoCanvas();
}

// --- Handle Click/Tap on Photo ---
function handlePhotoClick(x, y) {
  // Calibration steps
  if (state.calibrationStep === 1) { // Waiting for Photo Point 1
    state.calibrationPoints[0].photo = { x, y };
    drawPhotoCanvas();
    setCalibrationStep(2);
    showToast('Punt 1 op foto gezet! Klik nu op dezelfde locatie op de KAART.');
    
    // Auto switch to Map Tab on mobile to guide user
    const mapTab = document.querySelector('[data-tab="map-section"]');
    if (mapTab) {
      setTimeout(() => mapTab.click(), 500);
    }
  } else if (state.calibrationStep === 3) { // Waiting for Photo Point 2
    state.calibrationPoints[1].photo = { x, y };
    drawPhotoCanvas();
    setCalibrationStep(4);
    showToast('Punt 2 op foto gezet! Klik nu op dezelfde locatie op de KAART.');
    
    const mapTab = document.querySelector('[data-tab="map-section"]');
    if (mapTab) {
      setTimeout(() => mapTab.click(), 500);
    }
  } 
  // Color tracing trigger
  else if (state.tracingMode === 'color' && state.isCalibrated && state.calibrationStep === 0) {
    const pixel = offscreenCtx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    state.colorTarget = { r: pixel[0], g: pixel[1], b: pixel[2] };
    
    // Update preview color swatch
    el.colorPreview.style.backgroundColor = `rgb(${state.colorTarget.r}, ${state.colorTarget.g}, ${state.colorTarget.b})`;
    el.colorRgb.textContent = `RGB(${state.colorTarget.r}, ${state.colorTarget.g}, ${state.colorTarget.b})`;
    
    showToast('Kleur geselecteerd. Route wordt getraceerd...');
    
    // Run color tracing algorithm
    setTimeout(() => {
      const tracePoints = traceColorRoute(x, y, state.colorTarget.r, state.colorTarget.g, state.colorTarget.b);
      if (tracePoints.length > 2) {
        processDrawingPath(tracePoints);
        showToast(`Route getraceerd met ${tracePoints.length} punten!`);
      } else {
        showToast('Traceren mislukt. Verhoog de tolerantie of kies een ander startpunt.', 'error');
      }
    }, 50);
  }
}

// --- Process Raw Plotted Path from Photo ---
function processDrawingPath(pixelPath) {
  // 1. Simplify the pixel path to keep it manageable and clean (Douglas-Peucker)
  const tolerance = 15; // pixels
  const simplifiedPixels = simplifyDouglasPeucker(pixelPath, tolerance);
  
  // 2. Map to LatLng using calibration
  const newLatLngs = simplifiedPixels.map(pt => photoToLatLng(pt.x, pt.y));
  
  // 3. Append to control points
  state.controlPoints = state.controlPoints.concat(newLatLngs);
  
  // Save raw points for canvas display
  state.rawPoints = state.rawPoints.concat(simplifiedPixels);
  
  // 4. Update the route snapping
  updateRoute();
  
  // Enable undo
  el.btnTraceUndo.removeAttribute('disabled');
}

// --- Map Click Handler ---
function onMapClick(e) {
  // Calibration steps on map
  if (state.calibrationStep === 2) { // Waiting for Map Point 1
    state.calibrationPoints[0].map = e.latlng;
    
    // Add map marker
    addCalMapMarker(0, e.latlng);
    
    // Advance step
    setCalibrationStep(3);
    showToast('Punt 1 gekoppeld! Klik nu op Referentiepunt 2 op de FOTO.');
    
    // Switch to Photo Tab on mobile
    const photoTab = document.querySelector('[data-tab="photo-section"]');
    if (photoTab) {
      setTimeout(() => photoTab.click(), 500);
    }
  } else if (state.calibrationStep === 4) { // Waiting for Map Point 2
    state.calibrationPoints[1].map = e.latlng;
    
    // Add map marker
    addCalMapMarker(1, e.latlng);
    
    // Calibration ready! Calculate transformation
    calculateCalibrationMatrix();
  }
}

// --- Set Calibration Steps & Update UI ---
function setCalibrationStep(step) {
  state.calibrationStep = step;
  
  // Update status sidebar rows highlights
  el.calRow1.classList.remove('active');
  el.calRow2.classList.remove('active');
  
  if (step === 1) {
    el.modeIndicator.textContent = "Kalibratie: Tik op Referentiepunt 1 op de foto";
    el.calRow1.classList.add('active');
    el.calCoords1.textContent = "Wachten op foto klik...";
  } else if (step === 2) {
    el.modeIndicator.textContent = "Kalibratie: Klik op Referentiepunt 1 op de kaart";
    el.calCoords1.textContent = "Kies punt op kaart";
  } else if (step === 3) {
    el.modeIndicator.textContent = "Kalibratie: Tik op Referentiepunt 2 op de foto";
    el.calRow2.classList.add('active');
    el.calCoords2.textContent = "Wachten op foto klik...";
  } else if (step === 4) {
    el.modeIndicator.textContent = "Kalibratie: Klik op Referentiepunt 2 op de kaart";
    el.calCoords2.textContent = "Kies punt op kaart";
  } else {
    // Calibrated or tracing
    if (state.isCalibrated) {
      el.modeIndicator.textContent = state.tracingMode === 'manual' 
        ? "Tekenmodus: Sleep je vinger/muis over de route op de foto"
        : "Kleur-volger: Tik op de routelijn in de foto";
    } else {
      el.modeIndicator.textContent = "Foto geladen. Start kalibratie.";
    }
  }
}

function addCalMapMarker(idx, latlng) {
  if (state.calibrationPoints[idx].marker) {
    map.removeLayer(state.calibrationPoints[idx].marker);
  }
  
  const iconHtml = `<div class="map-marker-pin ${idx === 0 ? 'marker-color-1' : 'marker-color-2'}"><span>${idx + 1}</span></div>`;
  const customIcon = L.divIcon({
    html: iconHtml,
    className: 'custom-div-icon',
    iconSize: [24, 40],
    iconAnchor: [12, 40]
  });
  
  state.calibrationPoints[idx].marker = L.marker(latlng, { icon: customIcon, draggable: false }).addTo(map);
  
  // Update control panel coords text
  const coordStr = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  if (idx === 0) {
    el.calCoords1.textContent = coordStr;
    el.btnCalReset1.style.display = 'block';
  } else {
    el.calCoords2.textContent = coordStr;
    el.btnCalReset2.style.display = 'block';
  }
}

// Reset calibration points individually
el.btnCalReset1.addEventListener('click', (e) => {
  e.stopPropagation();
  resetCalibrationPoint(0);
});
el.btnCalReset2.addEventListener('click', (e) => {
  e.stopPropagation();
  resetCalibrationPoint(1);
});

function resetCalibrationPoint(idx) {
  if (state.calibrationPoints[idx].marker) {
    map.removeLayer(state.calibrationPoints[idx].marker);
    state.calibrationPoints[idx].marker = null;
  }
  state.calibrationPoints[idx].photo = null;
  state.calibrationPoints[idx].map = null;
  
  state.isCalibrated = false;
  removePhotoOverlay();
  
  if (idx === 0) {
    el.calCoords1.textContent = "Niet gekoppeld";
    el.btnCalReset1.style.display = 'none';
    setCalibrationStep(1);
  } else {
    el.calCoords2.textContent = "Niet gekoppeld";
    el.btnCalReset2.style.display = 'none';
    setCalibrationStep(3);
  }
  
  el.statusCalibration.textContent = 'Niet gekalibreerd';
  el.statusCalibration.className = 'badge badge-error';
  el.btnCalClear.classList.add('hidden');
  el.opacityControl.classList.add('hidden');
  el.btnToggleOverlay.classList.add('hidden');
  
  drawPhotoCanvas();
}

function clearCalibration() {
  resetCalibrationPoint(0);
  resetCalibrationPoint(1);
  state.transform = null;
  setCalibrationStep(0);
}

el.btnCalClear.addEventListener('click', () => {
  clearCalibration();
  setCalibrationStep(1);
  showToast('Kalibratie gewist. Begin opnieuw.');
  
  const photoTab = document.querySelector('[data-tab="photo-section"]');
  if (photoTab) photoTab.click();
});

// --- Compute Georeferencing Transformation ---
function calculateCalibrationMatrix() {
  const p1 = state.calibrationPoints[0].photo;
  const p2 = state.calibrationPoints[1].photo;
  const latlng1 = state.calibrationPoints[0].map;
  const latlng2 = state.calibrationPoints[1].map;
  
  if (!p1 || !p2 || !latlng1 || !latlng2) return;
  
  // Project Map LatLng coordinates to flat pixel coordinates at zoom level 18
  const zoom = 18;
  const m1 = map.project(latlng1, zoom);
  const m2 = map.project(latlng2, zoom);
  
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dX = m2.x - m1.x;
  const dY = m2.y - m1.y;
  
  const denom = dx * dx + dy * dy;
  if (denom === 0) {
    showToast('Kalibratiepunten liggen te dicht bij elkaar!', 'error');
    clearCalibration();
    setCalibrationStep(1);
    return;
  }
  
  // Similarity transform coefficients
  const a = (dX * dx + dY * dy) / denom;
  const b = (dY * dx - dX * dy) / denom;
  
  const cx = m1.x - a * p1.x + b * p1.y;
  const cy = m1.y - b * p1.x - a * p1.y;
  
  state.transform = { a, b, cx, cy, zoom };
  state.isCalibrated = true;
  
  // Update status labels
  el.statusCalibration.textContent = 'Gekalibreerd';
  el.statusCalibration.className = 'badge badge-success';
  el.btnCalClear.classList.remove('hidden');
  el.opacityControl.classList.remove('hidden');
  el.btnToggleOverlay.classList.remove('hidden');
  
  // Add photo overlay layer to Leaflet map
  addPhotoOverlay();
  
  setCalibrationStep(0); // Normal tracing ready
  showToast('Kalibratie compleet! Teken nu de route op de foto.');
  
  // Center map on the georeferenced overlay area
  const overlayCenter = photoToLatLng(state.imageWidth / 2, state.imageHeight / 2);
  map.setView(overlayCenter, 15);
}

// Bidirectional Georeferencing math
function photoToLatLng(x, y) {
  if (!state.transform) return null;
  const { zoom } = state.transform;
  if (state.transform.type === 'affine') {
    const { c1, c2, c3, c4, c5, c6 } = state.transform;
    const X = c1 * x + c2 * y + c3;
    const Y = c4 * x + c5 * y + c6;
    return map.unproject(L.point(X, Y), zoom);
  } else {
    // similarity fallback
    const { a, b, cx, cy } = state.transform;
    const X = a * x - b * y + cx;
    const Y = b * x + a * y + cy;
    return map.unproject(L.point(X, Y), zoom);
  }
}

function latLngToPhoto(latlng) {
  if (!state.transform) return null;
  const { zoom } = state.transform;
  const m = map.project(latlng, zoom);
  
  if (state.transform.type === 'affine') {
    const { c1, c2, c3, c4, c5, c6 } = state.transform;
    const det = c1 * c5 - c2 * c4;
    if (Math.abs(det) < 0.00001) return null;
    const dX = m.x - c3;
    const dY = m.y - c6;
    const x = (c5 * dX - c2 * dY) / det;
    const y = (-c4 * dX + c1 * dY) / det;
    return { x, y };
  } else {
    // similarity fallback
    const { a, b, cx, cy } = state.transform;
    const dX = m.x - cx;
    const dY = m.y - cy;
    const det = a * a + b * b;
    if (det === 0) return null;
    const x = (a * dX + b * dY) / det;
    const y = (-b * dX + a * dY) / det;
    return { x, y };
  }
}

// --- Leaflet Canvas Photo Overlay ---
function addPhotoOverlay() {
  if (!state.image || !state.isCalibrated) return;
  
  // Project 4 corners of photo
  const corners = {
    tl: photoToLatLng(0, 0),
    tr: photoToLatLng(state.imageWidth, 0),
    br: photoToLatLng(state.imageWidth, state.imageHeight),
    bl: photoToLatLng(0, state.imageHeight)
  };
  
  if (state.photoOverlay) {
    map.removeLayer(state.photoOverlay);
  }
  
  const opacity = parseFloat(el.sliderOpacity.value) / 100;
  state.photoOverlay = L.photoOverlay(state.image, corners, { opacity: opacity }).addTo(map);
  
  // Show/hide button setup
  el.btnToggleOverlay.classList.remove('hidden');
}

function removePhotoOverlay() {
  if (state.photoOverlay) {
    map.removeLayer(state.photoOverlay);
    state.photoOverlay = null;
  }
}

// Toggle Overlay Visibility button on map
el.btnToggleOverlay.addEventListener('click', () => {
  if (!state.photoOverlay) return;
  
  if (map.hasLayer(state.photoOverlay)) {
    map.removeLayer(state.photoOverlay);
    el.btnToggleOverlay.style.opacity = '0.5';
    showToast('Foto overlay verborgen.');
  } else {
    state.photoOverlay.addTo(map);
    el.btnToggleOverlay.style.opacity = '1.0';
    showToast('Foto overlay weergegeven.');
  }
});

// Opacity Slider
el.sliderOpacity.addEventListener('input', (e) => {
  const val = e.target.value;
  el.opacityValue.textContent = `${val}%`;
  if (state.photoOverlay) {
    state.photoOverlay.setOpacity(parseFloat(val) / 100);
  }
});

// --- Route Snapping (BRouter API) & Leaflet Drawing ---
function updateRoute() {
  if (state.controlPoints.length === 0) {
    clearMapLayers();
    updateStats(0, 0);
    return;
  }
  
  // Draw raw straight lines on map anyway as a base/comparison
  drawRawUnsnappedLine();
  
  // Render waypoints (draggable markers) on map
  renderWaypointMarkers();
  
  // Snapping logic
  if (state.snapToPaths && state.brouterProfile !== 'straight') {
    fetchBRouterSnappedRoute();
  } else {
    // Draw straight line route
    drawStraightRoute();
  }
}

function drawRawUnsnappedLine() {
  if (state.rawLine) {
    map.removeLayer(state.rawLine);
  }
  // Draw very thin dashed line representing raw control points connection
  state.rawLine = L.polyline(state.controlPoints, {
    color: '#9ca3af',
    weight: 2,
    dashArray: '5, 8',
    opacity: 0.8
  }).addTo(map);
}

function drawStraightRoute() {
  if (state.routeLine) {
    map.removeLayer(state.routeLine);
  }
  
  state.routeLine = L.polyline(state.controlPoints, {
    color: '#10b981',
    weight: 5,
    opacity: 0.9
  }).addTo(map);
  
  // Calculate simple geodesic distance
  let distance = 0;
  for (let i = 0; i < state.controlPoints.length - 1; i++) {
    distance += state.controlPoints[i].distanceTo(state.controlPoints[i+1]);
  }
  
  updateStats(distance / 1000, state.controlPoints.length);
}

// BRouter Snapping Call
function fetchBRouterSnappedRoute() {
  const profile = state.brouterProfile;
  
  // If only 1 point, can't snap route
  if (state.controlPoints.length === 1) {
    drawStraightRoute();
    return;
  }
  
  // Build API URL coordinate string
  const lonlats = state.controlPoints.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|');
  const url = `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=${profile}&alternativeidx=0&format=geojson`;
  
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('BRouter routing fout');
      return res.json();
    })
    .then(geojson => {
      if (!geojson.features || geojson.features.length === 0) {
        throw new Error('Geen route gevonden');
      }
      
      const feature = geojson.features[0];
      const coords = feature.geometry.coordinates; // array of [lon, lat, ele]
      const latlngs = coords.map(c => L.latLng(c[1], c[0]));
      
      if (state.routeLine) {
        map.removeLayer(state.routeLine);
      }
      
      // Draw BRouter Snapped route in Orange
      state.routeLine = L.polyline(latlngs, {
        color: '#f97316',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      
      // Store elevations on coords for GPX
      state.snappedCoordinates = coords; // [lon, lat, ele]
      
      // Extract distance from properties (meters to km)
      const distance = parseFloat(feature.properties['track-length']) / 1000;
      updateStats(distance, state.controlPoints.length);
      
      // Bind click event to insert waypoints along the route polyline
      state.routeLine.on('click', (e) => {
        insertWaypointAt(e.latlng);
      });
    })
    .catch(err => {
      console.warn('BRouter Snapping mislukt, valt terug op rechte lijn:', err);
      // Fallback to straight lines
      drawStraightRoute();
      showToast('Snapping mislukt voor deze punten. Rechte lijn getekend.', 'warning');
    });
}

function clearMapLayers() {
  if (state.routeLine) map.removeLayer(state.routeLine);
  if (state.rawLine) map.removeLayer(state.rawLine);
  state.routeLine = null;
  state.rawLine = null;
  
  state.waypointMarkers.forEach(m => map.removeLayer(m));
  state.waypointMarkers = [];
}

// Render draggable markers for each key control point on Leaflet
function renderWaypointMarkers() {
  // Clear old markers
  state.waypointMarkers.forEach(m => map.removeLayer(m));
  state.waypointMarkers = [];
  
  state.controlPoints.forEach((latlng, idx) => {
    // Determine marker color. Start is green, End is red, middle is blue
    let markerColor = '#3b82f6'; // Blue default
    let isDrag = true;
    
    if (idx === 0) markerColor = '#10b981'; // Green for Start
    if (idx === state.controlPoints.length - 1 && idx > 0) markerColor = '#ef4444'; // Red for End
    
    const iconHtml = `<div style="background-color:${markerColor}; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.5);"></div>`;
    const dotIcon = L.divIcon({
      html: iconHtml,
      className: 'custom-div-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    
    const marker = L.marker(latlng, {
      icon: dotIcon,
      draggable: isDrag
    }).addTo(map);
    
    // Drag events to adjust route
    marker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      
      // Update coordinates
      state.controlPoints[idx] = newPos;
      
      // Also update matching photo pixel coordinates if calibrated
      if (state.isCalibrated) {
        const photoCoord = latLngToPhoto(newPos);
        if (photoCoord && photoCoord.x >= 0 && photoCoord.x <= state.imageWidth && photoCoord.y >= 0 && photoCoord.y <= state.imageHeight) {
          state.rawPoints[idx] = photoCoord;
          drawPhotoCanvas();
        }
      }
      
      updateRoute();
    });
    
    // Double click or right click to delete waypoint
    marker.on('dblclick', () => {
      deleteWaypoint(idx);
    });
    
    marker.on('contextmenu', () => {
      deleteWaypoint(idx);
    });
    
    state.waypointMarkers.push(marker);
  });
}

// Delete waypoint
function deleteWaypoint(idx) {
  state.controlPoints.splice(idx, 1);
  if (state.rawPoints.length > idx) {
    state.rawPoints.splice(idx, 1);
  }
  
  updateRoute();
  drawPhotoCanvas();
  showToast('Routepunt verwijderd.');
}

// Insert a new waypoint at clicked location on the route polyline
function insertWaypointAt(latlng) {
  // Find which segment of the controlPoints polyline is closest to the click
  let minDistance = Infinity;
  let insertIdx = state.controlPoints.length;
  
  for (let i = 0; i < state.controlPoints.length - 1; i++) {
    const p1 = state.controlPoints[i];
    const p2 = state.controlPoints[i+1];
    
    // Compute distance from point to segment
    const dist = L.LineUtil.pointToSegmentDistance(
      map.latLngToLayerPoint(latlng),
      map.latLngToLayerPoint(p1),
      map.latLngToLayerPoint(p2)
    );
    
    if (dist < minDistance) {
      minDistance = dist;
      insertIdx = i + 1;
    }
  }
  
  // Insert waypoint
  state.controlPoints.splice(insertIdx, 0, latlng);
  
  // Also calculate and insert corresponding photo coordinate if calibrated
  if (state.isCalibrated) {
    const ptPhoto = latLngToPhoto(latlng);
    state.rawPoints.splice(insertIdx, 0, ptPhoto || { x: -1, y: -1 });
    drawPhotoCanvas();
  }
  
  updateRoute();
  showToast('Routepunt tussengevoegd.');
}

// Update stats dashboard
function updateStats(distance, pointsCount) {
  el.statDistance.textContent = `${distance.toFixed(1)} km`;
  el.statPoints.textContent = pointsCount;
  
  if (pointsCount > 0) {
    el.btnExportGpx.removeAttribute('disabled');
  } else {
    el.btnExportGpx.setAttribute('disabled', 'true');
  }
}

// --- Undo and Clear Operations ---
el.btnTraceUndo.addEventListener('click', () => {
  if (state.controlPoints.length === 0) return;
  
  state.controlPoints.pop();
  state.rawPoints.pop();
  
  updateRoute();
  drawPhotoCanvas();
  showToast('Laatste stap ongedaan gemaakt.');
  
  if (state.controlPoints.length === 0) {
    el.btnTraceUndo.setAttribute('disabled', 'true');
  }
});

el.btnTraceClear.addEventListener('click', () => {
  state.controlPoints = [];
  state.rawPoints = [];
  state.snappedCoordinates = null;
  
  updateRoute();
  drawPhotoCanvas();
  el.btnTraceUndo.setAttribute('disabled', 'true');
  showToast('Hele route gewist.');
});

// --- Routing Preferences Panel Listeners ---
el.chkSnapBrouter.addEventListener('change', (e) => {
  state.snapToPaths = e.target.checked;
  updateRoute();
});

el.selectProfile.addEventListener('change', (e) => {
  state.brouterProfile = e.target.value;
  updateRoute();
});

// Tracing Mode switches
document.querySelectorAll('input[name="tracing-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    state.tracingMode = e.target.value;
    
    if (state.tracingMode === 'color') {
      el.colorTraceOptions.classList.remove('hidden');
    } else {
      el.colorTraceOptions.classList.add('hidden');
    }
    
    setCalibrationStep(0); // refresh instructions
  });
});

el.sliderTolerance.addEventListener('input', (e) => {
  el.toleranceValue.textContent = e.target.value;
});

// --- GPX Generator & Download ---
el.btnExportGpx.addEventListener('click', () => {
  if (state.controlPoints.length === 0) return;
  
  const gpx = generateGPXString();
  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `mapsnap_route_${new Date().toISOString().slice(0, 10)}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('GPX gedownload!');
});

function generateGPXString() {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MapSnap GPX" 
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Kaartfoto Gevolgde Route</name>
    <desc>Geëxporteerde route vanaf een routekaart foto via MapSnap GPX.</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>MapSnap Route</name>
    <trkseg>
`;

  // If we have snapped coordinate data with elevation
  if (state.snappedCoordinates && state.snappedCoordinates.length > 0 && state.snapToPaths && state.brouterProfile !== 'straight') {
    state.snappedCoordinates.forEach(c => {
      const lon = c[0].toFixed(6);
      const lat = c[1].toFixed(6);
      const ele = c[2] !== undefined ? `<ele>${c[2].toFixed(1)}</ele>` : '';
      gpx += `      <trkpt lat="${lat}" lon="${lon}">${ele}</trkpt>\n`;
    });
  } else {
    // Fallback to straight control points
    state.controlPoints.forEach(p => {
      gpx += `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"></trkpt>\n`;
    });
  }

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

// --- Wiskunde: Douglas-Peucker Lijnvereenvoudiging ---
function getSqSegDist(p, p1, p2) {
  let x = p1.x, y = p1.y,
      dx = p2.x - x, dy = p2.y - y;
  if (dx !== 0 || dy !== 0) {
    let t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x; y = p2.y;
    } else if (t > 0) {
      x += dx * t; y += dy * t;
    }
  }
  dx = p.x - x; dy = p.y - y;
  return dx * dx + dy * dy;
}

function simplifyDPStep(points, first, last, sqTolerance, simplified) {
  let maxSqDist = sqTolerance, index;
  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }
  if (maxSqDist > sqTolerance) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

function simplifyDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

// --- Wiskunde: Kleur Route Tracing Probe Algoritme ---
function traceColorRoute(startX, startY, targetR, targetG, targetB) {
  const w = state.imageWidth;
  const h = state.imageHeight;
  const imgData = offscreenCtx.getImageData(0, 0, w, h);
  const data = imgData.data;
  
  const visited = new Uint8Array(w * h);
  
  function getPixelColor(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    const idx = (y * w + x) * 4;
    return { r: data[idx], g: data[idx+1], b: data[idx+2] };
  }
  
  function colorDistance(c1, c2) {
    // L2 Color distance
    return Math.sqrt((c1.r - c2.r)**2 + (c1.g - c2.g)**2 + (c1.b - c2.b)**2);
  }
  
  function markVisited(cx, cy, radius) {
    const r2 = radius * radius;
    for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
        if ((x - cx)**2 + (y - cy)**2 <= r2) {
          visited[y * w + x] = 1;
        }
      }
    }
  }
  
  function isVisited(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return true;
    return visited[y * w + x] === 1;
  }
  
  const stepDist = 12; // Probe search radius step
  const tolerance = parseInt(el.sliderTolerance.value);
  
  // Direction 1: scan 360 degrees to find the best match to seed
  let points1 = [{ x: startX, y: startY }];
  markVisited(startX, startY, stepDist);
  
  let bestAngle1 = null;
  let minDistance1 = Infinity;
  
  for (let angle = 0; angle < 360; angle += 15) {
    const rad = angle * Math.PI / 180;
    const px = startX + stepDist * Math.cos(rad);
    const py = startY + stepDist * Math.sin(rad);
    const c = getPixelColor(px, py);
    if (c) {
      const dist = colorDistance(c, { r: targetR, g: targetG, b: targetB });
      if (dist < tolerance && dist < minDistance1) {
        minDistance1 = dist;
        bestAngle1 = rad;
      }
    }
  }
  
  // Direction 2: the opposite angle (roughly 180 degrees away)
  let bestAngle2 = null;
  if (bestAngle1 !== null) {
    bestAngle2 = bestAngle1 + Math.PI;
  }
  
  // Trace direction 1 (Forward)
  let curX = startX;
  let curY = startY;
  let curAngle = bestAngle1;
  
  if (curAngle !== null) {
    let iterations = 0;
    while (iterations < 300) { // Limit route path length to prevent memory issues
      iterations++;
      let foundNext = false;
      let nextX, nextY, nextAngle;
      let bestDist = Infinity;
      
      // Probe-range: look 60 degrees left/right from heading
      for (let da = -60; da <= 60; da += 10) {
        const angle = curAngle + da * Math.PI / 180;
        const px = curX + stepDist * Math.cos(angle);
        const py = curY + stepDist * Math.sin(angle);
        
        if (isVisited(px, py)) continue;
        
        const c = getPixelColor(px, py);
        if (c) {
          const dist = colorDistance(c, { r: targetR, g: targetG, b: targetB });
          if (dist < tolerance && dist < bestDist) {
            bestDist = dist;
            nextX = px;
            nextY = py;
            nextAngle = angle;
            foundNext = true;
          }
        }
      }
      
      if (foundNext) {
        points1.push({ x: nextX, y: nextY });
        markVisited(nextX, nextY, stepDist);
        curX = nextX;
        curY = nextY;
        curAngle = nextAngle;
      } else {
        break; // Dead-end or route finished
      }
    }
  }
  
  // Trace direction 2 (Backward)
  let points2 = [];
  curX = startX;
  curY = startY;
  curAngle = bestAngle2;
  
  if (curAngle !== null) {
    let iterations = 0;
    while (iterations < 300) {
      iterations++;
      let foundNext = false;
      let nextX, nextY, nextAngle;
      let bestDist = Infinity;
      
      for (let da = -60; da <= 60; da += 10) {
        const angle = curAngle + da * Math.PI / 180;
        const px = curX + stepDist * Math.cos(angle);
        const py = curY + stepDist * Math.sin(angle);
        
        if (isVisited(px, py)) continue;
        
        const c = getPixelColor(px, py);
        if (c) {
          const dist = colorDistance(c, { r: targetR, g: targetG, b: targetB });
          if (dist < tolerance && dist < bestDist) {
            bestDist = dist;
            nextX = px;
            nextY = py;
            nextAngle = angle;
            foundNext = true;
          }
        }
      }
      
      if (foundNext) {
        points2.push({ x: nextX, y: nextY });
        markVisited(nextX, nextY, stepDist);
        curX = nextX;
        curY = nextY;
        curAngle = nextAngle;
      } else {
        break;
      }
    }
  }
  
  // Combine both paths
  points2.reverse();
  return points2.concat(points1);
}

// Helper: Setup non-canvas event listeners
function setupEventListeners() {
  // Empty, listeners are bound directly where they are declared above.
}

// --- AI Location Assistant ---
function initAiAssistant() {
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
}

function updateAiButtonState() {
  const key = el.inputApiKey.value.trim();
  const hasImage = !!state.image;
  if (key && hasImage) {
    el.btnAiAnalyze.removeAttribute('disabled');
  } else {
    el.btnAiAnalyze.setAttribute('disabled', 'true');
  }
  
  if (el.chkSaveKey.checked) {
    localStorage.setItem('mapsnap_gemini_key', key);
  }
}

function runAiGeoreference() {
  const apiKey = el.inputApiKey.value.trim();
  if (!apiKey || !state.image) return;
  
  el.btnAiAnalyze.setAttribute('disabled', 'true');
  el.aiStatus.style.display = 'block';
  el.aiStatus.textContent = 'Kaart analyseren met AI...';
  
  // Resize image to maximum 1024px width/height on a temporary canvas
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
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: "Analyseer deze wandel- of fietsroutekaart foto. Identificeer 3 prominente, unieke herkenningspunten (zoals kruisingen van wegen, specifieke gebouwen, parkeerplaatsen of torens) die op zowel deze kaart als een standaard wegenkaart (OpenStreetMap) te vinden zijn. Geef antwoord in een strikt JSON-formaat met de volgende structuur:\n" +
                  "{\n" +
                  "  \"locationName\": \"naam van het wandelgebied of de plaats\",\n" +
                  "  \"landmarks\": [\n" +
                  "    {\n" +
                  "      \"name\": \"beschrijvende naam van het punt (bijv. Kruising Bosweg en Duinweg, Schoorl)\",\n" +
                  "      \"x\": 0.45,  // relatieve x-positie op de afbeelding als float tussen 0.0 (links) en 1.0 (rechts)\n" +
                  "      \"y\": 0.62,  // relatieve y-positie op de afbeelding als float tussen 0.0 (boven) en 1.0 (onder)\n" +
                  "      \"query\": \"zoekterm voor Nominatim geocoding (bijv. Kruising Duinweg Schoorlse Zeeweg, Schoorl)\"\n" +
                  "    }\n" +
                  "  ]\n" +
                  "}\n" +
                  "Geef GEEN markdown omhulsel (geen ```json), alleen de pure JSON string."
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };
  
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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
    
    // Geocode landmarks in parallel
    const geocodePromises = result.landmarks.map((lm, idx) => {
      // Wait 300ms between calls to avoid Nominatim rate limits
      return new Promise(resolve => setTimeout(resolve, idx * 300))
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
      
      // Clear previous calibrations
      clearCalibration();
      
      const zoom = 18;
      
      if (validPoints.length >= 3) {
        // Do 3-point Affine Transform!
        const p1 = validPoints[0].photo;
        const p2 = validPoints[1].photo;
        const p3 = validPoints[2].photo;
        
        const m1 = map.project(validPoints[0].map, zoom);
        const m2 = map.project(validPoints[1].map, zoom);
        const m3 = map.project(validPoints[2].map, zoom);
        
        const D = p1.x * (p2.y - p3.y) - p1.y * (p2.x - p3.x) + (p2.x * p3.y - p3.x * p2.y);
        
        if (Math.abs(D) < 0.0001) {
          // Fallback to 2-point similarity
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
        
        // Show markers for landmarks in app
        validPoints.forEach((vp, index) => {
          state.calibrationPoints[index] = { photo: vp.photo, map: vp.map, marker: null };
          addCalMapMarker(index, vp.map);
        });
        
        showToast('Magische 3-punts kalibratie voltooid!');
      } else {
        // Fallback to 2-point Similarity Transform
        calculateSimilarityFallback(validPoints[0], validPoints[1]);
      }
      
      // Update UI
      el.statusCalibration.textContent = 'Gekalibreerd (AI)';
      el.statusCalibration.className = 'badge badge-success';
      el.btnCalClear.classList.remove('hidden');
      el.opacityControl.classList.remove('hidden');
      el.btnToggleOverlay.classList.remove('hidden');
      
      addPhotoOverlay();
      
      // Center map
      const centerLatLng = photoToLatLng(state.imageWidth / 2, state.imageHeight / 2);
      map.setView(centerLatLng, 15);
      
      setCalibrationStep(0);
      drawPhotoCanvas();
    });
  })
  .catch(err => {
    console.error(err);
    showToast(`AI Uitlijning Fout: ${err.message}`, 'error');
  })
  .finally(() => {
    el.aiStatus.style.display = 'none';
    updateAiButtonState();
  });
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
  
  // Show markers
  state.calibrationPoints[0] = { photo: p1, map: vp1.map, marker: null };
  addCalMapMarker(0, vp1.map);
  state.calibrationPoints[1] = { photo: p2, map: vp2.map, marker: null };
  addCalMapMarker(1, vp2.map);
  
  showToast('AI kalibratie voltooid (2-punts fall-back)!');
}

// --- Color Palette Presets & Auto-Tracing ---
function initColorPalette() {
  const presetBtns = document.querySelectorAll('.color-preset-btn');
  const colorPicker = document.getElementById('input-color-picker');
  
  function selectHexColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    state.colorTarget = { r, g, b };
    
    if (el.colorPreview) el.colorPreview.style.backgroundColor = hex;
    if (el.colorRgb) el.colorRgb.textContent = `RGB(${r}, ${g}, ${b})`;
    if (colorPicker) colorPicker.value = hex;
    
    if (state.isCalibrated && state.image) {
      autoTraceColorPreset(r, g, b);
    }
  }
  
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const hex = btn.getAttribute('data-color');
      selectHexColor(hex);
    });
  });
  
  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      presetBtns.forEach(b => b.classList.remove('active'));
      selectHexColor(e.target.value);
    });
  }
}

function autoTraceColorPreset(targetR, targetG, targetB) {
  if (!state.image || !offscreenCtx) return;
  
  const w = state.imageWidth;
  const h = state.imageHeight;
  const data = offscreenCtx.getImageData(0, 0, w, h).data;
  const tolerance = parseInt(el.sliderTolerance.value);
  
  let bestX = -1, bestY = -1;
  let maxMatchCount = 0;
  
  const stepX = Math.max(1, Math.floor(w / 35));
  const stepY = Math.max(1, Math.floor(h / 35));
  
  for (let y = stepY; y < h; y += stepY) {
    for (let x = stepX; x < w; x += stepX) {
      const idx = (y * w + x) * 4;
      const dist = Math.sqrt((data[idx] - targetR)**2 + (data[idx+1] - targetG)**2 + (data[idx+2] - targetB)**2);
      if (dist < tolerance) {
        let localCount = 0;
        for (let dy = -6; dy <= 6; dy += 3) {
          for (let dx = -6; dx <= 6; dx += 3) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nIdx = (ny * w + nx) * 4;
              const d = Math.sqrt((data[nIdx] - targetR)**2 + (data[nIdx+1] - targetG)**2 + (data[nIdx+2] - targetB)**2);
              if (d < tolerance) localCount++;
            }
          }
        }
        if (localCount > maxMatchCount) {
          maxMatchCount = localCount;
          bestX = x;
          bestY = y;
        }
      }
    }
  }
  
  if (bestX >= 0 && bestY >= 0) {
    showToast('Kleur geselecteerd. Route wordt automatisch getraceerd...');
    const tracePoints = traceColorRoute(bestX, bestY, targetR, targetG, targetB);
    if (tracePoints.length > 2) {
      processDrawingPath(tracePoints);
      showToast(`Route getraceerd met ${tracePoints.length} punten!`);
    } else {
      showToast('Tik op de routelijn in de foto voor een nauwkeurig startpunt.');
    }
  } else {
    showToast('Tik op de routelijn op de foto om de kleur te bepalen.');
  }
}

// --- RGB to HSL and Multi-Route Color Detection ---
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function detectRoutes() {
  if (!state.image || !offscreenCtx) return;
  
  const w = state.imageWidth;
  const h = state.imageHeight;
  const data = offscreenCtx.getImageData(0, 0, w, h).data;
  
  const bins = {
    red: { count: 0, sumR: 0, sumG: 0, sumB: 0, color: '#dc2626', name: 'Rode Route', emoji: '🔴' },
    orange: { count: 0, sumR: 0, sumG: 0, sumB: 0, color: '#ea580c', name: 'Oranje Route', emoji: '🟠' },
    yellow: { count: 0, sumR: 0, sumG: 0, sumB: 0, color: '#eab308', name: 'Gele Route', emoji: '🟡' },
    green: { count: 0, sumR: 0, sumG: 0, sumB: 0, color: '#16a34a', name: 'Groene Route', emoji: '🟢' },
    blue: { count: 0, sumR: 0, sumG: 0, sumB: 0, color: '#2563eb', name: 'Blauwe Route', emoji: '🔵' },
    purple: { count: 0, sumR: 0, sumG: 0, sumB: 0, color: '#9333ea', name: 'Paarse Route', emoji: '🟣' }
  };
  
  const step = 8;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];
      
      const hsl = rgbToHsl(r, g, b);
      
      if (hsl.s > 45 && hsl.l > 20 && hsl.l < 80) {
        let binKey = null;
        const hue = hsl.h;
        
        if (hue >= 340 || hue < 15) binKey = 'red';
        else if (hue >= 15 && hue < 45) binKey = 'orange';
        else if (hue >= 45 && hue < 70) binKey = 'yellow';
        else if (hue >= 70 && hue < 155) binKey = 'green';
        else if (hue >= 155 && hue < 255) binKey = 'blue';
        else if (hue >= 255 && hue < 320) binKey = 'purple';
        
        if (binKey) {
          bins[binKey].count++;
          bins[binKey].sumR += r;
          bins[binKey].sumG += g;
          bins[binKey].sumB += b;
        }
      }
    }
  }
  
  const container = document.getElementById('ai-detected-routes-container');
  const listEl = document.getElementById('ai-detected-routes');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  let detectedCount = 0;
  const totalScanned = (w / step) * (h / step);
  const threshold = totalScanned * 0.005; // 0.5%
  
  Object.keys(bins).forEach(key => {
    const bin = bins[key];
    if (bin.count > threshold) {
      detectedCount++;
      const avgR = Math.round(bin.sumR / bin.count);
      const avgG = Math.round(bin.sumG / bin.count);
      const avgB = Math.round(bin.sumB / bin.count);
      
      const btn = document.createElement('button');
      btn.className = 'color-preset-btn';
      btn.style.backgroundColor = `rgb(${avgR}, ${avgG}, ${avgB})`;
      btn.title = `Extracteer ${bin.name}`;
      btn.innerHTML = `<span style="font-size:0.65rem; pointer-events:none;">${bin.emoji}</span>`;
      
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        state.colorTarget = { r: avgR, g: avgG, b: avgB };
        if (el.colorPreview) el.colorPreview.style.backgroundColor = `rgb(${avgR}, ${avgG}, ${avgB})`;
        if (el.colorRgb) el.colorRgb.textContent = `RGB(${avgR}, ${avgG}, ${avgB})`;
        
        if (state.isCalibrated) {
          autoTraceColorPreset(avgR, avgG, avgB);
        }
      });
      listEl.appendChild(btn);
    }
  });
  
  if (detectedCount > 0 && container) {
    container.classList.remove('hidden');
    showToast(`AI: ${detectedCount} routekleuren gedetecteerd op de kaart!`);
  } else if (container) {
    container.classList.add('hidden');
  }
}
