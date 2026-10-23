# Shared Package Specification & Contract Plan

This package (`@trafficsense/shared`) owns platform-neutral contracts, types, and pure validation utilities shared between the Next.js web application (`apps/web`) and the Expo mobile client (`apps/mobile`).

---

## 1. Implemented Scope & Contracts

- **Complete Verification Ladder (`TrafficEvidenceLevel`)**: Defines `L1` through `L6` verification tiers.
- **Incident Types & Lifecycles (`LiveIncident`, `IncidentStatus`, `IncidentProvenance`)**: Strongly-typed incident properties including status (`open`, `resolved`, `expired`), reporting counts, and timestamps.
- **17 Categorical Hazards (`reportCategories`, `ReportCategory`)**: Complete standard category catalog aligned with Traffic_JAM.pdf product brief.
- **Route & Detour Contracts (`RouteOption`, `RouteIncidentWarning`, `RouteCoordinate`, `RouteResponse`)**: GeoJSON coordinates, free-flow durations, incident proximity warnings, and detour avoidance flags.
- **Corridor & Telemetry Segments (`TrafficSegment`, `TrafficSegmentSeverity`, `TrafficSegmentsResponse`)**: Directed corridor segments and severity states (`slowdown`, `corroborated`, `reported`, `clear`).

---

## 2. Compatibility & Architectural Rules

- **Zero Runtime Dependencies**: Pure TypeScript only, with zero DOM, Next.js, Expo, or React Native imports.
- **Platform Neutrality**: Imports seamlessly into both browser (Next.js App Router) and React Native Hermes runtimes.
- **Strict Parsing**: Invalid response payloads are rejected at runtime boundaries via typed response parsers.
