import FileSaver from 'file-saver';
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css';
const piexif = require('piexifjs');

const inputElement = document.getElementById('input');
inputElement.addEventListener('change', uploadImage, false);

document.getElementById('select').addEventListener('click', selectImage);

function removeListeners() {
  // https: //stackoverflow.com/questions/9251837/how-to-remove-all-listeners-in-an-element
  var old_element = document.getElementById("save");
  var new_element = old_element.cloneNode(true);
  old_element.parentNode.replaceChild(new_element, old_element);
  document.getElementById('save').style.display = 'none';
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

function uploadImage(e) {

  removeListeners()

  // remove old markers
  currentMarkers.forEach(m => m.remove());
  currentMarkers = [];

  // remove old direction cone
  if (map.getLayer('directionConeLayer')) map.removeLayer('directionConeLayer');
  if (map.getSource('directionCone')) map.removeSource('directionCone');

  file = e.target.files[0];
  let reader = new FileReader();

  reader.onload = (e) => {

    // load image
    image = e.target.result;
    var imagediv = document.getElementById('image')
    imagediv.innerHTML = '<img src="' + image + '" width="270" /><p>' + file.name + '</p>';
    imagediv.style.visibility = 'visible';

    // only one exif needed
    exif = piexif.load(image)

    // read exif
    const latitude = exif['GPS'][piexif.GPSIFD.GPSLatitude];
    const latitudeRef = exif['GPS'][piexif.GPSIFD.GPSLatitudeRef];
    const longitude = exif['GPS'][piexif.GPSIFD.GPSLongitude];
    const longitudeRef = exif['GPS'][piexif.GPSIFD.GPSLongitudeRef];
    const direction = exif['GPS'][piexif.GPSIFD.GPSImgDirection];
    

    // check image heading
    heading = null;
    if (direction !== undefined && direction.length === 2) {
      heading = direction[0] / direction[1];
    } else {
      heading = 0;
      alert("Das Bild verfügt über keine Richtungsinformation, aber es kann eine gesetzt werden.")
    }

    // check image coordinates
    var lat
    var lon
    if (latitude !== undefined) {
      const latitudeMultiplier = latitudeRef.toString().substring(0, 1) == 'N' ? 1 : -1;
      lat = latitudeMultiplier * piexif.GPSHelper.dmsRationalToDeg(latitude);
      const longitudeMultiplier = longitudeRef.toString().substring(0, 1) == 'E' ? 1 : -1;
      lon = longitudeMultiplier * piexif.GPSHelper.dmsRationalToDeg(longitude);
      flyToZoom = 18;
    } else {
      lat = 51.258812;
      lon = 6.391263;
      flyToZoom = 11;
      alert("Das Bild verfügt über keine Standortkoordinaten, aber es können nun welche gesetzt werden.")
    }

    // set info text
    textInfo.style.display = 'block';
    updateTextInfo({ lng: lon, lat: lat }, heading);


    // set marker
    var marker = new maplibregl.Marker({
      draggable: true,
      "color": "red"
    })
      .setLngLat([lon, lat])
      .addTo(map);

    currentMarkers.push(marker);

    // set direction cone
    const cone = createDirectionCone(lon, lat, heading);

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

// function creates a cone-shaped polygon on a map that represents field of view
// output: GeoJSON polygon
function createDirectionCone(lon, lat, heading, pixelLength = 0.3, angle = 25, steps = 50) {

  const zoom = map.getZoom();
  const metersPerPixel = getMetersPerPixel(lat, zoom);
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
        tileSize: 256
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  },
  bounds: [[5.8, 50.3], [9.5, 52.5]]
});

var control = new maplibregl.NavigationControl({
  showCompass: false
});
map.addControl(control);

control._container.parentNode.className = "maplibregl-ctrl-left"

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
    document.getElementById('dop').className = 'btn-control btn2'
    this.className = 'btn-control active';
  });

  document.getElementById('dop').addEventListener('click', function (e) {
    map.setLayoutProperty("osm", 'visibility', 'none');
    map.setLayoutProperty("dop", 'visibility', 'visible');
    map.setLayoutProperty("vdop", 'visibility', 'visible');
    document.getElementById('osm').className = 'btn-control'
    this.className = 'btn-control btn2 active';
  });

});

// triggers the rotation of the direction cone
// rotation is only triggered in the area of the cone not covered by the position marker
map.on('mousedown', 'directionConeLayer', (e) => {

  const marker = currentMarkers[0];
  if (!marker) return;

  const markerPos = marker.getLngLat();
  const markerPixel = map.project(markerPos);
  const clickPixel = map.project(e.lngLat);

  const dx = clickPixel.x - markerPixel.x;
  const dy = clickPixel.y - markerPixel.y;

  const distPx = Math.sqrt(dx * dx + dy * dy);

  // get height of marker
  const el = marker.getElement();
  const rect = el.getBoundingClientRect();

  // rotation not triggered 'behind' the marker
  if (distPx < rect.height*0.9) return;

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
map.on('mouseup', () => {
  if (isRotating) {
    isRotating = false;
    map.dragPan.enable();
    map.getCanvas().style.cursor = '';

    const marker = currentMarkers[0];
    if (!marker) return;

    const lngLat = marker.getLngLat();

    updateExifAndImage(exif, image, file, lngLat, heading);
  }
});

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

  // image with updated exif data
  const newExifBinary = piexif.dump(exif);
  const newPhoto = piexif.insert(newExifBinary, image);

  removeListeners();

  document.getElementById('save').addEventListener('click', () => {
    FileSaver.saveAs(newPhoto, file.name);
  });

  document.getElementById('save').style.display = 'block';
}

// helper function: gets meters per pixel in a scaled manner
function getMetersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos(lat * Math.PI / 180)) /
    Math.pow(2, zoom * 0.5);
}