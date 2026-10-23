# Map page browser check

Checks the Leaflet WebView map page in headless Chromium, without a phone. Internet access is needed for Leaflet and OpenStreetMap tiles.

1. Generate the page and sample payload: `node --experimental-strip-types scripts/map-browser/generate-map-pages.mts /tmp/map-check` (run from `apps/mobile`).
2. Serve the generated directory on `127.0.0.1:8765`: `python3 -m http.server 8765 --directory /tmp/map-check`.
3. Run `python3 scripts/map-browser/check.py /tmp/map-check http://127.0.0.1:8765` with Playwright and Chromium installed. The check expects Leaflet to initialize and a tap on the report to send `select-incident`.

This check does not verify Expo Go, Android WebView layout, or tile loading on a phone.
