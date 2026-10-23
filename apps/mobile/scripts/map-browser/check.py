"""Headless check of the generated WebView map page. See README.md in this folder."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

served = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/map-check")
base = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8765"
payload = json.loads((served / "payload.json").read_text())
STUB = "window.__msgs = []; window.ReactNativeWebView = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };"


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 400, "height": 640})
        page.add_init_script(STUB)
        page.goto(f"{base}/map-ok.html")
        page.wait_for_function("window.__msgs.some(m => m.type === 'ready' || m.type === 'failed')", timeout=30000)
        ready = [m for m in page.evaluate("window.__msgs") if m["type"] == "ready"]
        assert ready, f"Leaflet did not initialize: {page.evaluate('window.__msgs')}"
        page.evaluate(f"window.trafficMap.setData({json.dumps(payload)})")
        marker = page.locator(".leaflet-interactive").last
        marker.wait_for(state="visible", timeout=5000)
        marker.click()
        selected = [m for m in page.evaluate("window.__msgs") if m["type"] == "select-incident"]
        assert selected, "Tapping the report did not select it"
        print(f"Leaflet map ready, report tap selected {selected[0]['id']}")
        browser.close()


run()
