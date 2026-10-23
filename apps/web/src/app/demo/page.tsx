import Link from "next/link";
import { SimulatedBanner } from "@/components/simulated-banner";

export default function GuestDemoPage() {
  return (
    <section className="hero">
      <SimulatedBanner />

      <div className="flex items-center gap-2 mb-2">
        <span className="simulated-pill">
          <span className="pulse-dot"></span>
          Public preview · No sign-in required
        </span>
      </div>
      <h1>Explore TrafficSense as a guest</h1>
      <p className="intro">
        Browse freely without an account. TrafficSense never requests background geolocation, runs tracking cookies, or accesses private data.
      </p>

      <div className="panel section-space">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
          <h2 className="text-lg font-bold text-on-surface m-0">Demonstration features</h2>
        </div>
        <p className="text-sm mt-2 text-on-surface-variant">
          Explore the Mangaluru test corridor with interactive map visualization, segment status chips, and route alert evaluations.
        </p>

        <div className="pt-4 mt-4 border-t border-surface-container-high">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-tertiary"></span>
            <h2 className="text-lg font-bold text-on-surface m-0">Privacy & Accounts</h2>
          </div>
          <p className="text-sm mt-2 text-on-surface-variant">
            Your guest report stays visible for 24 hours. Signing in is optional and only required for role-based features (Employer, Authority). See the full{" "}
            <Link href="/about#privacy-title" className="font-semibold text-primary underline">
              Privacy & Verification Policy
            </Link>{" "}
            for complete rules.
          </p>
        </div>
      </div>

      <div className="actions section-space">
        <Link className="button" href="/traffic">Browse synthetic traffic</Link>
        <Link className="button secondary" href="/reports/new">Submit a traffic report</Link>
        <Link className="button secondary" href="/about">System methodology</Link>
        <Link href="/">Return home</Link>
      </div>
    </section>
  );
}
