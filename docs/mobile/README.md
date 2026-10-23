# TrafficSense Mobile: Architecture, Design System & Implementation Plan

> **The Native Mobile Companion for Decentralized Civic Traffic Intelligence & Corroborated Mobility**  
> **Platform Target:** iOS & Android (Cross-Platform via React Native / Expo)  
> **Core Pillars:** `REPORT → VERIFY → ALERT → ANALYSE` + `ZERO-SURVEILLANCE PRIVACY`

---

## 1. Executive Summary

While the TrafficSense Web Application provides full desktop and mobile web accessibility, a dedicated native mobile application delivers critical native capabilities that web browsers cannot provide:
1. **Low-Latency Vector Map Rendering**: 60/120 FPS map interactions using native OpenGL/Metal hardware acceleration via `@maplibre/maplibre-react-native` instead of WebGL canvas wrappers.
2. **True Foreground GPS Fix Accuracy**: Hardware-level GNSS location queries with instant horizontal accuracy reporting ($\le 15$m) for unambiguous L2 evidence verification.
3. **Proximity-Based Hazard Notifications**: Local geofenced push alerts when a commuter approaches a verified L3+ incident without continuous background server tracking.
4. **Offline Vector Tile Storage**: Pre-cached OpenStreetMap vector tile packages (MBTiles) for Mangaluru so maps render instantly even during poor 2G/3G mobile connectivity.
5. **Native Haptic & Gesture Feedback**: Tactile confirmation for driver safety and one-tap emergency road hazard submissions.

---

## 2. Documentation Architecture

To ensure separation of concerns, the mobile engineering specification is split across five modular documents:

```
docs/mobile/
├── README.md                   # (This file) Master vision, tech stack selection, core principles
├── architecture.md             # System architecture, state management, offline DB, network layer
├── ui-design-system.md         # Design tokens, typography, component anatomy, dark mode, haptics
├── feature-specs.md            # Detailed user flows (1-tap report, turn cards, delay receipts)
├── roadmap.md                  # 5-Phase implementation plan, testing strategy & acceptance criteria
└── native-optimizations.md     # "Making it Better & Best": Battery, 120Hz perf, privacy & offline
```

---

## 3. Technology Stack Evaluation & Decision

We evaluated three architectural paths for the TrafficSense mobile application:

| Dimension | Native (Swift + Kotlin) | Flutter (Dart) | React Native + Expo (TypeScript) |
|---|---|---|---|
| **Code Sharing with Web** | 0% (Total rewrite of routing & evidence logic) | <10% (Requires Dart port of all algorithms) | **>70% (Directly shares TypeScript types, API clients, PostGIS logic)** |
| **Map Engine** | MapLibre Native SDK (Dual native implementations) | `maplibre_gl` Flutter plugin (Medium community support) | **`@maplibre/maplibre-react-native` (Production-grade, highly active)** |
| **Developer Velocity** | Slow (Dual team required) | Medium (Single codebase, custom widgets) | **Fastest (Single unified TypeScript stack, EAS build pipeline)** |
| **Performance** | Native (Best) | Compiled C++ Skia (Excellent) | **JSI / Hermes engine with TurboModules (Near-native 120 FPS)** |
| **Offline DB Support** | CoreData / Room | Isar / Hive | **WatermelonDB / SQLite (Reactive, offline-first)** |

### **The Decision: React Native with Expo (Managed Workflow + Prebuild)**
- **Runtime:** React Native 0.76+ with the **New Architecture** enabled by default (Fabric renderer + TurboModules over JSI for zero-bridge serialisation overhead).
- **Engine:** Hermes JavaScript engine optimized for fast Android startup and minimal memory footprint.
- **Language:** TypeScript 5.x sharing interfaces directly with the existing `src/lib/` contracts.
- **Tooling:** Expo Application Services (EAS) for seamless automated iOS and Android builds without maintaining heavy local Xcode/Android Studio toolchains.

---

## 4. Non-Negotiable Engineering Principles

1. **Zero Background Surveillance**: The app will **never** register continuous background location services. Location queries are triggered strictly *foreground on demand* (when submitting a report or opening active route guidance).
2. **Sub-300ms Interaction Latency**: Every tap, bottom-sheet drag, and map pan must maintain 60–120 FPS without dropped frames.
3. **Graceful Offline Degradation**: If mobile signal drops in a Mangaluru tunnel or under heavy monsoon weather, maps load from local tile cache, and reports queue in local SQLite storage with cryptographic timestamps.
4. **Driver Ergonomics**: Key actions (Report Incident, Switch Route, Confirm Delay) must feature massive touch targets ($\ge 56\text{pt}$), high-contrast readability under bright daylight, and distinctive haptic vibrations.
