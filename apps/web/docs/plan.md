# Web Application Specification & Architecture Plan

The Next.js web application (`apps/web`) serves as the primary desktop and mobile web interface for TrafficSense, providing verified civic traffic intelligence across all four pillars: **REPORT → VERIFY → ALERT → ANALYSE**.

---

## 1. Architectural Foundation

- **Framework**: Next.js 16 (React 19, App Router, Turbopack compilation engine)
- **Styling**: Tailwind CSS with custom civic mobility design tokens (`src/app/globals.css`)
- **Mapping**: Edge-to-edge Leaflet & OpenStreetMap raster engine with custom SVG incident pins, pulsing radar rings, and floating frosted-glass cards
- **Data Engine**: Supabase (PostgreSQL 17 + PostGIS) with Row-Level Security (RLS) and Security-Definer RPC functions
- **AI Vision Integration**: Google Gemini 2.5 Flash / Flash Lite / Pro multimodal vision API for incident photo verification
- **Routing Engine**: OSRM (Open Source Routing Machine) integrated with Mangaluru arterial landmarks and 200m incident proximity collision detection

---

## 2. Core Web Routes & Capabilities

### 🌐 `/traffic` — Live Traffic Explorer
- **Full-Viewport Edge-to-Edge Canvas**: Google Maps style layout bypassing the 1200px container constraint.
- **Floating Controls Drawer**: Shows live database incidents (`/api/incidents`) with filter pills (*All*, *Verified L3+*, *Accidents*, *Hazards*).
- **Incident Inspector Card**: Displays category badge, verification ladder status, confirmation count, nearest landmark, and direct "Plan Detour Around This →" button.
- **Collapsible Corridor Drawer**: Preserves synthetic corridor inspection (`read_traffic_phase5`) and deterministic 300s route comparison proofs.

### 🗺️ `/planner` — Dynamic Route Planner & Detour Engine
- **Floating Directions Drawer**: Origin and destination selectors with Mangaluru landmark quick-select (Ambedkar Circle, Pumpwell, KSRTC Bejai, etc.), GPS auto-detect, and endpoint swapping.
- **Real-Time OSRM Calculation**: Computes free-flow transit routes, distance, and duration.
- **Incident Collision Detection**: Scans route geometry against active incidents within 200m.
- **Proactive Detours**: Suggests bypass alternatives with time differences and hazard avoidance.
- **Styled Reporting Modal**: Centered modal dialog (`z-50`) with backdrop blur for immediate road disruption submissions.

### 📸 `/report` — Citizen Incident Desk & AI Vision
- Form for reporting 17 structured hazard categories.
- GPS coordinate capture with reverse-geocoded nearest landmark resolution.
- **L5 Photo Panel**: Allows uploading incident photos; triggers Gemini multimodal vision verification to confirm road obstruction and authenticity.

### 🏛️ `/authority` — Civic Authority Portal
- **Interactive Heatmap (`hotspot-map.tsx`)**: Leaflet heatmap layer and marker clustering visualizing high-frequency accident zones and recurring bottlenecks.
- **Delay Burden Metrics**: Aggregates commuter delay-hours, peak congestion windows (`08:00–10:00` vs `17:00–19:00`), and cause-mix percentages.
- **Incident Review Panel**: Authorized civic officers can verify or clear incidents with L6 official confirmation.
- **Municipal CSV Export**: Downloadable structured data for urban planning and signal retiming.

### 🏢 `/employer` & `/receipts` — Workplace Mobility & Delay Receipts
- **Consent-Guaranteed Employee Tracking**: Displays delay duration and verification tier for consented journeys. Zero continuous background GPS tracking.
- **Ed25519 Cryptographic Receipts**: Tamper-proof digital certificates validating travel delay without revealing private travel routes or home locations.

---

## 3. API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/incidents` | `GET`, `POST` | Fetch active database incidents; submit authenticated or guest incident reports |
| `/api/route` | `POST` | Calculate OSRM route between two coordinates |
| `/api/route/reroute` | `POST` | Calculate detour route avoiding verified incident bottlenecks |
| `/api/spread` | `POST` | Calculate transit route impact spread for verified L3/L6 incidents |
| `/api/verify-evidence` | `POST` | Run L5 Gemini multimodal vision verification on incident photos |
| `/api/demo-accounts` | `GET` | Provide 1-click test credentials for evaluators and judges |
