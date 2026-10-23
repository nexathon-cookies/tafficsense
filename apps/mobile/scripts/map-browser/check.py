"""Headless check of the generated WebView map page. See README.md in this folder."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

served = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/map-check")
base = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8765"
payload = json.loads((served / "payload.json").read_text())
STUB = "window.__msgs = []; window.ReactNativeWebView = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };"


def run(name, expect_fallback):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 400, "height": 640})
        page.add_init_script(STUB)
        page.goto(f"{base}/{name}")
        page.wait_for_function("window.__msgs.some(m => m.type === 'ready' || m.type === 'failed')", timeout=30000)
        ready = [m for m in page.evaluate("window.__msgs") if m["type"] == "ready"]
        assert ready and ready[0]["fallback"] == expect_fallback, f"{name}: unexpected ready state {ready}"
        page.evaluate(f"window.trafficMap.setData({json.dumps(payload)})")
        page.wait_for_timeout(800)
        box = page.locator("canvas").first.bounding_box()
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.wait_for_timeout(500)
        selected = [m for m in page.evaluate("window.__msgs") if m["type"] == "select-incident"]
        assert selected, f"{name}: tapping the report did not select it"
        print(f"{name}: ready (fallback={expect_fallback}), report tap selected {selected[0]['id']}")
        browser.close()


run("map-ok.html", False)
run("map-fallback.html", True)
