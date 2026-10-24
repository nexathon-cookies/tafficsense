# TrafficSense

> **Decentralized Civic Traffic Intelligence & Corroborated Mobility Platform**  
> Core Framework: `REPORT → VERIFY → ALERT → ANALYSE`

TrafficSense is a privacy-first civic traffic intelligence engine. It replaces unverified crowd rumors and invasive 24/7 background GPS tracking with transparent multi-source evidence corroboration, deterministic delay verification, and consent-guaranteed employer sharing.

---

## Key Highlights

- **Zero Continuous Tracking**: Commuters never surrender 24/7 background geolocation. Reports and journeys bind to arterial segments without persistent location footprints.
- **Deterministic Corroboration (L1–L6)**: Multi-source 50m incident clustering (`L3`), speed slowdown proof (`L4`), **Gemini Vision + C2PA Anti-AI Photo Corroboration (`L5`)**, and Civic Authority confirmation (`L6`) ensure only verified incidents trigger route avoidance.
- **Conservative Alert Discipline**: Alerts trigger only for fixed arterial alternatives with verified savings $\ge 5$ minutes (300s); the system strictly abstains when evidence is stale or hazard-blocked.
- **Consent-Guaranteed Sharing**: Employees can share verified commute delay summaries with employers without exposing real-time GPS coordinates.
- **Civic Analytics & Hotspot Mapping**: OpenStreetMap corridor ranking, delay-hour aggregation, recurrence heatmaps, and CSV export for municipal planning.

---

## Tech Stack

- **Web Application**: Next.js 16 (App Router, Turbopack, Tailwind CSS)
- **Mobile Application**: Expo / React Native (`apps/mobile`) with commuter & civic authority workflows
- **AI & Vision Pipeline**: Google Gemini Vision (`gemini-3.5-flash-lite`) with client-side EXIF GPS stripping and 2-layer synthetic/AI-generated image rejection
- **Data & Security**: PostgreSQL 17 / Supabase with Row-Level Security (RLS)
- **Mapping & Routing**: OpenStreetMap / MapLibre GL, OSRM dynamic detour routing & spread engine
- **Tooling**: Docker, Docker Compose, `justfile`, pnpm

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- `just` command runner (recommended)

### Run Locally

```bash
# Start local Supabase, seed demo accounts, and launch the dev app
just up

# Check container health and status
just status

# Open the application
http://localhost:3000
```

To stop containers:
```bash
just down        # Preserves databases
just stop-all    # Stops all containers including Supabase
```

---

## Project Documentation

Detailed architecture, specifications, and guides are organized under [`docs/`](docs/):

- 📄 **[System Specification & Whitepaper](docs/system-specification.md)**: Full architectural specification, mathematical proofs, and data workflows.
- 📋 **[Product Scope & Plan](docs/plan.md)**: Problem statement mapping, module boundaries, and acceptance criteria.
- 🚀 **[Implementation Roadmap](docs/implementation.md)**: Phased delivery plan from foundations to verified releases.
- 📱 **[Mobile Application Specs](docs/mobile/README.md)**: Native mobile app architecture and UI design system.
- 🐳 **[Docker & Setup Guide](docs/docker.md)**: Container commands, networking recipes, and environment troubleshooting.
- 🤖 **[AI Agent Root Rules](ai/ai_agent_root_rules.md)**: Engineering guidelines and contribution principles.

---

## License

Private project developed for the traffic hackathon. See [docs/plan.md](docs/plan.md) for scope and details.
