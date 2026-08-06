import FileSaver from 'file-saver';
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css';
const piexif = require('piexifjs');

const inputElement = document.getElementById('input');
const infoPanel = document.getElementById('info-panel');
const imageDiv = document.getElementById('image');
const textInfo = document.getElementById('textInfo');

inputElement.addEventListener('change', uploadImage, false);

document.getElementById('select').addEventListener('click', selectImage);


function resetSaveButton() {
  const saveButton = document.getElementById("save");
  saveButton.onclick = null;
  saveButton.style.display = "none";
}

function selectImage() {
  document.getElementById('input').click();
}

var flyToZoom
var currentMarkers = [];
let heading = 0;
let isRotating = false;
let exif = null;
let image = null;
let file = null;
let helpPopup = null;

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
      "0th": {},
      "Exif": {},
      "GPS": {},
      "1st": {},
      "thumbnail": null
    };
  }

  return {
    exif: exifData,
    hasExif,
    hasLocation,
    hasDirection
  };
}

function showExifDialog(status) {

  let message = "";

  if (!status.hasExif) {
    message =
      "Dieses Bild enthält keine EXIF-Daten.\n\n" +
      "Möchten Sie einen Standort und eine Blickrichtung hinzufügen?";
  }

  else if (!status.hasLocation && !status.hasDirection) {
    message =
      "Dieses Bild enthält keine Standort- oder Richtungsinformationen.\n\n" +
      "Möchten Sie diese Informationen hinzufügen?";
  }

  else if (!status.hasLocation) {
    message =
      "Dieses Bild enthält keine Standortkoordinaten.\n\n" +
      "Möchten Sie einen Standort setzen?";
  }

  else if (!status.hasDirection) {
    message =
      "Dieses Bild enthält keine Blickrichtung.\n\n" +
      "Möchten Sie eine Blickrichtung setzen?";
  }

  if (message.length > 0) {
    return confirm(message);
  }

  return true;
}

function convertToJpeg(dataUrl) {
  return new Promise((resolve, reject) => {

    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas-Kontext konnte nicht erstellt werden."));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const jpegDataUrl = canvas.toDataURL(
        "image/jpeg",
        0.95
      );

      resolve(jpegDataUrl);
    };

    img.onerror = reject;

    img.src = dataUrl;
  });
}

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

function uploadImage(e) {

  resetSaveButton();
  infoPanel.style.display = 'none';

  // remove old markers
  currentMarkers.forEach(m => m.remove());
  currentMarkers = [];

  // remove old help popup
  if (helpPopup) {
    helpPopup.remove();
    helpPopup = null;
  }

  // remove old direction cone
  if (map.getLayer('directionConeLayer')) map.removeLayer('directionConeLayer');
  if (map.getSource('directionCone')) map.removeSource('directionCone');

  const selectedFile = e.target.files?.[0];

  if (!selectedFile) {
    return;
  }

  file = selectedFile;
  let reader = new FileReader();

  reader.onload = async (e) => {

    image = e.target.result;

    if (file.type !== "image/jpeg") {
      image = await convertToJpeg(image);
      file = new File(
        [dataURLtoBlob(image)],
        file.name.replace(/\.[^/.]+$/, ".jpg"),
        { type: "image/jpeg" }
      );
    }

    imageDiv.innerHTML =
      '<img src="' + image + '" alt="Bildvorschau">' +
      '<p>' + file.name + '</p>';

    const status = analyzeExif(image);

    if (!showExifDialog(status)) {
      imageDiv.replaceChildren();
      return;
    }
    infoPanel.style.display = 'flex';
    exif = status.exif;

    if (!exif.GPS) {
      exif.GPS = {};
    }

    const latitude = exif['GPS'][piexif.GPSIFD.GPSLatitude];
    const latitudeRef = exif['GPS'][piexif.GPSIFD.GPSLatitudeRef];

    const longitude = exif['GPS'][piexif.GPSIFD.GPSLongitude];
    const longitudeRef = exif['GPS'][piexif.GPSIFD.GPSLongitudeRef];

    const direction = exif['GPS'][piexif.GPSIFD.GPSImgDirection];

    let lat;
    let lon;

    if (status.hasLocation) {

      const latitudeMultiplier =
        latitudeRef.toString().substring(0, 1) === 'N'
          ? 1
          : -1;

      lat =
        latitudeMultiplier *
        piexif.GPSHelper.dmsRationalToDeg(latitude);

      const longitudeMultiplier =
        longitudeRef.toString().substring(0, 1) === 'E'
          ? 1
          : -1;

      lon =
        longitudeMultiplier *
        piexif.GPSHelper.dmsRationalToDeg(longitude);

      flyToZoom = 18;

    } else {

      lat = 51.258812;
      lon = 6.391263;
      flyToZoom = 13;
    }

    if (status.hasDirection &&
      direction &&
      direction.length === 2) {

      heading = direction[0] / direction[1];

    } else {

      heading = 180;
    }

    // set info text
    updateTextInfo({ lng: lon, lat: lat }, heading);


    // set marker
    var marker = new maplibregl.Marker({
      draggable: true,
      "color": "red"
    })
      .setLngLat([lon, lat])
      .addTo(map);

    currentMarkers.push(marker);

    // place tutorial/instruction popup
    showMarkerHelp(marker);

    // set direction cone
    const cone = createDirectionCone(lon, lat, heading);

    updateExifAndImage(
      exif,
      image,
      file,
      marker.getLngLat(),
      heading
    );

    map.addSource('directionCone', {
      type: 'geojson',
      data: cone
    });

    map.addLayer({
      id: 'directionConeLayer',
      type: 'fill',
      source: 'directionCone',
      paint: {
        'fill-color': '#146adb',
        'fill-opacity': 0.3
      }
    });

    // when marker gets dragged: update text info and move direction cone accordingly
    marker.on('drag', () => {
      const lngLat = marker.getLngLat();

      updateTextInfo(lngLat, heading);

      const source = map.getSource('directionCone');
      if (source) {
        source.setData(createDirectionCone(lngLat.lng, lngLat.lat, heading));
      }
    });

    // when marker drag stops: update image exif
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      updateExifAndImage(exif, image, file, lngLat, heading);
    });

    // automatic fly to location
    map.flyTo({
      center: [lon, lat],
      zoom: flyToZoom,
      maxDuration: 1000,
      essential: true
    });
  };

  reader.readAsDataURL(file);
}


function showMarkerHelp(marker) {

  if (helpPopup) {
    helpPopup.remove();
  }

  const popupContent = document.createElement('div');
  popupContent.className = 'marker-help';

  popupContent.innerHTML = `
    <div class="marker-help-title">
      Position und Blickrichtung anpassen
    </div>

    <div class="marker-help-section">
      <span class="marker-help-icon">↕</span>
      <span>
        Bewegen Sie den roten Marker per Drag-and-Drop an die
        tatsächliche Aufnahmeposition.
      </span>
    </div>

    <div class="marker-help-section">
      <span class="marker-help-icon">↻</span>
      <span>
        Drehen Sie den blauen Sichtkegel um den Marker, um die
        Blickrichtung anzupassen.
      </span>
    </div>

    <div class="marker-help-note">
      Orientieren Sie sich dabei an der Bildvorschau. Darunter werden
      Position und Blickrichtung fortlaufend aktualisiert.
    </div>

    <button type="button" class="marker-help-close">
      Verstanden
    </button>
  `;

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

  marker.on('drag', () => {
    if (helpPopup) {
      helpPopup.setLngLat(marker.getLngLat());
    }
  });

  popupContent
    .querySelector('.marker-help-close')
    .addEventListener('click', () => {
      helpPopup?.remove();
      helpPopup = null;
    });

  helpPopup.on('close', () => {
    helpPopup = null;
  });
}

// function creates a cone-shaped polygon on a map that represents field of view
// output: GeoJSON polygon
function createDirectionCone(lon, lat, heading, pixelLength = 0.3, angle = 25, steps = 50) {

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
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coords]
    }
  };
}

// set up map
var coordinates = document.getElementById('coordinates');

var map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  },
  bounds: [[5.8, 50.3], [9.5, 52.5]]
});

var control = new maplibregl.NavigationControl({
  showCompass: false
});
map.addControl(control, 'top-left');

//control._container.parentNode.className = "maplibregl-ctrl-left"

map.dragRotate.disable();
map.touchZoomRotate.disableRotation();

map.on('load', function () {
  map.addSource('dop', {
    'type': 'raster',
    'tiles': [
      'https://www.wms.nrw.de/geobasis/wms_nw_dop?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&LAYERS=nw_dop_rgb&STYLES=&FORMAT=image/png&TRANSPARENT=true'
    ],
    'tileSize': 256
  });
  map.addLayer({
    'id': 'dop',
    'type': 'raster',
    'source': 'dop',
    'layout': {
      'visibility': 'none'
    }
  });

  map.addSource('vdop', {
    'type': 'raster',
    'tiles': [
      'https://www.wms.nrw.de/geobasis/wms_nw_vdop?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&LAYERS=nw_vdop_rgb&STYLES=&FORMAT=image/png&TRANSPARENT=true'
    ],
    'tileSize': 256
  });

  map.addLayer({
    'id': 'vdop',
    'type': 'raster',
    'source': 'vdop',
    'layout': {
      'visibility': 'none'
    }
  });

  document.getElementById('osm').addEventListener('click', function (e) {
    map.setLayoutProperty("osm", 'visibility', 'visible');
    map.setLayoutProperty("dop", 'visibility', 'none');
    map.setLayoutProperty("vdop", 'visibility', 'none');
    document.getElementById('dop').classList.remove('active');
    this.classList.add('active');
  });

  document.getElementById('dop').addEventListener('click', function (e) {
    map.setLayoutProperty("osm", 'visibility', 'none');
    map.setLayoutProperty("dop", 'visibility', 'visible');
    map.setLayoutProperty("vdop", 'visibility', 'visible');
    document.getElementById('osm').classList.remove('active');
    this.classList.add('active');
  });

});

// triggers the rotation of the direction cone
// rotation is only triggered in the area of the cone not covered by the position marker
map.on('mousedown', 'directionConeLayer', (e) => {
  const marker = currentMarkers[0];
  if (!marker) return;

  const markerElement = marker.getElement();
  const markerRect = markerElement.getBoundingClientRect();

  const mouseEvent = e.originalEvent;

  const clickInsideMarker =
    mouseEvent.clientX >= markerRect.left &&
    mouseEvent.clientX <= markerRect.right &&
    mouseEvent.clientY >= markerRect.top &&
    mouseEvent.clientY <= markerRect.bottom;

  if (clickInsideMarker) {
    return;
  }

  isRotating = true;
  map.dragPan.disable();
  map.getCanvas().style.cursor = 'grabbing';

  e.preventDefault();
});

// rotates the direction cone according to the mouse and updates info text
map.on('mousemove', (e) => {
  if (!isRotating) return;

  const marker = currentMarkers[0];
  if (!marker) return;

  const pos = marker.getLngLat();

  const dx = e.lngLat.lng - pos.lng;
  const dy = e.lngLat.lat - pos.lat;

  let angle = Math.atan2(dx, dy) * 180 / Math.PI;
  if (angle < 0) angle += 360;

  heading = angle;

  const source = map.getSource('directionCone');
  if (source) {
    source.setData(createDirectionCone(pos.lng, pos.lat, heading));
  }
  updateTextInfo(pos, heading);
});

// stops the rotation of the direction cone and updates exif
map.on('mouseup', stopRotation);
window.addEventListener('mouseup', stopRotation);


// updates size of the direction cone
map.on('zoom', () => {
  const marker = currentMarkers[0];
  if (!marker) return;

  const pos = marker.getLngLat();

  const source = map.getSource('directionCone');
  if (source) {
    source.setData(createDirectionCone(pos.lng, pos.lat, heading));
  }
});

function stopRotation() {

  if (!isRotating) {
    return;
  }

  isRotating = false;

  map.dragPan.enable();
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

// function for updating the info text (lat, lon, heading)
function updateTextInfo(pos, heading) {
  textInfo.innerHTML = `
    <table>
      <tr>
        <td>Länge:</td>
        <td>${pos.lng.toFixed(6)}</td>
      </tr>
      <tr>
        <td>Breite:</td>
        <td>${pos.lat.toFixed(6)}</td>
      </tr>
      <tr>
        <td>Richtung:</td>
        <td>${Math.round(heading)}°</td>
      </tr>
    </table>
  `;
}

// function that updates exif data (lat, lon, heading)
function updateExifAndImage(exif, image, file, lngLat, heading) {

  // coordinates
  exif['GPS'][piexif.GPSIFD.GPSLatitude] =
    piexif.GPSHelper.degToDmsRational(lngLat.lat);

  exif['GPS'][piexif.GPSIFD.GPSLongitude] =
    piexif.GPSHelper.degToDmsRational(lngLat.lng);

  // direction tag (N/S/E/W)
  const latRef = lngLat.lat >= 0 ? 'N' : 'S';
  const lonRef = lngLat.lng >= 0 ? 'E' : 'W';

  exif['GPS'][piexif.GPSIFD.GPSLatitudeRef] = latRef;
  exif['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lonRef;

  // direction of sight
  exif['GPS'][piexif.GPSIFD.GPSImgDirection] = [
    Math.round(heading * 100),
    100
  ];
  exif.GPS[piexif.GPSIFD.GPSImgDirectionRef] = 'T';

  // image with updated exif data
  const newExifBinary = piexif.dump(exif);
  const newPhoto = piexif.insert(newExifBinary, image);

  resetSaveButton();

  const saveButton = document.getElementById("save");

  saveButton.onclick = () => {
    FileSaver.saveAs(newPhoto, file.name);
  };

  saveButton.style.display = "block";
}

// helper function: gets meters per pixel in a scaled manner
function getScaledConeLength(lat, zoom) {
  return (156543.03392 * Math.cos(lat * Math.PI / 180)) /
    Math.pow(2, zoom * 0.5);
}