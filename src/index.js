import FileSaver from 'file-saver';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
const piexif = require('piexifjs');

const inputElement = document.getElementById('input');
const infoPanel = document.getElementById('info-panel');
const imageDiv = document.getElementById('image');
const textInfo = document.getElementById('textInfo');
const orientationElement = document.getElementById('orientation');
const controlPanel = document.querySelector('.control-panel');
const panelToggle = document.getElementById('panel-toggle');
const imageToggle = document.getElementById('image-toggle');

inputElement.addEventListener('change', uploadImage, false);
document.getElementById('select').addEventListener('click', selectImage);
orientationElement.addEventListener('change', handleOrientationChange);

panelToggle.addEventListener('click', () => {
  controlPanel.classList.toggle('collapsed');
});

imageToggle.addEventListener('click', () => {
  infoPanel.classList.toggle('image-collapsed');
});

window.addEventListener('DOMContentLoaded', () => {
  showIntroDialog();
});

function resetSaveButton() {
  const saveButton = document.getElementById('save');
  saveButton.onclick = null;
  saveButton.style.display = 'none';
}

function selectImage() {
  document.getElementById('input').click();
}

var flyToZoom;
var currentMarkers = [];
let heading = 180;
let isRotating = false;
let exif = null;
let image = null;
let file = null;
let helpPopup = null;
let rotationOffset = 0;
let orientationEnabled = false;
let originalHasDirection = false;
let originalDirection = null;
let originalDirectionRef = null;
let originalFileType = null;
let originalLat = null;
let originalLon = null;
let originalHeading = null;
let introDialogShown = false;
let positionHelpShown = false;
let orientationHelpShown = false;

// analyzes the image for available EXIF (location and direction information)
function analyzeExif(image) {
  let exifData = null;
  let hasExif = true;
  let hasLocation = false;
  let hasDirection = false;

  try {
    exifData = piexif.load(image);

    hasLocation =
      exifData?.GPS?.[piexif.GPSIFD.GPSLatitude] !== undefined &&
      exifData?.GPS?.[piexif.GPSIFD.GPSLongitude] !== undefined;

    hasDirection =
      exifData?.GPS?.[piexif.GPSIFD.GPSImgDirection] !== undefined;
  } catch (err) {
    hasExif = false;
  }

  if (!exifData) {
    exifData = {
      '0th': {},
      'Exif': {},
      'GPS': {},
      '1st': {},
      'thumbnail': null
    };
  }

  return {
    exif: exifData,
    hasExif,
    hasLocation,
    hasDirection
  };
}

// shows a general introduction dialog once per page session
function showIntroDialog() {
  if (introDialogShown) {
    return Promise.resolve();
  }

  introDialogShown = true;

  return openExifDialog({
    title: 'Fotostandort <span class="dialog-title-sub">by Kreis Viersen</span>',
    message: `
    <p>
      Mit dieser Anwendung können Sie die <strong>Aufnahmeposition</strong> und die 
      <strong>Orientierung</strong> eines Bildes anzeigen, verändern oder neu setzen.
    </p>

    <p>
      Sobald Sie ein Bild ausgewählt haben, erscheint unten links eine 
      <strong>Bildvorschau mit Informationsfeld</strong>. Dort werden die 
      <strong>ursprünglichen</strong> und die <strong>neu gesetzten Werte</strong> 
      gegenübergestellt. Sind im ausgewählten Bild keine entsprechenden Informationen 
      vorhanden, werden die ursprünglichen Werte mit „—“ dargestellt.
    </p>

    <div class="dialog-hint">
      Bilder, die nicht im <strong>JPEG-Format</strong> 
      vorliegen, werden beim Laden automatisch in dieses Format konvertiert. 
      Auch diese Änderung wird im Informationsfeld angezeigt.
    </div>
  `,
    buttons: [
      { value: 'ok', label: 'Verstanden', primary: true }
    ]
  }).then(() => undefined);
}

// opens the general information dialog
function openExifDialog({ title, message, buttons }) {
  const dialog = document.getElementById('exif-dialog');
  const titleElement = document.getElementById('exif-dialog-title');
  const messageElement = document.getElementById('exif-dialog-message');
  const buttonContainer = document.getElementById('exif-dialog-buttons');

  titleElement.innerHTML = title;
  messageElement.innerHTML = message;
  buttonContainer.replaceChildren();

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      dialog.removeEventListener('cancel', handleCancel);
      dialog.close();
      resolve(value);
    };

    const handleCancel = (event) => {
      event.preventDefault();
      finish('cancel');
    };

    dialog.addEventListener('cancel', handleCancel);

    buttons.forEach((buttonConfig) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dialog-btn';
      button.textContent = buttonConfig.label;

      if (buttonConfig.primary) {
        button.classList.add('dialog-btn-primary');
      }

      button.addEventListener('click', () => finish(buttonConfig.value));
      buttonContainer.appendChild(button);
    });

    dialog.showModal();
  });
}

// returns a short display name for the file type
function getFileType(file) {
  if (file?.type) {
    const subtype = file.type.split('/')[1];

    if (subtype) {
      return subtype.toUpperCase().replace('JPEG', 'JPG');
    }
  }

  const extension = file?.name?.split('.').pop();
  return extension ? extension.toUpperCase() : 'Unbekannt';
}

// converts an image to JPEG format if it is not already in that format
function convertToJpeg(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas-Kontext konnte nicht erstellt werden.'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };

    img.onerror = reject;
    img.src = dataUrl;
  });
}

// converts a data URL to a Blob object
function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

// clears the current image and map state
function resetImageState() {
  resetSaveButton();
  infoPanel.style.display = 'none';
  orientationElement.checked = false;
  orientationElement.disabled = true;
  orientationEnabled = false;

  originalFileType = null;
  originalLat = null;
  originalLon = null;
  originalHeading = null;

  controlPanel.classList.remove('collapsed');

  currentMarkers.forEach(marker => marker.remove());
  currentMarkers = [];

  closeHelpPopup();
  hideDirectionCone();
}

// handles the image upload, analyzes EXIF data, and updates the map and UI accordingly
function uploadImage(e) {
  resetImageState();

  const selectedFile = e.target.files?.[0];

  if (!selectedFile) {
    return;
  }

  file = selectedFile;
  originalFileType = getFileType(selectedFile);

  const reader = new FileReader();

  reader.onload = async (event) => {
    const originalImage = event.target.result;

    // Analyze the original image before a possible format conversion.
    const status = analyzeExif(originalImage);
    exif = status.exif;

    image = originalImage;

    // Convert to JPEG if the uploaded file is not already in JPEG format.
    if (file.type !== 'image/jpeg') {
      image = await convertToJpeg(image);
      file = new File(
        [dataURLtoBlob(image)],
        file.name.replace(/\.[^/.]+$/, '.jpg'),
        { type: 'image/jpeg' }
      );
    }

    imageDiv.innerHTML =
      '<img src="' + image + '" alt="Bildvorschau">' +
      '<p>' + file.name + '</p>';

    infoPanel.style.display = 'flex';

    if (window.matchMedia('(max-width: 600px)').matches) {
      controlPanel.classList.add('collapsed');
    }

    if (!exif.GPS) {
      exif.GPS = {};
    }

    originalHasDirection = status.hasDirection;
    originalDirection = status.hasDirection
      ? cloneExifValue(exif.GPS[piexif.GPSIFD.GPSImgDirection])
      : null;
    originalDirectionRef = status.hasDirection
      ? exif.GPS[piexif.GPSIFD.GPSImgDirectionRef]
      : null;

    const latitude = exif.GPS[piexif.GPSIFD.GPSLatitude];
    const latitudeRef = exif.GPS[piexif.GPSIFD.GPSLatitudeRef];
    const longitude = exif.GPS[piexif.GPSIFD.GPSLongitude];
    const longitudeRef = exif.GPS[piexif.GPSIFD.GPSLongitudeRef];
    const direction = exif.GPS[piexif.GPSIFD.GPSImgDirection];

    let lat;
    let lon;

    if (status.hasLocation) {
      const latitudeMultiplier =
        latitudeRef.toString().substring(0, 1) === 'N' ? 1 : -1;

      lat =
        latitudeMultiplier *
        piexif.GPSHelper.dmsRationalToDeg(latitude);

      const longitudeMultiplier =
        longitudeRef.toString().substring(0, 1) === 'E' ? 1 : -1;

      lon =
        longitudeMultiplier *
        piexif.GPSHelper.dmsRationalToDeg(longitude);

      originalLat = lat;
      originalLon = lon;
      flyToZoom = 18;
    } else {
      originalLat = null;
      originalLon = null;

      // Kreishaus
      lat = 51.258812;
      lon = 6.391263;
      flyToZoom = 13;
    }

    if (
      status.hasDirection &&
      direction &&
      direction.length === 2 &&
      direction[1] !== 0
    ) {
      heading = direction[0] / direction[1];
      originalHeading = heading;
    } else {
      heading = 180;
      originalHeading = null;
    }

    // Existing orientation is shown by default. If none exists, users can
    // enable it explicitly via the checkbox.
    orientationEnabled = status.hasDirection;
    orientationElement.disabled = false;
    orientationElement.checked = orientationEnabled;

    updateTextInfo({ lng: lon, lat }, heading);

    const marker = new maplibregl.Marker({
      draggable: true,
      color: 'red'
    })
      .setLngLat([lon, lat])
      .addTo(map);

    currentMarkers.push(marker);

    if (orientationEnabled) {
      showDirectionCone(marker.getLngLat());

      if (!positionHelpShown || !orientationHelpShown) {
        showMarkerHelp(marker, 'full');
        positionHelpShown = true;
        orientationHelpShown = true;
      }

    } else {
      if (!positionHelpShown) {
        showMarkerHelp(marker, 'position');
        positionHelpShown = true;
      }
    }

    updateExifAndImage(
      exif,
      image,
      file,
      marker.getLngLat(),
      heading
    );

    marker.on('drag', () => {
      const lngLat = marker.getLngLat();

      updateTextInfo(lngLat, heading);
      updateDirectionCone(lngLat);

      if (helpPopup) {
        helpPopup.setLngLat(lngLat);
      }
    });

    marker.on('dragend', () => {
      updateExifAndImage(
        exif,
        image,
        file,
        marker.getLngLat(),
        heading
      );
    });

    map.flyTo({
      center: [lon, lat],
      zoom: flyToZoom,
      maxDuration: 1000,
      essential: true
    });
  };

  reader.readAsDataURL(file);
}

// helper function to clone EXIF values, especially for arrays
function cloneExifValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => Array.isArray(item) ? [...item] : item);
  }
  return value;
}

// handles the change in orientation checkbox state and updates the map and EXIF data accordingly
function handleOrientationChange() {
  if (!currentMarkers[0]) {
    return;
  }

  orientationEnabled = orientationElement.checked;

  const marker = currentMarkers[0];
  const pos = marker.getLngLat();

  if (orientationEnabled) {
    showDirectionCone(pos);

    // Orientierung nur einmal erklären
    if (!orientationHelpShown) {
      showMarkerHelp(marker, 'orientation');
      orientationHelpShown = true;
    }

  } else {
    hideDirectionCone();
  }

  updateTextInfo(pos, heading);
  updateExifAndImage(exif, image, file, pos, heading);
}

// displays a direction cone on the map based on the given position and heading
function showDirectionCone(pos) {
  const cone = createDirectionCone(pos.lng, pos.lat, heading);

  if (!map.getSource('directionCone')) {
    map.addSource('directionCone', {
      type: 'geojson',
      data: cone
    });
  } else {
    map.getSource('directionCone').setData(cone);
  }

  if (!map.getLayer('directionConeLayer')) {
    map.addLayer({
      id: 'directionConeLayer',
      type: 'fill',
      source: 'directionCone',
      paint: {
        'fill-color': '#146adb',
        'fill-opacity': 0.3
      }
    });
  }
}

// removes the direction cone from the map and resets rotation state
function hideDirectionCone() {
  if (isRotating) {
    isRotating = false;
    map.dragPan.enable();
    map.getCanvas().style.cursor = '';
  }

  if (map.getLayer('directionConeLayer')) {
    map.removeLayer('directionConeLayer');
  }

  if (map.getSource('directionCone')) {
    map.removeSource('directionCone');
  }
}

function updateDirectionCone(pos) {
  if (!orientationEnabled) {
    return;
  }

  const source = map.getSource('directionCone');
  if (source) {
    source.setData(createDirectionCone(pos.lng, pos.lat, heading));
  }
}

// displays a help popup for the marker, providing instructions on how to adjust position and orientation
function showMarkerHelp(marker, mode) {
  closeHelpPopup();

  const popupContent = document.createElement('div');
  popupContent.className = 'marker-help';
  renderMarkerHelp(popupContent, mode);

  helpPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: 35,
    maxWidth: '330px',
    className: 'marker-help-popup'
  })
    .setDOMContent(popupContent)
    .setLngLat(marker.getLngLat())
    .addTo(map);

  helpPopup.on('close', () => {
    helpPopup = null;
  });
}

// renders the content of the help popup based on the specified mode (position, orientation, or full)
function renderMarkerHelp(container, mode) {
  if (!container) return;

  const positionSection = `
    <div class="marker-help-section">
      <span class="marker-help-icon">↕</span>
      <span>
        Bewegen Sie den roten Marker per Drag-and-Drop an die
        tatsächliche Aufnahmeposition.
      </span>
    </div>
  `;

  const orientationSection = `
    <div class="marker-help-section">
      <span class="marker-help-icon">↻</span>
      <span>
        Drehen Sie den blauen Sichtkegel um den Marker, um die
        Orientierung anzupassen.
      </span>
    </div>
  `;

  let title = '';
  let sections = '';
  let note = '';

  if (mode === 'orientation') {
    title = 'Orientierung anpassen';
    sections = orientationSection;
  } else if (mode === 'full') {
    title = 'Position und Orientierung anpassen';
    sections = positionSection + orientationSection;
    note = `
      <div class="marker-help-note">
        Wenn Sie nur die Position aktualisieren möchten, können Sie das
        Setzen der Orientierung im Panel links oben deaktivieren.
      </div>
    `;
  } else {
    title = 'Position anpassen';
    sections = positionSection;
    note = `
      <div class="marker-help-note">
        Sie können zusätzlich eine Orientierung hinzufügen,
        indem Sie das Setzen der Orientierung im Panel links oben aktivieren.
      </div>
    `;
  }

  container.innerHTML = `
    <div class="marker-help-title">${title}</div>
    ${sections}
    ${note}
    <button type="button" class="marker-help-close">Verstanden</button>
  `;

  container
    .querySelector('.marker-help-close')
    .addEventListener('click', () => closeHelpPopup());
}

function closeHelpPopup() {
  if (helpPopup) {
    const popup = helpPopup;
    helpPopup = null;
    popup.remove();
  }
}

// function creates a cone-shaped polygon on a map that represents field of view
// output: GeoJSON polygon
function createDirectionCone(lon, lat, heading, pixelLength = null, angle = 25, steps = 50) {

  // determine pixel length (size of cone) based on screen size if not provided
  if (pixelLength === null) {

    // same rule as in css
    pixelLength = window.matchMedia('(max-width: 600px), (max-height: 750px)').matches
      ? 0.18
      : 0.3;

  }

  const zoom = map.getZoom();
  const metersPerPixel = getScaledConeLength(lat, zoom);
  const lengthInMeters = pixelLength * metersPerPixel;

  const earthRadius = 6378137;
  const length = lengthInMeters / earthRadius * (180 / Math.PI);
  const coords = [];
  const cosLat = Math.cos(lat * Math.PI / 180);

  coords.push([lon, lat]);

  for (let i = 0; i <= steps; i++) {
    const a = (heading - angle + (i / steps) * (2 * angle)) * Math.PI / 180;

    coords.push([
      lon + (length * Math.sin(a)) / cosLat,
      lat + length * Math.cos(a)
    ]);
  }

  coords.push([lon, lat]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };
}

// set up map
var map = new maplibregl.Map({
  container: 'map',
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  },
  bounds: [[5.8, 50.3], [9.5, 52.5]]
});

const attributionControl = new maplibregl.AttributionControl({
  compact: true
});

map.addControl(attributionControl, 'bottom-right');

map.once('load', () => {
  const attribution = document.querySelector('.maplibregl-ctrl-attrib');

  if (attribution) {
    attribution.classList.remove('maplibregl-compact-show');
    attribution.removeAttribute('open');
  }
});

map.dragRotate.disable();
map.touchZoomRotate.disableRotation();

map.on('load', function () {
  map.addSource('dop', {
    type: 'raster',
    tiles: [
      'https://www.wms.nrw.de/geobasis/wms_nw_dop?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&LAYERS=nw_dop_rgb&STYLES=&FORMAT=image/png&TRANSPARENT=true'
    ],
    tileSize: 256
  });

  map.addLayer({
    id: 'dop',
    type: 'raster',
    source: 'dop',
    layout: { visibility: 'none' }
  });

  map.addSource('vdop', {
    type: 'raster',
    tiles: [
      'https://www.wms.nrw.de/geobasis/wms_nw_vdop?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&LAYERS=nw_vdop_rgb&STYLES=&FORMAT=image/png&TRANSPARENT=true'
    ],
    tileSize: 256
  });

  map.addLayer({
    id: 'vdop',
    type: 'raster',
    source: 'vdop',
    layout: { visibility: 'none' }
  });

  document.getElementById('osm').addEventListener('click', function () {
    map.setLayoutProperty('osm', 'visibility', 'visible');
    map.setLayoutProperty('dop', 'visibility', 'none');
    map.setLayoutProperty('vdop', 'visibility', 'none');
    document.getElementById('dop').classList.remove('active');
    this.classList.add('active');
  });

  document.getElementById('dop').addEventListener('click', function () {
    map.setLayoutProperty('osm', 'visibility', 'none');
    map.setLayoutProperty('dop', 'visibility', 'visible');
    map.setLayoutProperty('vdop', 'visibility', 'visible');
    document.getElementById('osm').classList.remove('active');
    this.classList.add('active');
  });
});

map.on('zoom', () => {
  const marker = currentMarkers[0];
  if (!marker || !orientationEnabled) return;

  updateDirectionCone(marker.getLngLat());
});

// start rotation of the direction cone when the user clicks and drags outside the marker
function startConeRotation(lngLat, clientX, clientY) {
  if (!orientationEnabled) return;

  const marker = currentMarkers[0];
  if (!marker) return;

  const markerRect = marker.getElement().getBoundingClientRect();

  const insideMarker =
    clientX >= markerRect.left &&
    clientX <= markerRect.right &&
    clientY >= markerRect.top &&
    clientY <= markerRect.bottom;

  if (insideMarker) {
    return;
  }

  const pos = marker.getLngLat();
  const dx = lngLat.lng - pos.lng;
  const dy = lngLat.lat - pos.lat;

  let cursorAngle = Math.atan2(dx, dy) * 180 / Math.PI;

  if (cursorAngle < 0) {
    cursorAngle += 360;
  }

  rotationOffset = heading - cursorAngle;
  isRotating = true;

  map.dragPan.disable();
  map.touchZoomRotate.disable();
  map.getCanvas().style.cursor = 'grabbing';
}

// updates the heading of the direction cone based on the current mouse position
function rotateCone(lngLat) {
  if (!isRotating || !orientationEnabled) return;

  const marker = currentMarkers[0];
  if (!marker) return;

  const pos = marker.getLngLat();

  const dx = lngLat.lng - pos.lng;
  const dy = lngLat.lat - pos.lat;

  let cursorAngle = Math.atan2(dx, dy) * 180 / Math.PI;

  if (cursorAngle < 0) {
    cursorAngle += 360;
  }

  heading = cursorAngle + rotationOffset;
  heading = ((heading % 360) + 360) % 360;

  updateDirectionCone(pos);
  updateTextInfo(pos, heading);
}

// stops the rotation of the direction cone and updates the EXIF data accordingly
function stopRotation() {
  if (!isRotating) {
    return;
  }

  isRotating = false;

  map.dragPan.enable();
  map.touchZoomRotate.enable();
  map.touchZoomRotate.disableRotation();

  map.getCanvas().style.cursor = '';

  const marker = currentMarkers[0];
  if (!marker) return;

  updateExifAndImage(
    exif,
    image,
    file,
    marker.getLngLat(),
    heading
  );
}

// event listeners for MOUSE interactions to handle rotation of the direction cone
map.on('mousedown', 'directionConeLayer', (e) => {
  const event = e.originalEvent;

  startConeRotation(
    e.lngLat,
    event.clientX,
    event.clientY
  );

  if (isRotating) {
    e.preventDefault();
  }
});

map.on('mousemove', (e) => {
  rotateCone(e.lngLat);
});

map.on('mouseup', stopRotation);
window.addEventListener('mouseup', stopRotation);

// event listeners for TOUCH interactions on mobile devices to handle rotation of the direction cone
map.on('touchstart', 'directionConeLayer', (e) => {
  if (!e.points?.length || !e.lngLats?.length) {
    return;
  }

  const point = e.points[0];
  const lngLat = e.lngLats[0];

  const rect = map.getCanvas().getBoundingClientRect();

  startConeRotation(
    lngLat,
    rect.left + point.x,
    rect.top + point.y
  );

  if (isRotating) {
    e.preventDefault();
  }
});

map.on('touchmove', (e) => {
  if (!isRotating || !e.lngLats?.length) {
    return;
  }

  rotateCone(e.lngLats[0]);
  e.preventDefault();
});

map.on('touchend', stopRotation);

// updates the comparison of original and new image values
function updateTextInfo(pos, heading) {
  const originalLongitude =
    originalLon !== null ? originalLon.toFixed(6) : '—';
  const originalLatitude =
    originalLat !== null ? originalLat.toFixed(6) : '—';
  const originalOrientation =
    originalHeading !== null ? `${Math.round(originalHeading)}°` : '—';

  const newOrientation = orientationEnabled
    ? `${Math.round(heading)}°`
    : originalHeading !== null
      ? `${Math.round(originalHeading)}°`
      : '—';

  const newFileType = getFileType(file);

  textInfo.innerHTML = `
    <table class="comparison-table">
      <thead>
        <tr>
          <th></th>
          <th>Ursprünglich</th>
          <th>Neu</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Länge:</td>
          <td>${originalLongitude}</td>
          <td>${pos.lng.toFixed(6)}</td>
        </tr>
        <tr>
          <td>Breite:</td>
          <td>${originalLatitude}</td>
          <td>${pos.lat.toFixed(6)}</td>
        </tr>
        <tr>
          <td>Orientierung:</td>
          <td>${originalOrientation}</td>
          <td>${newOrientation}</td>
        </tr>
        <tr>
          <td>Format:</td>
          <td>${originalFileType ?? '—'}</td>
          <td>${newFileType}</td>
        </tr>
      </tbody>
    </table>
  `;
}

// function that updates EXIF data (lat, lon and optionally heading)
function updateExifAndImage(exif, image, file, lngLat, heading) {
  if (!exif || !image || !file) {
    return;
  }

  exif.GPS[piexif.GPSIFD.GPSLatitude] =
    piexif.GPSHelper.degToDmsRational(Math.abs(lngLat.lat));

  exif.GPS[piexif.GPSIFD.GPSLongitude] =
    piexif.GPSHelper.degToDmsRational(Math.abs(lngLat.lng));

  exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = lngLat.lat >= 0 ? 'N' : 'S';
  exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = lngLat.lng >= 0 ? 'E' : 'W';

  if (orientationEnabled) {
    exif.GPS[piexif.GPSIFD.GPSImgDirection] = [
      Math.round(heading * 100),
      100
    ];
    exif.GPS[piexif.GPSIFD.GPSImgDirectionRef] = 'T';
  } else if (originalHasDirection) {
    exif.GPS[piexif.GPSIFD.GPSImgDirection] = cloneExifValue(originalDirection);

    if (originalDirectionRef !== undefined && originalDirectionRef !== null) {
      exif.GPS[piexif.GPSIFD.GPSImgDirectionRef] = originalDirectionRef;
    } else {
      delete exif.GPS[piexif.GPSIFD.GPSImgDirectionRef];
    }
  } else {
    delete exif.GPS[piexif.GPSIFD.GPSImgDirection];
    delete exif.GPS[piexif.GPSIFD.GPSImgDirectionRef];
  }

  const newExifBinary = piexif.dump(exif);
  const newPhoto = piexif.insert(newExifBinary, image);

  resetSaveButton();

  const saveButton = document.getElementById('save');
  saveButton.onclick = () => {
    FileSaver.saveAs(newPhoto, file.name);
  };

  saveButton.style.display = 'block';
}

// helper function: gets meters per pixel in a scaled manner
function getScaledConeLength(lat, zoom) {
  return (156543.03392 * Math.cos(lat * Math.PI / 180)) /
    Math.pow(2, zoom * 0.5);
}
