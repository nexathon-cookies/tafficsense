# Problem Statement and Scope Reference

## Original brief

[Traffic_JAM.pdf](Traffic_JAM.pdf) is the original 12-page problem statement supplied by the user, copied unchanged into this repository. Page 12 says the document was generated using ChatGPT from input supplied by an employer experiencing employee-arrival and traffic problems. Treat it as the product brief, not independently verified research or the official hackathon rules.

## Main goal

Identify and communicate road disruptions and their possible causes, help commuters avoid affected roads, provide consent-based employer visibility, and retain useful historical statistics for investigating recurring traffic problems.

The brief's four pillars are **REPORT → VERIFY → ALERT → ANALYSE** (page 12). A Delay Receipt is our proposed extension to traffic verification and employer sharing, not a separately required module in the PDF. Its exact fields and prominence depend on employer feedback; it must not replace the broader traffic goal.

## Recommended MVP traceability

The PDF recommends seven modules on page 12. The following maps them to the bounded scope in [plan.md](plan.md) and phases in [implementation.md](implementation.md). This is a scope/acceptance reference; actual implementation and verification belong in [progress.md](progress.md).

| Recommended module | Source pages / sections | Implemented demonstration & extensions | Acceptance reference |
| --- | --- | --- | --- |
| 1. Registration and login | p. 12 MVP; pp. 8–9 §15 roles | Supabase GoTrue Auth, public guest entry, protected commuter/employer/authority/admin roles, session cookie isolation | Phase 1; S7, S10–S11; sharing S13 |
| 2. Live GPS and traffic map | pp. 1–2 §3; p. 8 §13 | Edge-to-edge interactive Leaflet / MapLibre map (`/traffic`), real database incident markers with category icons, live telemetry bar, synthetic corridor inspect drawer | Phases 3–4; S1, S4, S10–S11 |
| 3. Incident reporting | p. 1 §2; p. 7 §11 | Direct citizen reporting (`/report`), 17 PDF categories, exact GPS coordinates with landmark snapping, rate-limiting, and modal dialog in route planner | Phase 4; S1–S3 |
| 4. Incident verification | pp. 2–3 §4; p. 7 §12 | **Complete L1–L6 Ladder**: L1 Reported, L2 Location supported, L3 Multi-source ($\ge 3$), L4 Speed slowdown ($\le 40\%$), **L5 AI Multimodal Vision (Gemini 2.5)**, and **L6 Authority Confirmed** | Phase 4; S1–S5; receipt extension Phase 8/S7–S9 |
| 5. Alternative route alert | pp. 1–2 §3; p. 9 §16 | Fixed arterial route comparison + **Dynamic OSRM Route Planner** (`/planner`) with landmark search, incident proximity detours, and **Spread Analysis** (`/api/spread`) | Phase 5; S12 |
| 6. Employer employee-travel dashboard | p. 3 §5; p. 4 §6 | Employee-started, explicitly shared journey status; **Ed25519 Cryptographic Delay Receipts** (`/receipts`); zero background GPS tracking | Phase 6/S13; receipt Phase 8/S6–S9 |
| 7. Traffic analytics and monthly reports | pp. 4–6 §§7–10; pp. 9–10 §17 | **Civic Authority Portal** (`/authority`), interactive Leaflet heatmap with marker clustering, peak hour windows, cause-mix percentages, and one-click municipal CSV export | Phase 7; S14, M7 |

### Platform Architecture & Mobile Expansion

- **Native Mobile Companion**: React Native + Expo client (`apps/mobile`) providing driver-optimized UX, 48px touch bounding targets, Leaflet WebView with OpenStreetMap raster tiles, schematic fallback, and foreground GPS capture.
- **Multimodal AI Vision (L5)**: Integrated Google Gemini 2.5 Vision API (`apps/web/src/lib/vision/verify-incident-photo.ts`) analyzing citizen hazard photos for authentic road obstructions, debris, and floods before elevating verification status.
- **Dynamic OSRM Engine & Spread Analysis**: Evaluates route collisions against active database incidents, suggesting verified bypasses and computing route disruption spread across the urban transit grid.
- **Honest Provenance & Privacy Guarantees**: Continuous 24/7 background surveillance is strictly avoided. Evidence levels are transparent indicators. Real OSRM routes are qualified as free-flow estimates.

## Rule for Future Work

Before implementing a task, identify its module above and its acceptance checks in the plan. Before removing or expanding a module, obtain user approval and update the plan's scope and decisions with the reason, remaining gap, and effect on the demo. The PDF remains unchanged; scope decisions belong in the plan.

[plan.md](plan.md) holds scope, contracts and acceptance targets; [implementation.md](implementation.md) holds detailed phases; [progress.md](progress.md) alone holds task updates, actual blockers, verification results and commit records. Use verified phases; confirm any deadline, event requirements and employer feedback rather than infer them from this brief. Do not describe planned, simulated, deferred or partially covered behavior as implemented real-world functionality.
