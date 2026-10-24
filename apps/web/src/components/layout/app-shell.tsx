"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const FULLSCREEN_ROUTES = new Set(["/traffic", "/planner"]);
const WIDE_ROUTES = new Set(["/authority"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_ROUTES.has(pathname);
  const isWide = WIDE_ROUTES.has(pathname);

  const mainClassName = isFullscreen
    ? "site-main site-main--fullscreen"
    : isWide
    ? "site-main site-main--wide"
    : "site-main";

  return (
    <>
      <main id="main" className={mainClassName} tabIndex={-1}>
        <Suspense fallback={<p role="status" className="panel">Loading…</p>}>
          {children}
        </Suspense>
      </main>
      {!isFullscreen && (
        <footer className="site-footer">
          <div>
            <strong>TrafficSense Mangaluru</strong> · REPORT → VERIFY → ALERT → ANALYSE
          </div>
          <div>Demo with simulated data. Not an official traffic service.</div>
        </footer>
      )}
    </>
  );
}
