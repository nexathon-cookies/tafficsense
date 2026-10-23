# Map page browser check

Checks the WebView map page in headless Chromium, without a phone.

1. Install the pinned MapLibre package for local serving: `npm pack maplibre-gl@6.14.0`, extract it, and serve its `package/dist` folder on `127.0.0.1:8765` (with `python3 -m http.server 8765`). Also place a `style-ok.json` file there (a background-only style).
2. Generate the pages: `node --experimental-strip-types scripts/map-browser/generate-map-pages.mts /tmp/map-check http://127.0.0.1:8765` (run from `apps/mobile`), then copy them into the served folder.
3. Run `python3 scripts/map-browser/check.py` with Playwright and Chromium installed. It expects the normal page to report `ready`, the fallback page to report `ready` with the fallback flag, and a tap on the report to send `select-incident`.

The phone-side checks (jsDelivr script load, OpenFreeMap tiles, Android WebView scrolling) are not covered by this script.
