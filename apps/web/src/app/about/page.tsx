import type { Metadata } from "next";
import Link from "next/link";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "Data Provenance, Methodology & Proof · TrafficSense Mangaluru",
  description:
    "Complete transparency on data provenance: what is 100% real, what is estimated, and what is simulated demo data, with verifiable source proofs.",
};

export default function AboutPage() {
  return (
    <div className={styles.aboutContainer}>
      <header className={styles.header}>
        <div className="flex items-center gap-2 mb-2">
          <span className="simulated-pill">SYSTEM PROVENANCE & METHODOLOGY</span>
          <span className="text-xs text-on-surface-variant font-medium">Radical Transparency & Proof</span>
        </div>
        <h1 className={styles.title}>TrafficSense Data Sources, Provenance & System Rules</h1>
        <p className={styles.lead}>
          TrafficSense replaces ambiguous crowdsourcing and invasive corporate tracking with an explainable,
          evidence-based framework. Per our strict honesty rules, this page details exactly what data is real,
          what is mathematically estimated, what is simulated for demonstration, and where each data source comes from for proof.
        </p>
        <div className="actions mt-3">
          <Link className="button" href="/planner">
            Try Live Route Planner →
          </Link>
          <Link className="button secondary" href="/traffic">
            Open Traffic Explorer
          </Link>
          <Link className="button secondary" href="/authority">
            Authority Dashboard
          </Link>
        </div>
      </header>

      {/* SECTION 1: PROVENANCE & PROOF */}
      <section className={styles.section} aria-labelledby="provenance-title">
        <h2 id="provenance-title" className={styles.sectionTitle}>
          1. Data Provenance: Real Data vs. Demo Simulation
        </h2>
        <p className={styles.text}>
          To uphold our fundamental tenet of <strong>Explainable Truth Over Blind Prediction</strong>, we explicitly
          disclose the origin and nature of every data layer used in TrafficSense:
        </p>

        <div className={styles.provenanceOverviewGrid}>
          <div className={styles.provenanceOverviewCard}>
            <h3>
              Real Infrastructure & Live Data
              <span className={styles.badgeReal}>● 100% Real</span>
            </h3>
            <p>
              Actual geospatial roads, real turn-by-turn routing calculations, real citizen incident reports, and real
              server-enforced PostgreSQL verification rules.
            </p>
            <ul>
              <li><strong>Road network & coordinates:</strong> Real OpenStreetMap geometries for Mangaluru.</li>
              <li><strong>Routing calculation:</strong> Real shortest-path graph traversal via Project OSRM.</li>
              <li><strong>Live user reports:</strong> Real database records with browser GPS coordinates.</li>
              <li><strong>PostGIS verification:</strong> Real geospatial distance queries (L1 → L2 → L3).</li>
              <li><strong>Authority audit logs:</strong> Real authenticated state transitions in PostgreSQL.</li>
            </ul>
          </div>

          <div className={styles.provenanceOverviewCard}>
            <h3>
              Free-Flow Physics Estimates
              <span className={styles.badgeEstimated}>~ Estimated</span>
            </h3>
            <p>
              Durations on unobstructed roads are derived mathematically from legal road-class speed baselines rather
              than pervasive personal tracking.
            </p>
            <ul>
              <li><strong>Free-flow travel time:</strong> Baseline duration assuming speed limits for road class.</li>
              <li><strong>Honesty boundary:</strong> We do not track continuous personal probes on every side street.</li>
              <li><strong>Excess delay:</strong> Calculated as actual physical trip time minus the free-flow baseline.</li>
            </ul>
          </div>

          <div className={styles.provenanceOverviewCard}>
            <h3>
              Simulated Demonstration Data
              <span className={styles.badgeSimulated}>✦ Synthetic Demo</span>
            </h3>
            <p>
              Pre-computed synthetic fixtures used exclusively to demonstrate multi-month municipal trends and algorithmic
              slowdown detection without waiting months.
            </p>
            <ul>
              <li><strong>4-month hotspot trends:</strong> July–Oct 2026 fixture on Authority page (isolated by toggle).</li>
              <li><strong>Multi-source speed drops:</strong> 60-second cohort simulator on Explorer page for L4 testing.</li>
              <li><strong>Visual isolation:</strong> Every simulated artifact is clearly labelled <code>SIMULATED</code>.</li>
            </ul>
          </div>
        </div>

        <h3 className="text-base font-bold text-on-surface mt-4 mb-2">
          Authoritative Data Source & Verification Matrix
        </h3>

        <div className={styles.tableWrapper}>
          <table className={styles.provenanceTable}>
            <thead>
              <tr>
                <th>Subsystem / Layer</th>
                <th>Status & Provenance</th>
                <th>Authoritative Source & License</th>
                <th>Verifiable Proof / Inspection Method</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Road Network & Places</strong></td>
                <td><span className={styles.badgeReal}>● Real Public Data</span></td>
                <td>
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    OpenStreetMap Contributors ↗
                  </a>
                  <br />
                  <span className="text-xs text-on-surface-variant">Open Database License (ODbL)</span>
                </td>
                <td>
                  Real Mangaluru arterial corridors (Hampankatta, Lalbagh, Kadri, Bunts Hostel, Kankanady). Nodes,
                  ways, and geometries directly match OSM geographic features.
                </td>
              </tr>
              <tr>
                <td><strong>Vector Tiles & Basemap</strong></td>
                <td><span className={styles.badgeReal}>● Real Vector Tiles</span></td>
                <td>
                  <a
                    href="https://openfreemap.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    OpenFreeMap ↗
                  </a>
                  <br />
                  <span className="text-xs text-on-surface-variant">Hosted vector tile service + MapLibre GL</span>
                </td>
                <td>
                  Vector tiles streamed over HTTPS from <code>tiles.openfreemap.org</code>. Includes bundled offline
                  schematic backup in <code>src/lib/traffic/mangaluru-basemap.ts</code>. Zero tracking or API keys.
                </td>
              </tr>
              <tr>
                <td><strong>Turn-by-Turn Driving Engine</strong></td>
                <td><span className={styles.badgeReal}>● Real Engine (Free-Flow Est)</span></td>
                <td>
                  <a
                    href="https://project-osrm.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    Project OSRM ↗
                  </a>
                  <br />
                  <span className="text-xs text-on-surface-variant">Open Source Routing Machine (BSD 2-Clause)</span>
                </td>
                <td>
                  The <code>/api/route</code> endpoint forwards real coordinates to OSRM driving servers, computing
                  physical driving distance, polyline geometry, and free-flow duration. Inspectable in browser DevTools.
                </td>
              </tr>
              <tr>
                <td><strong>Live Incident Reporting & GPS</strong></td>
                <td><span className={styles.badgeReal}>● Real User Data</span></td>
                <td>
                  <a
                    href="https://postgis.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    W3C Geolocation API & PostGIS ↗
                  </a>
                  <br />
                  <span className="text-xs text-on-surface-variant">HTML5 Navigator + PostGIS Extension</span>
                </td>
                <td>
                  Real device coordinates captured on report submission. Stored in <code>public.incident_reports</code> and
                  geofenced against road segments using PostGIS <code>meter_distance</code> (&le; 50m check).
                </td>
              </tr>
              <tr>
                <td><strong>Multi-Source Corroboration</strong></td>
                <td><span className={styles.badgeReal}>● Real Server Logic</span></td>
                <td>
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    PostgreSQL 17 / Supabase ↗
                  </a>
                  <br />
                  <span className="text-xs text-on-surface-variant">Deterministic SQL triggers & functions</span>
                </td>
                <td>
                  The database function <code>evaluate_incident_verification_level()</code> automatically enforces L1 (submitted)
                  &rarr; L2 (device GPS &le; 50m) &rarr; L3 (&ge; 3 distinct reporters in 15 mins).
                </td>
              </tr>
              <tr>
                <td><strong>Authority Verification & Audit</strong></td>
                <td><span className={styles.badgeReal}>● Real Database Logs</span></td>
                <td>
                  PostgreSQL Row-Level Security
                  <br />
                  <span className="text-xs text-on-surface-variant">Immutable change triggers & audit log table</span>
                </td>
                <td>
                  Verifications executed via <code>verify_incident_by_authority()</code> store immutable timestamped records in
                  <code>public.incident_audit_log</code> with controller IDs and reason codes.
                </td>
              </tr>
              <tr>
                <td><strong>4-Month Historical Trends</strong></td>
                <td><span className={styles.badgeSimulated}>✦ Simulated Demo Baseline</span></td>
                <td>
                  Synthetic Fixture
                  <br />
                  <span className="text-xs text-on-surface-variant">Deterministic seed in src/lib/analytics/history.ts</span>
                </td>
                <td>
                  Allows testing municipal hotspot charts and recurrence indexes without waiting months. On <code>/authority</code>,
                  an explicit toggle allows users to view 100% clean live rows or include the 4-month simulated demo history.
                </td>
              </tr>
              <tr>
                <td><strong>Multi-Source Speed Drops</strong></td>
                <td><span className={styles.badgeSimulated}>✦ Simulated Demo Cohort</span></td>
                <td>
                  Deterministic Speed Model
                  <br />
                  <span className="text-xs text-on-surface-variant">src/lib/traffic/simulator.ts</span>
                </td>
                <td>
                  Demonstrates L4 slowdown detection on <code>/traffic</code> by generating 6 consecutive 60-second synchronized
                  observations without requiring physical road blockades during evaluation.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.verificationGuideBox}>
          <h3>
            <span>🔍</span> How You Can Verify the Proof Yourself
          </h3>
          <ol className={styles.verificationStepsList}>
            <li>
              <strong>Inspect Live Route Calculation:</strong> Open the <Link href="/planner" className={styles.sourceLink}>Route Planner</Link>,
              select any two Mangaluru locations (e.g. Hampankatta to Kadri Park), and inspect the network request to <code>/api/route</code> in
              your browser DevTools. You will see the real polyline geometry and distances calculated directly by OSRM over OpenStreetMap.
            </li>
            <li>
              <strong>Submit a Live Verified Incident:</strong> Click &ldquo;Report an Incident&rdquo; in the Route Planner. Your browser will prompt
              for device geolocation. Submit the report and watch it appear in the database with a real timestamp, GPS accuracy check (&le; 50m),
              and verification badge.
            </li>
            <li>
              <strong>Inspect Authority Audit Records:</strong> Visit the <Link href="/authority" className={styles.sourceLink}>Authority Dashboard</Link>.
              Toggle the switch &ldquo;Include 4-month simulated demo history&rdquo; to OFF. The dashboard immediately purges simulated records
              and displays exclusively real incident rows created during your session.
            </li>
            <li>
              <strong>Audit the Open Source SQL Functions:</strong> Inspect the repository migration files in <code>supabase/migrations/</code>.
              Every verification rule, spatial query, and RLS security boundary is written in standard, auditable PostGIS SQL.
            </li>
          </ol>
        </div>
      </section>

      {/* SECTION 2: VERIFICATION LADDER */}
      <section className={styles.section} aria-labelledby="ladder-title">
        <h2 id="ladder-title" className={styles.sectionTitle}>
          2. Evidence levels: 1 person reported, 3+ people confirmed, or official action
        </h2>
        <p className={styles.text}>
          Crowdsourced incident reports alone cannot prove road obstruction. TrafficSense structures evidence across six
          rigorous tiers:
        </p>
        <div className={styles.ladderGrid}>
          <div className={styles.ladderCard}>
            <div className={styles.ladderHeader}>
              <span className={styles.ladderBadgeActive}>L1</span>
              <h3>Reported</h3>
            </div>
            <p>
              An unconfirmed user report specifying a category and directed segment. Location is manually chosen by the
              reporter. Does not verify obstruction or cause.
            </p>
            <span className={styles.statusIndicatorActive}>● Active in demonstration</span>
          </div>

          <div className={styles.ladderCard}>
            <div className={styles.ladderHeader}>
              <span className={styles.ladderBadgeActive}>L2</span>
              <h3>Location Support</h3>
            </div>
            <p>
              Server verification that the reporter&apos;s physical GPS coordinates match the incident location within &le; 50 meters
              and fresh device timestamp (&lt; 2 min).
            </p>
            <span className={styles.statusIndicatorActive}>● Active via PostGIS</span>
          </div>

          <div className={styles.ladderCard}>
            <div className={styles.ladderHeader}>
              <span className={styles.ladderBadgeActive}>L3</span>
              <h3>Multiple Sources</h3>
            </div>
            <p>
              Requires at least three distinct reporting sources within a rolling 15-minute window on the same directed segment.
              Eliminates duplicate or repeat reports from the same device.
            </p>
            <span className={styles.statusIndicatorActive}>● Active in demonstration</span>
          </div>

          <div className={styles.ladderCard}>
            <div className={styles.ladderHeader}>
              <span className={styles.ladderBadgeActive}>L4</span>
              <h3>Slowdown Evidence</h3>
            </div>
            <p>
              Synchronized multi-source speed drop. Requires &ge; 3 independent sources across 6 consecutive 1-minute intervals (5
              full minutes) with speed &lt; 40% of baseline.
            </p>
            <span className={styles.statusIndicatorActive}>● Active in demonstration</span>
          </div>

          <div className={styles.ladderCard}>
            <div className={styles.ladderHeader}>
              <span className={styles.ladderBadgePending}>L5</span>
              <h3>Media Verification</h3>
            </div>
            <p>
              Cryptographically signed, metadata-scrubbed photo/video evidence submitted with consensual spatial/temporal bounds.
            </p>
            <span className={styles.statusIndicatorPending}>○ Planned extension</span>
          </div>

          <div className={styles.ladderCard}>
            <div className={styles.ladderHeader}>
              <span className={styles.ladderBadgeActive}>L6</span>
              <h3>Authority Action</h3>
            </div>
            <p>
              Official verification, on-site civic response, or dispatch logged by certified municipal traffic controllers with
              immutable audit logging.
            </p>
            <span className={styles.statusIndicatorActive}>● Active in demonstration</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: SPEED EVIDENCE */}
      <section className={styles.section} aria-labelledby="speed-title">
        <h2 id="speed-title" className={styles.sectionTitle}>
          3. Speed Evidence & Observation Windows
        </h2>
        <ul className={styles.bulletList}>
          <li>
            <strong>Synchronized Cadence:</strong> Speed evaluations require observations at exact 60-second intervals across 5
            complete minutes (6 sample points). Missing samples or off-cadence ticks disqualify a source cohort.
          </li>
          <li>
            <strong>Strict Speed Threshold:</strong> Every speed sample in the qualifying window must fall strictly below 40% of
            the unrounded assumed segment baseline.
          </li>
          <li>
            <strong>Freshness Boundary:</strong> Samples are valid for 20 minutes from observation. Future-dated samples are
            rejected, and expired samples automatically lose evidence support.
          </li>
          <li>
            <strong>Independent Devices:</strong> Synthetic speed sources model independent telemetry streams bound to segment
            geometry, distinct from human user accounts.
          </li>
        </ul>
      </section>

      {/* SECTION 4: INCIDENT LIFECYCLE */}
      <section className={styles.section} aria-labelledby="lifecycle-title">
        <h2 id="lifecycle-title" className={styles.sectionTitle}>
          4. Incident Lifecycle & Clearance Protocol
        </h2>
        <ul className={styles.bulletList}>
          <li>
            <strong>Automatic Lifecycle Inception:</strong> Persisted incidents originate when L4 slowdown evidence is sustained
            across the corridor, even in the absence of manual citizen reports.
          </li>
          <li>
            <strong>Verified Clearance:</strong> Recovery requires the same &ge; 3 sources across adjacent 5-minute slowdown and
            recovery windows, with speeds strictly above 70% of the baseline and no conflicting slowdown cohort.
          </li>
          <li>
            <strong>Reopenings:</strong> If slowdown recurs on the same segment after clearance, a new unique incident identifier is
            created referencing the prior incident lineage.
          </li>
          <li>
            <strong>No Silent Resets:</strong> Simulator resets, lack of fresh observations, or high speed without cohort continuity
            do not record clearance; status changes to unconfirmed or stale.
          </li>
        </ul>
      </section>

      {/* SECTION 5: ROUTE INTELLIGENCE */}
      <section className={styles.section} aria-labelledby="routing-title">
        <h2 id="routing-title" className={styles.sectionTitle}>
          5. Route Intelligence & Alternative Route Alerts
        </h2>
        <ul className={styles.bulletList}>
          <li>
            <strong>Fixed Route Pairs:</strong> The system evaluates verified primary corridors against fixed alternative bypass
            routes with predefined baseline travel durations.
          </li>
          <li>
            <strong>300-Second (5-Minute) Advantage Threshold:</strong> An active route alert requires the completed primary duration
            to exceed the alternative by at least 300 seconds (5 minutes).
          </li>
          <li>
            <strong>Mandatory Abstention Rules:</strong> Route alerts abstain (refuse to recommend an alternative) if:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>No current supported incident or slowdown exists on the primary route.</li>
              <li>The time advantage is under 300 seconds.</li>
              <li>A supported slowdown or recent reported hazard exists on the alternative bypass route.</li>
            </ul>
          </li>
          <li>
            <strong>Independent Segment Sums:</strong> Travel durations compare completed segment traversals from retained simulation
            runs; they are not continuous personal journey measurements.
          </li>
        </ul>
      </section>

      {/* SECTION 6: EPISODES & RATE LIMITS */}
      <section className={styles.section} aria-labelledby="episodes-title">
        <h2 id="episodes-title" className={styles.sectionTitle}>
          6. Report Grouping, Episodes & Rate Limits
        </h2>
        <ul className={styles.bulletList}>
          <li>
            <strong>Episode Clustering:</strong> Reports group chronologically by segment and direction. A gap of 20 minutes
            without reports seals the episode and begins a new successor episode.
          </li>
          <li>
            <strong>Anti-Spoofing Rate Limits:</strong> Each source is capped at 5 reports per 15 minutes. The global demo ceiling
            is 300 reports per hour, with 2,000 maximum retained reports.
          </li>
          <li>
            <strong>Idempotency:</strong> Re-submitting an identical report reference replays the stored outcome without inflating
            incident counts.
          </li>
        </ul>
      </section>

      {/* SECTION 7: PRIVACY & DATA ETHICS */}
      <section className={styles.section} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={styles.sectionTitle}>
          7. Privacy, Anonymity & Data Ethics
        </h2>
        <ul className={styles.bulletList}>
          <li>
            <strong>Zero Device Tracking:</strong> TrafficSense never requests background geolocation, battery states, device IDs, or
            continuous movement trails.
          </li>
          <li>
            <strong>Ephemeral Guest Reporting:</strong> Guest sessions use temporary, non-identifying tokens stored in local browser
            cookies that expire after 24 hours.
          </li>
          <li>
            <strong>Consensual Employer Sharing:</strong> Commuter travel summaries are accessible to employers only with explicit,
            granular, revocable employee authorization.
          </li>
          <li>
            <strong>Truth in Labelling:</strong> All test corridor information is strictly designated <code>SIMULATED</code>. No
            fabricated confidence percentages or pseudo-probabilistic guarantees are shown.
          </li>
        </ul>
      </section>

      <footer className={styles.footer}>
        <p>TrafficSense Mangaluru · Prototype for verifiable civic traffic intelligence</p>
        <div className="actions mt-2">
          <Link href="/planner">Route Planner</Link>
          <Link href="/traffic">Traffic Explorer</Link>
          <Link href="/authority">Authority Dashboard</Link>
          <Link href="/demo">Guest Demo Overview</Link>
          <Link href="/">Home</Link>
        </div>
      </footer>
    </div>
  );
}
