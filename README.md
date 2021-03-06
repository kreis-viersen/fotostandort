# Fotostandort
[![GitHub CI status](https://github.com/kreis-viersen/fotostandort/workflows/ci/badge.svg)][github-action-ci]
[![License](https://img.shields.io/badge/license-MIT-blue.svg)][license]

[github-action-ci]: https://github.com/kreis-viersen/fotostandort/actions?query=workflow%3Aci
[license]:          https://tldrlegal.com/license/mit-license

### _Browsertool zum Anzeigen/Verändern/Setzen des Fotostandorts (JPEG / EXIF-Daten)_

https://kreis-viersen.github.io/fotostandort/

Fragen, Anmerkungen, Fehlermeldungen etc. können z.B. über ein [GitHub-Issue](https://github.com/kreis-viersen/fotostandort/issues) oder auch gerne per E-Mail an [open@kreis-viersen.de](mailto:open@kreis-viersen.de?subject=Fotostandort) mitgeteilt werden.

## Features
- Bildposition wird durch Marker auf der Karte angezeigt, Veränderung der EXIF-Positionsdaten erfolgt durch Verschieben des Markers - anschließend kann das veränderte Bild gespeichert werden.
- Wenn keine Koordinaten im Bild vorhanden sind, wird eine entsprechende Meldung angezeigt und es kann ein Standort mittels Marker gesetzt werden.
- Hintergrund OpenStreetMap oder Luftbild ([DOP/vDOP von Geobasis NRW](https://www.bezreg-koeln.nrw.de/brk_internet/geobasis/luftbildinformationen/aktuell/digitale_orthophotos/index.html)).
- Das Bild wird lokal geladen und modifiziert (kein Upload auf irgendeinen Server).

<img src="screenshots/screenshot.jpg"/>

## Einstellung Speicherort Webbrowser

### Firefox

<img src="screenshots/firefox_einstellung_speicherort.jpg"/>

### Chrome

<img src="screenshots/chrome_einstellung_speicherort.jpg"/>
