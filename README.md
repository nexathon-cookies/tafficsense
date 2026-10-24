# TrafficSense

> **Decentralized Civic Traffic Intelligence, Corroborated Mobility & Employer Trust Platform**
> Core Framework: `REPORT → VERIFY → ALERT → ANALYSE`
> *Beyond Crowdsourced Rumors: Mathematically Verified Delays, Multimodal AI Vision, Zero-Surveillance Privacy*

TrafficSense is a privacy-first civic traffic intelligence and mobility trust platform. It replaces unverified crowd noise and invasive 24/7 background GPS tracking with transparent multi-source evidence corroboration, multimodal AI vision verification, deterministic delay calculations, intelligent detour routing, and consent-guaranteed employer sharing.

---

## Why TrafficSense Is Much More Than a Reporting System

Most traffic apps stop at user-submitted pins on a map. TrafficSense is an **end-to-end verified mobility ecosystem**:

1. **Deterministic Corroboration Ladder (L1–L6)**:
   - **L1 (Reported)**: Single-source citizen or guest problem submission with segment/GPS binding.
   - **L2 (Location Supported)**: Arterial segment snapping and spatial coordinate validation.
   - **L3 (Multi-Source Corroborated)**: $\ge 3$ distinct reporting identities within a 15-minute rolling window.
   - **L4 (Speed Slowdown Supported)**: Quantitative physical slowdown proof ($\le 40\%$ baseline for $\ge 5$ minutes).
   - **L5 (Multimodal AI Vision Verified)**: Automated image analysis via Google Gemini Vision models verifying real road hazards and filtering out fraudulent photos.
   - **L6 (Civic Authority Confirmed)**: Official municipal/police confirmation with immutable audit logging.
2. **Zero Continuous Background Surveillance**:
   - Commuters never surrender 24/7 background geolocation. Reports and journeys bind to arterial segments without persistent location footprints.
3. **Dynamic OSRM Routing & Proactive Detours**:
   - Full-viewport Google Maps-style route planner with landmark search, GPS autofill, 200m incident collision detection, and automated detour recommendations.
4. **Spread Analysis Engine**:
   - Evaluates how verified arterial bottlenecks radiate congestion across interconnected city routes, identifying which transit corridors are impacted.
5. **Conservative Alert & Abstention Discipline**:
   - Alerts trigger only when an alternative route provides a mathematically verified time savings $\ge 5$ minutes (300s); the system strictly abstains when evidence is stale or when the alternative contains hazards.
6. **Consent-Guaranteed Workplace Delay Receipts**:
   - Commuters can share verified commute delay summaries and cryptographically signed (Ed25519) digital receipts with employers **without disclosing GPS tracks, routes, or home addresses**. Access is immediately revoked upon ending the journey.
7. **Civic Authority Analytics & Heatmap**:
   - Longitudinal hotspot prioritization ranked by cumulative commuter delay-hours, interactive Leaflet heatmap clustering, cause-mix breakdown, and one-click municipal CSV export.
8. **Cross-Platform Experience**:
   - Web App (Next.js 16, Turbopack, Tailwind CSS) + Native Mobile App (React Native, Expo, Leaflet WebView / Google Maps UX).

---

## Tech Stack

- **Web Application**: Next.js 16 (App Router, Turbopack, Tailwind CSS, Leaflet / MapLibre GL)
- **Mobile Application**: Expo SDK 57 / React Native 0.86 (TypeScript, Vector Icons, Leaflet / Google Maps UX)
- **AI Vision Engine**: Google Gemini 2.5 Flash / Flash Lite / Pro Multimodal Vision API
- **Data & Security**: PostgreSQL 17 / Supabase with PostGIS, Row-Level Security (RLS), and Security-Definer RPCs
- **Routing Engine**: Open Source Routing Machine (OSRM) + Mangaluru Arterial Road Network Presets
- **Tooling**: Docker, Docker Compose, `justfile`, pnpm (pinned in root)

---

## Quick Start

### Prerequisites
- Docker & Docker Compose (v2+)
- `just` command runner (recommended)

### Run Locally

```bash
# Start local Supabase, apply migrations, seed demo accounts, and launch the dev app
just up

# Check container health and status
just status

# Open the application
http://localhost:3000
```

### Key Application Routes
- 🌐 **Live Traffic Map**: `http://localhost:3000/traffic` — Full-screen interactive map with real-time incident pins, filters, and corridor telemetry.
- 🗺️ **Route Planner & Detours**: `http://localhost:3000/planner` — Dynamic routing with Mangaluru presets, incident avoidance, and detour comparisons.
- 📸 **Incident Reporting & AI Vision**: `http://localhost:3000/report` — Submit incident reports with exact GPS coordinates and L5 AI photo verification.
- 🏢 **Employer Dashboard**: `http://localhost:3000/employer` — Review consented, zero-tracking employee commute delay claims.
- 🏛️ **Civic Authority Portal**: `http://localhost:3000/authority` — Interactive bottleneck heatmap, delay-hour aggregations, incident review, and CSV export.
- 📱 **Mobile App (Expo)**: `apps/mobile` (`just mobile-typecheck`, `pnpm --filter @trafficsense/mobile start`)

To stop containers:
```bash
just down        # Preserves databases and volume cache
just stop-all    # Stops all containers including Supabase
```

---

## Documentation Directory

- 🎤 **[Presentation Pitch & Walkthrough Guide](docs/presentation.md)**: Complete pitch script, demonstration flows, and talking points proving TrafficSense is far more than a reporting tool.
- 📄 **[System Specification & Whitepaper](docs/system-specification.md)**: Full architectural specification, mathematical proofs, and data workflows.
- 💡 **[Platform Deep Dive & Problem Breakdown](docs/whatthis.md)**: Comprehensive explanation of real-world friction, core breakthroughs, and module mechanics.
- 📋 **[Product Scope & Plan](docs/plan.md)**: Problem statement mapping, module boundaries, and acceptance criteria.
- 🚀 **[Implementation Roadmap](docs/implementation.md)**: Phased delivery plan from foundations to verified releases.
- 📱 **[Mobile Application Specs](docs/mobile/README.md)**: Native mobile app architecture and UI design system.
- 🐳 **[Docker & Setup Guide](docs/docker.md)**: Container commands, networking recipes, and environment troubleshooting.
- 🤖 **[AI Agent Root Rules](ai/ai_agent_root_rules.md)**: Engineering guidelines and contribution principles.

---

## License

Private project developed for the traffic hackathon. See [docs/plan.md](docs/plan.md) for scope and details.
