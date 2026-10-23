# Mobile Core Features & User Journey Specifications

This document defines the functional specifications, interaction budgets, error states, and UX workflows for the five primary mobile application modules.

---

## 1. Feature 1: Rapid 1-Tap Incident Reporting

### 1.1 The 3-Second Driver Safety Budget
Submitting a road hazard report must never distract a driver. The mobile workflow is engineered to complete within **3 seconds with exactly 2 taps**:

```
[Tap 1: Floating "Report" Fab] 
       │
       ▼
[Modal pops up + Hardware GNSS fix acquired in background]
       │
       ▼
[Tap 2: Category Tile (e.g. "💥 Accident")]
       │
       ▼
[Immediate Haptic Confirmation + Audio Chime + Modal Auto-Dismisses]
```

### 1.2 Under the Hood: Verification Enforcement
1. When the user taps the floating report button, the app requests a high-precision GNSS hardware position.
2. If `accuracy <= 50` meters and fix age $< 120$ seconds:
   - Sets `location_supported = true`
   - Server elevates the cluster to **L2 (Location Support)**.
3. If accuracy is $> 50$ meters (e.g. indoor or cell-tower triangulation):
   - Gracefully accepts the report at **L1 (Reported)** without blocking the user.
4. If network is unavailable:
   - Queues the payload into local SQLite `pending_reports` table.
   - Retries sync automatically once network connectivity resumes via `@react-native-community/netinfo`.

---

## 2. Feature 2: Dynamic Routing & Automatic Hazard Detours

### 2.1 Route Evaluation Workflow
1. Commuter picks origin and destination (preset list of Mangaluru landmarks or current GPS position).
2. App queries the backend `/api/route` endpoint, returning the shortest primary path and valid alternative detours computed via Project OSRM.
3. App queries active verified incidents via `/api/incidents`.
4. If an active L3+ incident intersects the primary route within 300 meters:
   - Plays a distinctive warning haptic (`Notification: Warning`).
   - Displays a prominent amber alert banner: `⚠️ Avoidance Detour Active: 💥 Accident at Bunts Hostel (+8 min delay on primary)`.
   - Automatically promotes the clean bypass alternative as the recommended path.
   - Highlights the avoidance path in bright blue (`#2563eb`) with a green leaf icon.

### 2.2 In-Drive Guidance UI
- **Turn Card Overlay:** Top-anchored floating card showing next maneuver (e.g., `↰ In 300m, turn left onto Bejai Main Road`).
- **Speed & Delay Indicator:** Bottom corner badge comparing current free-flow baseline vs physical traversal time.
- **Center on Me Button:** Snaps camera back to active commuter coordinates with a smooth spring animation.

---

## 3. Feature 3: Delay Receipts & Employer QR Pass

### 3.1 Delay Verification Lifecycle
Commuters whose travel was delayed by verified gridlock can generate an official civic delay pass:

```
[Start Journey] ➔ [Traverse Corridor] ➔ [End Journey]
                                              │
                                              ▼
                                 [Compute Verified Delay]
                                              │
                                              ▼
                             [Generate Cryptographic QR Receipt]
```

### 3.2 Receipt Fields & Privacy Guarantees
- **Displayed to Commuter:**
  - Date & Time window (e.g., `18 Oct 2026, 08:45 – 09:22 IST`)
  - Corridor Name (e.g., `Hampankatta to Lalbagh Arterial`)
  - Excess Traversal Delay (e.g., `+18 min above free-flow baseline`)
  - Evidence Tier Attained (`L3 · Corroborated by 4 commuters`)
  - Cryptographic Verification Token & QR Code
- **Privacy Enforcement:**
  - **Zero personal GPS coordinates** are stored or encoded in the QR code.
  - The QR payload contains only `{ journey_id, delay_minutes, corridor, token, hash }`.
  - The employer scans the QR code to verify validity against the Supabase backend without accessing the employee's residential or intermediate location trails.

---

## 4. Feature 4: Municipal Authority On-Site Quick Verify

### 4.1 Field Officer Mode
Authorized traffic controllers logging into the mobile app access a specialized **Field Verification Dashboard**:
1. **Proximity Sorter:** Lists citizen incident clusters sorted by direct distance from the officer's current GPS location.
2. **1-Tap Confirm (L6 Promotion):**
   - Officer taps `"Confirm & Dispatch"` on an active cluster.
   - App logs the officer's authenticated credentials and timestamp directly to `public.incident_audit_log`.
   - Incident is immediately upgraded to `L6 · Officially Confirmed`.
3. **1-Tap Clear (Incident Resolution):**
   - When the obstruction is towed or resolved, officer taps `"Mark Cleared"`.
   - Cleared status propagates in real time to all commuters via Supabase Realtime websockets, immediately restoring the primary route.

---

## 5. Feature 5: Offline Vector Basemap & Low-Data Mode

### 5.1 Mangaluru Offline Tile Package (MBTiles)
- During initial onboarding or over Wi-Fi, the app downloads a lightweight **18 MB vector tile package** covering the Mangaluru metropolitan area (Zoom levels 11–15).
- Stored in the app's persistent documents directory (`FileSystem.documentDirectory`).
- Even if mobile data drops to zero in coastal tunnels or monsoon downpours, `@maplibre/maplibre-react-native` reads tiles locally with **instant 60 FPS performance**.

### 5.2 Low-Data Bandwidth Optimization
- Incident queries transmit minimal GeoJSON delta payloads ($< 3\text{ KB}$ per poll).
- Polling throttles automatically from 10 seconds down to 60 seconds when the device is battery-constrained or on metered cellular networks.
