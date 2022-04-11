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

function uploadImage(e) {

  removeListeners()

  if (currentMarkers.length != 0) {
    for (var i = currentMarkers.length - 1; i >= 0; i--) {
      currentMarkers[i].remove();
    }
  }

  var file = e.target.files[0];
  let reader = new FileReader();
  reader.onload = (e) => {
    let image = e.target.result;

    var imagediv = document.getElementById('image')
    imagediv.innerHTML = '<img src="' + image + '" width="270" />';
    imagediv.style.visibility = 'visible';

    const upload_exif = piexif.load(image)
    const image_exif = [upload_exif]

    input.files = new DataTransfer().files

    for (const [index, exif] of image_exif.entries()) {
      const latitude = exif['GPS'][piexif.GPSIFD.GPSLatitude];
      const latitudeRef = exif['GPS'][piexif.GPSIFD.GPSLatitudeRef];
      const longitude = exif['GPS'][piexif.GPSIFD.GPSLongitude];
      const longitudeRef = exif['GPS'][piexif.GPSIFD.GPSLongitudeRef];

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

      coordinates.style.display = 'block';
      coordinates.innerHTML =
        'Länge: ' + lon + '<br />Breite: ' + lat;

      var marker = new maplibregl.Marker({
          draggable: true,
          "color": "red"
        })
        .setLngLat([lon, lat])
        .addTo(map);

      currentMarkers.push(marker);

      function onDragEnd() {
        var lngLat = marker.getLngLat();
        coordinates.innerHTML =
          'Länge: ' + lngLat.lng + '<br />Breite: ' + lngLat.lat;

        exif['GPS'][piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(lngLat.lat);
        exif['GPS'][piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(lngLat.lng);

        var latRef
        var lonRef

        if (lngLat.lat > 0) {
          latRef = 'N';
        } else {
          latRef = 'S';
        }

        if (lngLat.lng > 0) {
          lonRef = 'E';
        } else {
          lonRef = 'W';
        }

        exif['GPS'][piexif.GPSIFD.GPSLatitudeRef] = latRef;
        exif['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lonRef;

        delete exif['GPS'][piexif.GPSIFD.GPSAltitude];
        delete exif['GPS'][piexif.GPSIFD.GPSAltitudeRef];
        delete exif['GPS'][piexif.GPSIFD.GPSImgDirection];
        delete exif['GPS'][piexif.GPSIFD.GPSImgDirectionRef];

        const newExifBinary = piexif.dump(exif);

        const newPhoto = piexif.insert(newExifBinary, image);

        let fileBuffer = Buffer.from(newPhoto, 'binary');

        removeListeners()

        document.getElementById('save').addEventListener('click', saveImage);
        document.getElementById('save').style.display = 'block';

        function saveImage() {
          FileSaver.saveAs(newPhoto, file.name);
        };
      }
      marker.on('dragend', onDragEnd);

      map.flyTo({
        center: [
          lon, lat
        ],
        zoom: flyToZoom,
        maxDuration: 1000,
        essential: true
      });
    }
  };
  reader.readAsDataURL(file);
}

const style = {
  "version": 8,
  "sources": {
    "osm": {
      "type": "raster",
      "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      "tileSize": 256,
      "attribution": "&copy; <a target='_blank' rel='noopener noreferrer' href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>-Mitwirkende",
      "maxzoom": 19
    }
  },
  "layers": [{
    "id": "osm",
    "type": "raster",
    "source": "osm"
  }]
};

const bbox = [
  [5.8625, 50.3001],
  [9.5368, 52.5465]
]

var coordinates = document.getElementById('coordinates');
var map = new maplibregl.Map({
  container: 'map',
  style: style,
  bounds: bbox
});

var control = new maplibregl.NavigationControl({
  showCompass: false
});
map.addControl(control);

control._container.parentNode.className = "maplibregl-ctrl-left"

map.dragRotate.disable();
map.touchZoomRotate.disableRotation();

map.on('load', function() {
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

  document.getElementById('osm').addEventListener('click', function(e) {
    map.setLayoutProperty("osm", 'visibility', 'visible');
    map.setLayoutProperty("dop", 'visibility', 'none');
    map.setLayoutProperty("vdop", 'visibility', 'none');
    document.getElementById('dop').className = 'btn-control btn2'
    this.className = 'btn-control active';
  });

  document.getElementById('dop').addEventListener('click', function(e) {
    map.setLayoutProperty("osm", 'visibility', 'none');
    map.setLayoutProperty("dop", 'visibility', 'visible');
    map.setLayoutProperty("vdop", 'visibility', 'visible');
    document.getElementById('osm').className = 'btn-control'
    this.className = 'btn-control btn2 active';
  });

});