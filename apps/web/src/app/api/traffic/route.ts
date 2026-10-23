import { NextResponse } from "next/server";
import { readTrafficSnapshot } from "@/lib/traffic/server";

export async function GET() {
  const result = await readTrafficSnapshot();
  if (result.status !== "ready" || !result.snapshot.fixture) {
    return NextResponse.json({ ok: false, error: "Traffic severity is currently unavailable." }, { status: 503 });
  }

  const slowdowns = new Map(result.slowdown_assessments.map((item) => [item.segment_id, item]));
  const segments = result.snapshot.fixture.segments.map((segment) => {
    const slowdown = slowdowns.get(segment.id);
    const assessment = result.snapshot.report_assessments.find((item) => item.segment_id === segment.id);
    const severity = slowdown?.status === "supported"
      ? "slowdown"
      : assessment?.multiple_sources
        ? "corroborated"
        : (assessment?.recent_report_count ?? 0) > 0 ? "reported" : "clear";
    return { id: segment.id, name: segment.name, direction: segment.direction, geometry: segment.geometry, severity, provenance: "simulated" };
  });

  return NextResponse.json({ ok: true, read_at: result.snapshot.read_at, segments });
}
