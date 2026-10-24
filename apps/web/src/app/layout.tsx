import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrafficSense Mangaluru — Traffic project preview",
  description: "Explore a traffic project for Mangaluru: planned reporting, evidence, route alerts and analysis. Public preview with optional accounts; no live traffic or location collection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="header-inner">
            <div className="brand-group">
              <Link className="brand" href="/">
                <span>TrafficSense</span>
                <span className="brand-badge">Mangaluru</span>
              </Link>
              {process.env.NODE_ENV !== "production" && <span className="simulated-pill header-preview-label">Development preview</span>}
            </div>
            <nav aria-label="Main navigation">
              <Link href="/">Home</Link>
              <Link href="/traffic">Traffic</Link>
              <Link href="/planner">Planner</Link>
              <Link href="/report">Report</Link>
              <Link href="/demo">Guest preview</Link>
              <Link href="/workspace" prefetch={false}>My account</Link>
            </nav>
          </div>
        </header>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
