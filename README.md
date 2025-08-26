# Behälter‑Navigator (PWA, Vanilla JS)

**Ziel:** Mobile PWA zum Ersetzen der Papier‑Behälterlisten. Offline‑fähig, Daumen‑Bedienung, modular (ES‑Module), ohne Build‑Tooling. Getestet auf Chrome (Xiaomi 13T Pro).

## Schnellstart (lokal)

1. Ordner auf einen lokalen Static‑Server legen (z. B. VS Code „Live Server“) oder direkt via `python -m http.server` im Ordner starten.
2. `http://localhost:8000/index.html` öffnen. Beim *zweiten* Aufruf ist die App offline verfügbar (SW‑Cache).
3. **Daten laden:** Unter *Daten* die mitgelieferten `data/*.csv` und `data/settings.json` importieren. Alternativ sind Default‑Werte vorhanden.
4. (Optional) *Werksplan* per Bild laden und **Kalibrieren**: Zwei Punkte tippen → reale Distanz (m) eingeben → px/m wird berechnet.
5. **Startpunkt** setzen (Button → auf Karte tippen) oder in `settings.json`/per Sites vorgeben.
6. **Suche → Enter**: Behälter zur Tourliste hinzufügen. Route wird automatisch berechnet (Nearest‑Neighbor).

## GitHub Pages Deploy

1. Neues Repository erstellen und gesamten Inhalt dieses Ordners auf `main` pushen.
2. In den Repo‑Settings **Pages** aktivieren: Source: *Deploy from a branch* → Branch: `main` → Folder: `/ (root)`.
3. Die veröffentlichte URL öffnen (`/index.html`). Manifest/Service Worker sorgen für PWA‑Install + Offline.
4. **Preflight/Debug** ist ausschließlich über `?pf=1` verfügbar, z. B. `…/index.html?pf=1` (lange drücken auf Titel öffnet Overlay).

## Bedienung (mobil)

- **Serieneingabe:** Fokus bleibt im Suchfeld, <kbd>Enter</kbd> fügt Top‑Treffer hinzu.
- **Warenkorb/Tourliste:** zeigt Standort, Farbe, Flags, Klasse etc.
- **Karte:** Werksplan anzeigen, Sites‑Marker, Startpunkt; Route als Polyline.
- **Schritte:** „→ Ort 7 · 280 m“. Distanz/ETA, KPIs (Stops, Behälter, TEI, Cluster). Unkalibriert → px statt m.
- **Persistenz:** localStorage; Export als JSON; Tourlogs als CSV.

## Architektur (Kernmodule)

- `js/bus.js`: Event‑Bus mit History (Preflight).
- `js/data.js`: Datenhaltung, CSV/JSON Import/Export, Migration (schema ≥ 1.1), Persistenz.
- `js/search.js`: Auto‑Complete (Prefix/Teiltreffer; Fuzzy in v1.1).
- `js/cart.js`: Warenkorb & Aggregation, Events.
- `js/routing/nearest.js`: Luftlinie + Nearest‑Neighbor. Stubs: `dijkstra.js`, `twoopt.js`.
- `js/capacity/*`: Strategien (v1 `none`, Stub `forklift_2p5t`).
- `js/map.js`: Canvas, Plan laden, Kalibrieren (2 Punkte + Meter), Startpunkt, Zeichnen.
- `js/analytics.js`: KPIs & Tour‑Logs (CSV).
- `js/ui.js`: Touch‑UI, Daumenlayout, Snackbars, Aktionen.
- `js/preflight.js`: `?pf=1`‑Overlay, Checks, Events, Storage‑Viewer, Flags.
- `sw.js`/`manifest.webmanifest`: PWA & Offline (Cache‑First).

## Definition of Done (v1)

- Offline nach 2. Aufruf; keine Konsolenfehler.
- PWA installierbar (Icon/Theme korrekt).
- Flow „Plan laden → Kalibrieren → Startpunkt → Route“ ≤ 2 min.
- Performance: First Paint < 2 s, Interaktion < 100 ms, flüssige Canvas‑Zeichnung.
- Barrierearm: sinnvolle Fokusreihenfolge, ARIA‑Labels.

## Tests (Xiaomi 13T Pro / Chrome)

- Touch‑Eingabe, Serieneingabe, Hoch/Querformat.
- PWA‑Install, Offline‑Start, SW‑Update (neu laden).
- `?pf=1` sichtbar; Standard‑Start ohne Debug.

## Roadmap

- **v1.1:** Fuzzy‑Search, Favoriten/Schnelllisten, Standort‑Heatmap, UI‑Dichte‑Schalter in Haupt‑UI.
- **v2:** Kapazitätsmodul 2,5 t/2 Stück (Tour‑Splitting), 2‑Opt‑Feinschliff.
- **v3:** Wegegraph + Dijkstra/A* (Korridore, Sperrzonen, Einbahn).

> **Sicherheitshinweis:** Fahrzeug nur im Stand bedienen.
