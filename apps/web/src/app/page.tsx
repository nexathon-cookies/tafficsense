import Link from "next/link";
import { CorridorPreview } from "@/components/corridor-preview";

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
    </div>
  );
}
