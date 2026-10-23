import Link from "next/link";
import { CorridorPreview } from "@/components/corridor-preview";
import { FeatureIcon } from "@/components/feature-icon";

export default function Home() {
  return (
    <div className="landing">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div>
          <p className="eyebrow">TrafficSense · Mangaluru</p>
          <h1 id="hero-title">Report road problems and plan around them.</h1>
          <p className="intro">Share a traffic problem, see current community reports, and choose a route with clear information.</p>
          <div className="actions">
            <Link className="button" href="/report">
              Report a problem <span aria-hidden="true">→</span>
            </Link>
            <Link className="button secondary" href="/planner">
              Plan my route
            </Link>
          </div>
          <p className="hero-note">Location is requested only when you choose to report or use your location.</p>
        </div>
        <CorridorPreview />
      </section>

      <section className="landing-section" aria-labelledby="features-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Report → Verify → Alert → Analyse</p>
            <h2 id="features-title">Verifiable traffic intelligence with defined limits</h2>
          </div>
          <p>Explore the corridor map and live-derived status chips without signing in.</p>
        </div>
        <div className="cards-grid">
          <article className="value-card" data-feature="evidence">
            <div className="card-icon teal"><FeatureIcon name="evidence" /></div>
            <h3>1. Multi-source evidence</h3>
            <p>Verification ladder (L1–L5) qualifies reports against synchronized telemetry and AI vision before claiming congestion.</p>
            <div className="feature-detail">
              <p className="detail-label">Verification tiers</p>
              <ul className="evidence-list">
                <li><code>L1</code> Reported</li>
                <li><code>L2</code> Location support</li>
                <li><code>L3</code> Multiple sources</li>
                <li><code>L4</code> Slowdown support</li>
                <li><code>L5</code> AI Vision corroboration</li>
              </ul>
            </div>
          </article>

          <article className="value-card" data-feature="alerts">
            <div className="card-icon violet"><FeatureIcon name="route" /></div>
            <h3>2. Route intelligence</h3>
            <p>Evaluates primary vs alternative routes, alerting drivers only when verified savings exceed 5 minutes.</p>
            <div className="feature-detail">
              <p className="detail-label">Alternative comparison</p>
              <dl className="preview-facts">
                <div><dt>Bypass saving</dt><dd>≥ 300 seconds</dd></div>
                <div><dt>Primary check</dt><dd>Supported slowdown</dd></div>
                <div><dt>Bypass check</dt><dd>Clear & safe</dd></div>
              </dl>
            </div>
          </article>

          <article className="value-card" data-feature="analytics">
            <div className="card-icon amber"><FeatureIcon name="analysis" /></div>
            <h3>3. Recurring hotspots</h3>
            <p>Aggregates historical incident clusters and peak congestion hours to guide civic planning.</p>
            <div className="feature-detail">
              <p className="detail-label">Civic analytics</p>
              <ul className="analysis-list">
                <li>Hotspot rankings</li>
                <li>Recurring delay patterns</li>
                <li>Categorised causes</li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="roles-title">
        <div className="section-heading">
          <div><p className="eyebrow">Access options</p><h2 id="roles-title">Choose how to explore</h2></div>
          <p>Public browsing requires no credentials. Specialized views require assigned roles.</p>
        </div>
        <div className="cards-grid role-cards">
          <article className="value-card" data-role="commuter">
            <div className="card-icon violet"><FeatureIcon name="commuter" /></div>
            <h3>For commuters</h3>
            <p>Browse corridor status, test alternative routes, and submit verified incident reports with AI vision (L1–L5).</p>
            <Link className="button" href="/demo">Explore the guest preview <span aria-hidden="true">→</span></Link>
          </article>
          <article className="value-card" data-role="employer">
            <div className="card-icon violet"><FeatureIcon name="employer" /></div>
            <h3>For employers</h3>
            <p>View aggregate commute health across assigned organisations with commuter consent.</p>
            <Link className="button" href="/employer" prefetch={false}>Open employer access <span aria-hidden="true">→</span></Link>
          </article>
          <article className="value-card" data-role="authority">
            <div className="card-icon violet"><FeatureIcon name="evidence" /></div>
            <h3>For authorities</h3>
            <p>Review corridor baseline metrics and incident episode history.</p>
            <Link className="button" href="/authority" prefetch={false}>Open authority access <span aria-hidden="true">→</span></Link>
          </article>
        </div>
      </section>

      <aside className="extension-note" aria-labelledby="extension-title">
        <div>
          <h2 id="extension-title">Delay receipts — planned extension</h2>
          <p>Summarise verified delays for proof of commute disruption without continuous GPS tracking.</p>
        </div>
        <Link className="button secondary" href="/register">Create an account</Link>
      </aside>
    </div>
  );
}
