// Writes the real WebView map page plus a sample traffic payload for the browser check.
// Run: node --experimental-strip-types scripts/map-browser/generate-map-pages.mts <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMapHtml } from "../../src/map/map-html.ts";
import { buildMapPayload } from "../../src/map/map-data.ts";

const outDir = resolve(process.argv[2] ?? "/tmp/map-check");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "map-ok.html"), buildMapHtml());
const payload = buildMapPayload({
  segments: [{ id: "s1", name: "Approach", direction: "inbound", geometry: { type: "LineString", coordinates: [[74.83, 12.86], [74.85, 12.88]] }, severity: "slowdown", provenance: "simulated" }],
  incidents: [{ id: "i1", category: "accident", lat: 12.87, lng: 74.84, status: "open", level: "L3", level_reason: "x", first_reported_at: "2026-10-21T09:00:00Z", last_confirmed_at: "2026-10-21T09:00:00Z", provenance: "reported", report_count: 3 }],
  selectedIncidentId: "i1",
  fit: true,
});
writeFileSync(resolve(outDir, "payload.json"), JSON.stringify(payload));
console.log(`Wrote map page to ${outDir}`);
