import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerHooks } from "node:module";
import { createTrafficFixture, DEFAULT_DEMO_ANCHOR } from "../apps/web/src/lib/traffic/simulator.ts";

const state = { events: [], response: { data: null, error: null, status: 200 } };
globalThis.__trafficReaderTest = state;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/src/lib/traffic/")) {
      const mocks = {
        "server-only": "export {};",
        "next/server": "export async function connection() { globalThis.__trafficReaderTest.events.push('connection'); }",
        "@supabase/supabase-js": `export function createClient(url, key, options) {
          const state = globalThis.__trafficReaderTest;
          state.events.push('sdk'); state.options = options; state.url = url; state.key = key;
          if (state.constructError) throw new Error('private provider diagnostic');
          return { rpc: async (name) => {
            state.rpc = name;
            if (state.fetch) await options.global.fetch(url, state.init);
            if (state.requestError) throw new Error('private provider diagnostic');
            return state.response;
          } };
        }`,
      };
      if (specifier in mocks) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
      if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
after(() => { hooks.deregister(); delete globalThis.__trafficReaderTest; });
const { parseTrafficSnapshot, sampleFreshness } = await import("../apps/web/src/lib/traffic/snapshot.ts");
const { readTrafficSnapshot } = await import("../apps/web/src/lib/traffic/server.ts");
const snapshot = () => {
  const fixture = createTrafficFixture("slowdown", DEFAULT_DEMO_ANCHOR);
  return { read_at: DEFAULT_DEMO_ANCHOR, fixture, reports: [], incident_episodes: [], reporting_enabled: false,
    report_assessments: fixture.segments.map(segment => ({ segment_id: segment.id, direction: segment.direction,
      report_count: 0, recent_report_count: 0, eligible_report_count: 0, eligible_source_count: 0,
      multiple_sources: false, valid_until: null, provenance: "simulated" })) };
};

const episodeId = "66ee2d39-c477-42ad-a6b8-086781da03de";
const nextEpisodeId = "7a3d81a4-d701-4ae6-86e9-06f90d548e7a";
const publicReport = (index, overrides = {}) => ({
  id: `a0866416-8ea3-4f6a-81f9-${String(index).padStart(12, "0")}`, episode_id: episodeId,
  segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: DEFAULT_DEMO_ANCHOR,
  received_at: DEFAULT_DEMO_ANCHOR, provenance: "simulated", location_provenance: "manual", ...overrides,
});
const episodeSummary = (report, overrides = {}) => ({
  id: report.episode_id, segment_id: report.segment_id, direction: report.direction, created_at: report.received_at,
  first_observed_at: report.observed_at, last_observed_at: report.observed_at, report_count: 1, provenance: "simulated", ...overrides,
});
function episodeSnapshot() {
  const input = snapshot();
  input.reports = [publicReport(1, { observed_at: "2026-10-15T03:59:00.123001Z" }),
    publicReport(2, { observed_at: "2026-10-15T03:59:00.123999Z", category: "accident" })];
  input.incident_episodes = [episodeSummary(input.reports[0], { report_count: 2, last_observed_at: input.reports[1].observed_at })];
  Object.assign(input.report_assessments[0], { report_count: 2, recent_report_count: 2, eligible_report_count: 2,
    eligible_source_count: 2, valid_until: "2026-10-15T04:14:00.123Z" });
  return input;
}

test("snapshot parser preserves the fixture contract and canonicalizes PostgreSQL timestamps", () => {
  const input = snapshot();
  input.read_at = "2026-10-15T09:30:00.123456+05:30";
  input.fixture.corridor.anchor_at = "2026-10-15 04:00:00+00";
  input.fixture.observations[0].observed_at = "2026-10-15T03:49:00+00:00";
  const expected = snapshot();
  expected.read_at = "2026-10-15T04:00:00.123456Z";
  assert.deepEqual(parseTrafficSnapshot(input), expected);
  assert.notEqual(parseTrafficSnapshot(input).fixture, input.fixture);
  assert.equal(input.fixture.corridor.anchor_at, "2026-10-15 04:00:00+00");
  assert.deepEqual(parseTrafficSnapshot({ read_at: DEFAULT_DEMO_ANCHOR, fixture: null, reports: [], incident_episodes: [], reporting_enabled: false, report_assessments: [] }), { read_at: DEFAULT_DEMO_ANCHOR, fixture: null, reports: [], incident_episodes: [], reporting_enabled: false, report_assessments: [] });
});

test("snapshot preserves microseconds needed for exact slowdown cadence and future boundaries", () => {
  const input = snapshot();
  input.fixture.observations[0].observed_at = "2026-10-15T03:49:00.000001Z";
  assert.equal(parseTrafficSnapshot(input).fixture.observations[0].observed_at, input.fixture.observations[0].observed_at);
  assert.equal(sampleFreshness("2026-10-15T04:00:00.000001Z", DEFAULT_DEMO_ANCHOR), "future");
  input.fixture.observations[0].observed_at = "2026-10-15T03:48:59.999999Z";
  assert.throws(() => parseTrafficSnapshot(input));
});

test("public reports share the snapshot but never expose source identity or unsupported segments", () => {
  const input = snapshot();
  const report = { id: "a0866416-8ea3-4f6a-81f9-6f855cd73947", episode_id: "66ee2d39-c477-42ad-a6b8-086781da03de", segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: DEFAULT_DEMO_ANCHOR, received_at: DEFAULT_DEMO_ANCHOR, provenance: "simulated", location_provenance: "manual" };
  input.reports = [report];
  input.incident_episodes = [episodeSummary(report)];
  Object.assign(input.report_assessments.find(row => row.segment_id === report.segment_id), {
    report_count: 1, recent_report_count: 1, valid_until: "2026-10-15T04:20:00.000Z",
  });
  input.reporting_enabled = true;
  assert.deepEqual(parseTrafficSnapshot(input), input);
  for (const mutate of [
    value => { value.reports[0].source_id = "private"; },
    value => { value.reports[0].direction = "inbound"; },
    value => { value.reports.push(value.reports[0]); },
    value => { value.fixture = null; },
    value => { value.reporting_enabled = "true"; },
    value => { value.reports = Array(2001).fill(report); },
  ]) {
    const invalid = structuredClone(input); mutate(invalid);
    assert.throws(() => parseTrafficSnapshot(invalid));
  }
});

test("episode summaries preserve exact observation microseconds and admission time without leaking private fields", () => {
  const input = episodeSnapshot();
  input.incident_episodes[0].created_at = "2026-10-15 09:30:00.654321+0530";
  input.incident_episodes[0].first_observed_at = "2026-10-15 09:29:00.123001+05:30";
  const before = structuredClone(input);
  const parsed = parseTrafficSnapshot(input);
  assert.deepEqual(parsed.incident_episodes, [{ ...before.incident_episodes[0],
    created_at: "2026-10-15T04:00:00.654321Z", first_observed_at: "2026-10-15T03:59:00.123001Z" }]);
  assert.equal(parsed.incident_episodes[0].last_observed_at, "2026-10-15T03:59:00.123999Z");
  assert.deepEqual(parsed.reports.map(report => report.observed_at), ["2026-10-15T03:59:00.123Z", "2026-10-15T03:59:00.123Z"]);
  assert.deepEqual(Object.keys(parsed.incident_episodes[0]).sort(), ["id", "segment_id", "direction", "created_at", "first_observed_at", "last_observed_at", "report_count", "provenance"].sort());
  assert.deepEqual(input, before);
  assert.notEqual(parsed.incident_episodes[0], input.incident_episodes[0]);
  input.reports.reverse();
  assert.deepEqual(parseTrafficSnapshot(input).incident_episodes, parsed.incident_episodes);
});

test("episode arrays and summaries require exact bounded public contracts", () => {
  for (const mutate of [
    value => { delete value.incident_episodes; },
    ...[null, {}, "episodes", Array(2001).fill({})].map(episodes => value => { value.incident_episodes = episodes; }),
    ...[null, [], {}].map(episode => value => { value.incident_episodes = [episode]; }),
    ...["id", "segment_id", "direction", "created_at", "first_observed_at", "last_observed_at", "report_count", "provenance"]
      .map(field => value => { delete value.incident_episodes[0][field]; }),
    ...["source_id", "owner_id", "request_id", "payload", "high_water_at", "lower_bound", "upper_bound", "multiple_sources", "cause"]
      .map(field => value => { value.incident_episodes[0][field] = "private"; }),
    ...[null, "", "bad", 1, episodeId.toUpperCase()].map(id => value => { value.incident_episodes[0].id = id; }),
    ...[0, -1, 1.5, 2001, "2", null, NaN, Infinity].map(count => value => { value.incident_episodes[0].report_count = count; }),
    value => { value.incident_episodes[0].provenance = "live"; },
    value => { value.incident_episodes[0].segment_id = "missing"; },
    value => { value.incident_episodes[0].direction = "sideways"; },
  ]) {
    const input = episodeSnapshot(); mutate(input);
    assert.throws(() => parseTrafficSnapshot(input), undefined, mutate.toString());
  }
});

test("episode timestamps reject invalid calendars, non-20xx dates and reversed microsecond ranges", () => {
  for (const field of ["created_at", "first_observed_at", "last_observed_at"]) {
    for (const time of [null, 0, "", "2026-02-30T04:00:00Z", "2026-10-15T24:00:00Z", "2026-10-15T04:00:60Z",
      "2026-10-15T04:00:00", "2026-10-15T04:00:00.1234567Z", "2026-10-15T04:00:00+16:00", "2026-10-15T04:00:00+00:60",
      "1999-12-31T23:59:59Z", "2100-01-01T00:00:00Z", "2000-01-01T00:00:00+01:00", "2099-12-31T23:59:59-01:00"]) {
      const input = episodeSnapshot(); input.incident_episodes[0][field] = time;
      assert.throws(() => parseTrafficSnapshot(input), undefined, `${field}: ${time}`);
    }
  }
  for (const patch of [
    { first_observed_at: "2026-10-15T03:59:00.123002Z" },
    { last_observed_at: "2026-10-15T03:59:00.123998Z" },
    { first_observed_at: "2026-10-15T03:59:00.123000Z" },
    { last_observed_at: "2026-10-15T03:59:00.124000Z" },
    { first_observed_at: "2026-10-15T03:59:00.123999Z", last_observed_at: "2026-10-15T03:59:00.123001Z" },
  ]) {
    const input = episodeSnapshot(); Object.assign(input.incident_episodes[0], patch);
    assert.throws(() => parseTrafficSnapshot(input));
  }
});

test("episode memberships reject missing, duplicate, orphan, cross-segment and cross-direction rows", () => {
  for (const mutate of [
    value => { value.incident_episodes = []; },
    value => { value.incident_episodes.push({ ...value.incident_episodes[0] }); },
    value => { value.incident_episodes.push({ ...value.incident_episodes[0], id: nextEpisodeId }); },
    value => { value.reports[0].episode_id = nextEpisodeId; },
    value => { delete value.reports[0].episode_id; },
    value => { value.incident_episodes[0].segment_id = "alternative-west"; },
    value => { value.reports[0].segment_id = "alternative-west"; },
    value => { Object.assign(value.incident_episodes[0], { segment_id: "primary-west-inbound", direction: "inbound" }); },
    value => { Object.assign(value.reports[0], { segment_id: "primary-west-inbound", direction: "inbound" }); },
    value => { value.incident_episodes[0].direction = "inbound"; },
    value => { value.incident_episodes[0].report_count = 1; },
    value => { value.incident_episodes[0].report_count = 3; },
    value => { value.reports[0].received_at = "2026-10-15T03:59:00.123000Z"; },
  ]) {
    const input = episodeSnapshot(); mutate(input);
    assert.throws(() => parseTrafficSnapshot(input), undefined, mutate.toString());
  }
  const empty = { ...snapshot(), fixture: null, report_assessments: [] };
  assert.deepEqual(parseTrafficSnapshot(empty), empty);
  assert.throws(() => parseTrafficSnapshot({ ...empty, incident_episodes: episodeSnapshot().incident_episodes }));
  assert.throws(() => parseTrafficSnapshot({ ...empty, reports: episodeSnapshot().reports }));
  assert.throws(() => parseTrafficSnapshot({ ...empty, report_assessments: snapshot().report_assessments }));
});

test("multiple retained episodes on one direction leave L3 assessments directed-segment scoped", () => {
  const input = episodeSnapshot();
  input.reports.push(publicReport(3, { episode_id: nextEpisodeId }));
  input.incident_episodes.push(episodeSummary(input.reports[2]));
  Object.assign(input.report_assessments[0], { report_count: 3, recent_report_count: 3, eligible_report_count: 3,
    eligible_source_count: 3, multiple_sources: true });
  const parsed = parseTrafficSnapshot(input);
  assert.equal(parsed.incident_episodes.length, 2);
  assert.equal(parsed.report_assessments.length, 5);
  assert.deepEqual(parsed.report_assessments, input.report_assessments);
  assert.deepEqual(parsed.reports.map(report => report.episode_id), [episodeId, episodeId, nextEpisodeId]);
});

test("episode and member limits include exactly 2000 rows", () => {
  const input = snapshot();
  input.reports = Array.from({ length: 2000 }, (_, index) => publicReport(index));
  input.incident_episodes = [episodeSummary(input.reports[0], { report_count: 2000 })];
  Object.assign(input.report_assessments[0], { report_count: 2000, recent_report_count: 2000, valid_until: "2026-10-15T04:20:00.000Z" });
  assert.deepEqual(parseTrafficSnapshot(input), input);
  for (const report of input.reports) report.episode_id = report.id;
  input.incident_episodes = input.reports.map(report => episodeSummary(report));
  assert.deepEqual(parseTrafficSnapshot(input), input);
});

test("assessments exactly cover active directions and agree with all public rows", () => {
  for (const mutate of [
    value => { value.report_assessments.pop(); },
    value => { value.report_assessments.push(value.report_assessments[0]); },
    value => { value.report_assessments[0].report_count = 1; },
    value => { value.report_assessments[0].direction = "inbound"; },
    value => { value.report_assessments[0].source_id = "private"; },
    value => { value.report_assessments = []; },
  ]) {
    const input = snapshot(); mutate(input);
    assert.throws(() => parseTrafficSnapshot(input));
  }
});

test("SQL microsecond window boundaries round-trip while display deadlines round down", () => {
  for (const [observed, received, recent, eligible, deadline] of [
    ["03:40:00.000001", "04:00:00.000000", 1, 0, "04:00:00.000001"],
    ["03:45:00.000001", "04:00:00.000000", 1, 1, "04:00:00.000001"],
    ["04:00:00.000001", "04:00:00.000001", 0, 0, "04:00:00.000001"],
  ]) {
    const input = snapshot();
    input.read_at = "2026-10-15T04:00:00.000000Z";
    input.reports = [{ id: "a0866416-8ea3-4f6a-81f9-6f855cd73947", episode_id: "66ee2d39-c477-42ad-a6b8-086781da03de", segment_id: "primary-west", direction: "outbound",
      category: "unknown", observed_at: `2026-10-15T${observed}Z`, received_at: `2026-10-15T${received}Z`, provenance: "simulated", location_provenance: "manual" }];
    input.incident_episodes = [episodeSummary(input.reports[0])];
    Object.assign(input.report_assessments[0], { report_count: 1, recent_report_count: recent, eligible_report_count: eligible,
      eligible_source_count: eligible, valid_until: `2026-10-15T${deadline}Z` });
    const parsed = parseTrafficSnapshot(input);
    assert.equal(parsed.report_assessments[0].valid_until, parsed.read_at);
    assert.equal(parsed.report_assessments[0].recent_report_count, recent);
  }
});

test("snapshot geometry stays inside the map corridor, including bounds and all generated scenarios", () => {
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    const input = { ...snapshot(), fixture: createTrafficFixture(scenario, DEFAULT_DEMO_ANCHOR) };
    assert.deepEqual(parseTrafficSnapshot(input), input);
  }
  const boundary = snapshot();
  boundary.fixture.segments[0].geometry.coordinates = [[74.79, 12.82], [74.92, 12.94]];
  assert.deepEqual(parseTrafficSnapshot(boundary), boundary);
  for (const point of [[74.789999, 12.88], [74.920001, 12.88], [74.85, 12.819999], [74.85, 12.940001], [0, 0], [12.88, 74.85]]) {
    const input = snapshot();
    input.fixture.segments.at(-1).geometry.coordinates[1] = point;
    assert.throws(() => parseTrafficSnapshot(input), /Invalid traffic snapshot/, JSON.stringify(point));
  }
});

test("missing segment samples and an empty observation collection remain explicit, not fabricated", () => {
  const input = snapshot();
  input.fixture.observations = input.fixture.observations.filter(row => row.segment_id !== "primary-west");
  assert.deepEqual(parseTrafficSnapshot(input), input);
  input.fixture.observations = [];
  assert.deepEqual(parseTrafficSnapshot(input), input);
});

test("snapshot parser rejects malformed envelopes, timestamps, provenance and extra fields", () => {
  for (const value of [null, [], {}, { read_at: DEFAULT_DEMO_ANCHOR }, { read_at: DEFAULT_DEMO_ANCHOR, fixture: false }]) {
    assert.throws(() => parseTrafficSnapshot(value));
  }
  for (const timestamp of [null, 0, "", "2026-10-15", "2026-02-30T04:00:00Z", "2026-10-15T24:00:00Z", "2026-10-15T04:00:00", "2026-10-15T04:00:60Z", "2026-10-15T04:00:00+99:00", "infinity"]) {
    const input = snapshot();
    input.read_at = timestamp;
    assert.throws(() => parseTrafficSnapshot(input));
  }
  for (const mutate of [
    value => { value.private = "unexpected"; },
    value => { value.fixture.corridor.id = "unrelated"; },
    value => { value.fixture.corridor.provenance = "gps"; },
    value => { value.fixture.corridor.scenario = "live"; },
    value => { value.fixture.corridor.anchor_at = "2100-01-01T00:00:00Z"; },
    value => { value.fixture.corridor.geometry_note = ""; },
    value => { value.fixture.segments[0].owner_id = "private"; },
    value => { value.fixture.observations[0].provenance = "gps"; },
    value => { value.fixture.observations[0].observed_at = "2026-02-30T04:00:00Z"; },
    value => { value.fixture.observations[0].observed_at = "2026-10-15T04:00:01Z"; },
    value => { value.fixture.observations[0].observed_at = "2026-10-15T03:48:59Z"; },
  ]) {
    const input = snapshot(); mutate(input);
    assert.throws(() => parseTrafficSnapshot(input));
  }
});

test("snapshot parser rejects invalid geometry, numeric values, enums and relational references", () => {
  const mutations = [
    value => { value.segments = []; },
    value => { value.segments.push(value.segments[0]); },
    value => { value.segments[0].id = "invalid id"; },
    value => { value.segments[0].direction = "sideways"; },
    value => { value.segments[0].geometry.type = "Point"; },
    value => { value.segments[0].geometry.coordinates = [[74, 12]]; },
    value => { value.segments[0].geometry.coordinates[0] = [74, 12, 0]; },
    value => { value.segments[0].geometry.coordinates[0][0] = 181; },
    value => { value.segments[0].geometry.coordinates[0][1] = -91; },
    value => { value.segments[0].geometry.coordinates[0][0] = NaN; },
    value => { value.segments[0].length_m = 0; },
    value => { value.segments[0].length_m = 1.5; },
    value => { value.segments[0].baseline_seconds = "180"; },
    value => { value.segments[0].baseline_seconds = 86401; },
    value => { value.routes[0].kind = "recommended"; },
    value => { value.routes[1].kind = "primary"; },
    value => { value.routes.pop(); },
    value => { value.route_segments[0].route_id = "missing"; },
    value => { value.route_segments[0].segment_id = "missing"; },
    value => { value.route_segments[0].direction = "inbound"; },
    value => { value.route_segments[0].position = 2; },
    value => { value.route_segments.pop(); value.route_segments.pop(); },
    value => { value.route_segments[1].segment_id = value.route_segments[0].segment_id; },
    value => { value.sources[0].segment_id = "missing"; },
    value => { value.sources.push(value.sources[0]); },
    value => { value.observations[0].source_id = "missing"; },
    value => { value.observations[0].segment_id = "alternative-west"; },
    value => { value.observations.push(value.observations[0]); },
    ...[-1, 161, Infinity, NaN, "8", null].map(speed => value => { value.observations[0].speed_kph = speed; }),
  ];
  for (const mutate of mutations) {
    const input = snapshot(); mutate(input.fixture);
    assert.throws(() => parseTrafficSnapshot(input), undefined, mutate.toString());
  }
});

test("sample freshness uses the read clock and exact twenty-minute/future boundaries", () => {
  const readAt = "2026-10-15T04:20:00.000Z";
  assert.equal(sampleFreshness(null, readAt), "missing");
  assert.equal(sampleFreshness(readAt, readAt), "recent");
  assert.equal(sampleFreshness("2026-10-15T04:00:00.001Z", readAt), "recent");
  assert.equal(sampleFreshness(DEFAULT_DEMO_ANCHOR, readAt), "stale");
  assert.equal(sampleFreshness("2026-10-15T03:59:59.999Z", readAt), "stale");
  assert.equal(sampleFreshness("2026-10-15T04:20:00.001Z", readAt), "future");
  assert.throws(() => sampleFreshness("bad", readAt));
  assert.throws(() => sampleFreshness(null, "bad"));
});

test("server snapshot reader is public, request-time, bounded, uncached and safe on every failure", async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  try {
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
    assert.deepEqual(await readTrafficSnapshot(), { status: "unconfigured" });
    assert.ok(!state.events.includes("sdk"));
    process.env.SUPABASE_URL = "http://synthetic.invalid";
    process.env.SUPABASE_ANON_KEY = "synthetic-public-key";
    state.events = [];
    const phase4 = { traffic: snapshot(), incidents: [], traversals: snapshot().fixture.segments.map(segment => ({
      segment_id: segment.id, direction: segment.direction, status: "missing", id: null, entered_at: null, exited_at: null,
      baseline_seconds: null, baseline_label: null, delay_seconds: null, valid_until: null, provenance: "simulated" })) };
    const route_comparison = { status: "missing", primary_route_id: "primary", alternative_route_id: "alternative", direction: "outbound",
      primary_segment_ids: ["primary-west", "primary-east"], alternative_segment_ids: ["alternative-west", "alternative-east"],
      primary_duration_us: null, alternative_duration_us: null, savings_us: null, valid_until: null, supported_incident_ids: [], provenance: "simulated" };
    const route_alerts = phase4.traffic.fixture.segments.map(segment => ({ segment_id: segment.id, direction: segment.direction,
      kind: "abstain", reason: route_comparison.primary_segment_ids.includes(segment.id) ? "missing" : "unrelated_selection",
      savings_us: null, valid_until: null, incident_id: null, provenance: "simulated" }));
    state.response = { data: { phase4, route_comparison }, error: null, status: 200 };
    state.fetch = true;
    const requestController = new AbortController();
    state.init = { cache: "force-cache", signal: requestController.signal };
    let received;
    const timeouts = [];
    AbortSignal.timeout = milliseconds => { timeouts.push(milliseconds); return originalTimeout(milliseconds); };
    globalThis.fetch = async (_input, init) => { received = init; return new Response("{}"); };
    const expectedSlowdowns = snapshot().fixture.segments.map(segment => ({ segment_id: segment.id, direction: segment.direction,
      status: segment.id === "primary-west" ? "supported" : "not_supported", window_start: "2026-10-15T03:55:00.000Z",
      window_end: DEFAULT_DEMO_ANCHOR, complete_source_count: 3, slow_source_count: segment.id === "primary-west" ? 3 : 0,
      valid_until: "2026-10-15T04:15:00.000Z", provenance: "simulated" }));
    assert.deepEqual(await readTrafficSnapshot(), { status: "ready", snapshot: snapshot(), slowdown_assessments: expectedSlowdowns, incidents: [], traversals: phase4.traversals, route_comparison, route_alerts });
    assert.deepEqual(state.events, ["connection", "sdk"]);
    assert.equal(state.rpc, "read_traffic_phase5");
    assert.equal(state.url, process.env.SUPABASE_URL);
    assert.equal(state.key, process.env.SUPABASE_ANON_KEY);
    assert.deepEqual(state.options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    assert.equal(received.cache, "no-store");
    assert.deepEqual(timeouts, [8000]);
    assert.ok(received.signal instanceof AbortSignal);
    requestController.abort();
    assert.equal(received.signal.aborted, true);
    state.init = undefined;
    assert.equal((await readTrafficSnapshot()).status, "ready");
    assert.deepEqual(timeouts, [8000, 8000]);
    state.fetch = false;
    for (const response of [
      { data: null, error: { code: "42501", message: "private diagnostic" }, status: 400 },
      { data: null, error: { message: "private diagnostic" }, status: 401 },
      { data: null, error: { message: "private diagnostic" }, status: 403 },
    ]) {
      state.response = response;
      assert.deepEqual(await readTrafficSnapshot(), { status: "denied" });
    }
    state.response = { data: null, error: { code: "PGRST202", message: "private diagnostic" }, status: 404 };
    assert.deepEqual(await readTrafficSnapshot(), { status: "unavailable" });
    state.response = { data: {}, error: null, status: 200 };
    assert.deepEqual(await readTrafficSnapshot(), { status: "invalid" });
    const emptyComparison = { ...route_comparison, status: "no_routes", primary_segment_ids: [], alternative_segment_ids: [] };
    state.response = { data: { phase4: { traffic: { read_at: DEFAULT_DEMO_ANCHOR, fixture: null, reports: [], incident_episodes: [], reporting_enabled: false, report_assessments: [] }, incidents: [], traversals: [] }, route_comparison: emptyComparison }, error: null, status: 200 };
    assert.deepEqual(await readTrafficSnapshot(), { status: "ready", snapshot: state.response.data.phase4.traffic, slowdown_assessments: [], incidents: [], traversals: [], route_comparison: emptyComparison, route_alerts: [] });
    state.requestError = true;
    assert.deepEqual(await readTrafficSnapshot(), { status: "unavailable" });
    state.requestError = false;
    state.constructError = true;
    assert.deepEqual(await readTrafficSnapshot(), { status: "unavailable" });
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
    globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout;
  }
});
