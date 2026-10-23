# Mobile System Architecture & Technical Stack

This document specifies the technical architecture, data pipelines, offline persistence engine, and native device integrations for the TrafficSense mobile application.

---

## 1. System Layer Diagram

```mermaid
graph TD
    subgraph UI_Layer [Presentation Layer]
        A[React Native 0.76+ / Fabric Renderer]
        B[Native Navigation: Expo Router v4]
        C[Gesture Handler & Reanimated 3]
        D[Native Bottom Sheet & Map Overlays]
    end

    subgraph State_Layer [State & Cache Layer]
        E[TanStack Query v5: Server State & Polling]
        F[Zustand: Client UI State & Active Navigation]
        G[WatermelonDB: Offline-First SQLite Engine]
    end

    subgraph Map_Layer [Geospatial & Map Engine]
        H[@maplibre/maplibre-react-native]
        I[Local MBTiles Vector Offline Cache]
        J[OSRM Route Polyline Decoder]
    end

    subgraph Hardware_Layer [Native Device Services]
        K[Expo Location: High-Accuracy GNSS Fix]
        L[Expo Haptics: Tactile Confirmation Engine]
        M[Expo SecureStore: Hardware Keychain / Keystore]
        N[Expo Notifications: Local Geofence Alerts]
    end

    subgraph Backend_Sync [Supabase & API Gateway]
        O[Supabase Auth & Session Management]
        P[PostgREST & PostGIS Spatial RPCs]
        Q[OSRM Dynamic Routing API /api/route]
    end

    UI_Layer --> State_Layer
    UI_Layer --> Map_Layer
    State_Layer --> Hardware_Layer
    State_Layer --> Backend_Sync
    Map_Layer --> Backend_Sync
```

---

## 2. Shared Code Strategy with Web Monorepo

To prevent duplication and guarantee 100% parity with the web platform's deterministic rules, the mobile app shares core business logic directly from the repository's `src/lib/` contracts:

```
hackathon/
├── src/lib/                       # SHARED CODE (100% Reused)
│   ├── evidence/verification-ladder.ts   # L1-L6 Tier logic
│   ├── reports/rules.ts                  # All 17 incident categories & icons
│   ├── reports/incident-cause.ts         # Consensus agreements
│   └── routing/engine.ts                 # Polyline & detour calculations
├── src/app/                       # Next.js Web Application
└── apps/mobile/                   # React Native (Expo) Project
    ├── app/                       # Expo Router file-based screens
    │   ├── (tabs)/                # Main bottom tabs: Map, Planner, Receipts
    │   ├── report/modal.tsx       # 1-Tap incident reporting modal
    │   └── authority/             # Municipal quick-audit screen
    ├── src/components/            # Native UI components
    └── src/services/              # SQLite database, GNSS, and sync engine
```

---

## 3. Data Pipelines & Offline Persistence (WatermelonDB + SQLite)

To ensure the mobile app continues functioning during dead-zones (e.g. basement parking, coastal valleys, heavy monsoon network cuts), we implement an **offline-first local database** powered by WatermelonDB backed by native SQLite.

### 3.1 Local SQLite Schema
```typescript
// apps/mobile/src/services/db/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const mobileSchema = appSchema({
  version: 1,
  tables: [
    // Cached live incidents from the server
    tableSchema({
      name: 'cached_incidents',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'level', type: 'string' },
        { name: 'level_reason', type: 'string' },
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
        { name: 'distinct_reporters', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // Outbox for queued reports submitted while offline
    tableSchema({
      name: 'pending_reports',
      columns: [
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
        { name: 'accuracy_m', type: 'number' },
        { name: 'captured_at', type: 'string' },
        { name: 'sync_status', type: 'string' }, // 'pending' | 'syncing' | 'failed'
      ],
    }),
    // Stored commuter delay receipts
    tableSchema({
      name: 'local_receipts',
      columns: [
        { name: 'journey_id', type: 'string', isIndexed: true },
        { name: 'origin_name', type: 'string' },
        { name: 'destination_name', type: 'string' },
        { name: 'excess_delay_seconds', type: 'number' },
        { name: 'verification_level', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
```

---

## 4. Hardware Location & GNSS Policy

### 4.1 Strict Precision Rules
To satisfy the server's PostGIS L2 requirement ($\le 50\text{m}$ distance, fresh timestamp), the mobile app queries high-accuracy hardware GNSS:

```typescript
// apps/mobile/src/services/location.ts
import * as Location from 'expo-location';

export async function captureIncidentLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
}> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('LOCATION_PERMISSION_DENIED');
  }

  // Request high-accuracy GPS fix with 10-second hardware timeout
  const fix = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High, // GNSS hardware receiver
    timeInterval: 1000,
    distanceInterval: 1,
  });

  return {
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    accuracy: fix.coords.accuracy ?? 999,
    timestamp: new Date(fix.timestamp).toISOString(),
  };
}
```

### 4.2 Zero Continuous Background Tracking Guarantee
- The app explicitly omits the `ACCESS_BACKGROUND_LOCATION` permission on Android and `NSLocationAlwaysAndWhenInUseUsageDescription` on iOS.
- Device GNSS hardware is powered on **only when**:
  1. The user taps "Report Incident" (single location snapshot).
  2. The user has active navigation route guidance open on screen (foreground navigation mode).
- The moment the app enters the background or guidance is stopped, the GNSS sensor is immediately released, preserving battery and preventing surveillance.

---

## 5. Security & Authentication Model

- **Session Tokens:** Authenticated session tokens are stored using `expo-secure-store`, backed by iOS Keychain (with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) and Android Keystore (AES-256 GCM hardware encryption).
- **Guest Commuters:** Anonymous commuters generate a cryptographic ephemeral UUID stored locally. No device MAC, IMEI, phone number, or Google Ad ID is ever read.
- **TLS Pinning:** Mobile network calls to the Supabase endpoint and OSRM router enforce TLS 1.3 with standard system CA trust stores.
