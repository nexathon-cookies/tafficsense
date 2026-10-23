"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceAssessmentTiming, assessmentRemainingMs, type AssessmentOrigin } from "@/lib/evidence/assessment";
import type { TrafficSnapshot } from "@/lib/traffic/snapshot";

type Clock = { snapshot: TrafficSnapshot; elapsedMs: number | null };
export function useAssessmentClock(snapshot: TrafficSnapshot, slowdownAssessments: readonly { valid_until: string | null }[]) {
  const pendingOrigin = useRef<AssessmentOrigin | null>(null);
  const [clock, setClock] = useState<Clock | null>(null);
  const refreshStarted = useCallback(() => {
    pendingOrigin.current = { monotonic: performance.now(), wall: Date.now() };
  }, []);
  useEffect(() => {
    // Navigation origin includes server loading and hydration; a client navigation may expire early.
    const origin = pendingOrigin.current ?? { monotonic: 0, wall: performance.timeOrigin };
    pendingOrigin.current = null;
    let timing = { elapsedMs: 0, failed: false };
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      clearTimeout(timer);
      timing = advanceAssessmentTiming(timing, origin, { monotonic: performance.now(), wall: Date.now() });
      setClock({ snapshot, elapsedMs: timing.failed ? null : timing.elapsedMs });
      const remaining = [...snapshot.report_assessments, ...slowdownAssessments].flatMap(row => row.valid_until === null ? []
        : [assessmentRemainingMs(row.valid_until, snapshot.read_at, timing.elapsedMs)])
        .filter(value => value > 0);
      timer = setTimeout(update, Math.min(1000, ...remaining));
    }
    timer = setTimeout(update, 0);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [snapshot, slowdownAssessments]);
  return { elapsedMs: clock?.snapshot === snapshot ? clock.elapsedMs : null, refreshStarted };
}
