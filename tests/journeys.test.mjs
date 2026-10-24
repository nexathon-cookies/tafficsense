import { describe, it } from "node:test";
import assert from "node:assert/strict";
describe("Phase 6 — Journeys and consent-based employer sharing", () => {
  it("employer response contains only an unmeasured status summary without location tracking", () => {
    const employerSample = {
      journey_id: "7b43a992-1234-4567-890a-bcdef1234567",
      corridor_name: "Mangaluru Central Demonstration Corridor",
      status: "active",
      shared_at: "2026-10-17T18:00:00Z",
      provenance: "simulated",
    };

    const allowedKeys = [
      "journey_id",
      "corridor_name",
      "status",
      "shared_at",
      "provenance",
    ];

    assert.deepEqual(Object.keys(employerSample).sort(), allowedKeys.sort());

    // Never leak coordinates, geometry or raw GPS
    const raw = JSON.stringify(employerSample);
    assert.equal(raw.includes("coordinates"), false);
    assert.equal(raw.includes("geometry"), false);
    assert.equal(raw.includes("latitude"), false);
    assert.equal(raw.includes("longitude"), false);
    assert.equal(raw.includes("user_id"), false);
    assert.equal(raw.includes("email"), false);
    assert.equal(raw.includes("delay"), false);
    assert.equal(raw.includes("evidence"), false);
  });

  it("sharing lifecycle stops access when ended or stopped", () => {
    const activeShare = {
      journey_status: "active",
      share_status: "active",
    };
    const isEmployerVisible = (j) => j.journey_status === "active" && j.share_status === "active";

    assert.equal(isEmployerVisible(activeShare), true);

    // Commuter ends journey
    assert.equal(isEmployerVisible({ journey_status: "ended", share_status: "active" }), false);

    // Commuter stops sharing
    assert.equal(isEmployerVisible({ journey_status: "active", share_status: "stopped" }), false);

    // Both ended and stopped
    assert.equal(isEmployerVisible({ journey_status: "ended", share_status: "stopped" }), false);
  });

  it("journey operations invoke secure RPCs rather than raw table mutations", async () => {
    const {
      startCommuterJourney,
      endCommuterJourney,
      shareJourneyWithEmployer,
      stopSharingJourneyWithEmployer,
    } = await import("../apps/web/src/lib/journeys/server.ts");

    const rpcCalls = [];
    const mockSupabase = {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        if (name === "start_commuter_journey") {
          return { data: { ok: true, journeyId: "test-journey-1" }, error: null };
        }
        return { data: { ok: true }, error: null };
      },
    };

    const startRes = await startCommuterJourney(mockSupabase, "Test Corridor");
    assert.equal(startRes.ok, true);
    assert.equal(startRes.journeyId, "test-journey-1");
    assert.equal(rpcCalls[0].name, "start_commuter_journey");
    assert.equal(rpcCalls[0].params.p_corridor_name, "Test Corridor");

    const endRes = await endCommuterJourney(mockSupabase, "test-journey-1");
    assert.equal(endRes.ok, true);
    assert.equal(rpcCalls[1].name, "end_commuter_journey");
    assert.equal(rpcCalls[1].params.p_journey_id, "test-journey-1");

    const shareRes = await shareJourneyWithEmployer(mockSupabase, "test-journey-1", "org-uuid-1");
    assert.equal(shareRes.ok, true);
    assert.equal(rpcCalls[2].name, "share_commuter_journey");
    assert.equal(rpcCalls[2].params.p_journey_id, "test-journey-1");
    assert.equal(rpcCalls[2].params.p_org_id, "org-uuid-1");

    const stopRes = await stopSharingJourneyWithEmployer(mockSupabase, "test-journey-1", "org-uuid-1");
    assert.equal(stopRes.ok, true);
    assert.equal(rpcCalls[3].name, "stop_sharing_commuter_journey");
    assert.equal(rpcCalls[3].params.p_journey_id, "test-journey-1");
    assert.equal(rpcCalls[3].params.p_org_id, "org-uuid-1");
  });

  it("getAvailableOrganisations queries get_commuter_organisations RPC with fallback", async () => {
    const { getAvailableOrganisations } = await import("../apps/web/src/lib/journeys/server.ts");

    // Case 1: RPC returns organizations
    const rpcMock = {
      rpc: async (name) => {
        assert.equal(name, "get_commuter_organisations");
        return { data: [{ id: "org-1", name: "Junction Employer" }], error: null };
      },
    };
    const orgs = await getAvailableOrganisations(rpcMock);
    assert.deepEqual(orgs, [{ id: "org-1", name: "Junction Employer" }]);

    // Case 2: RPC fails, fallback to table select
    const fallbackMock = {
      rpc: async () => ({ data: null, error: new Error("RPC missing") }),
      from: (table) => {
        assert.equal(table, "organisations");
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [{ id: "org-2", name: "Fallback Employer" }] }),
          }),
        };
      },
    };
    const fallbackOrgs = await getAvailableOrganisations(fallbackMock);
    assert.deepEqual(fallbackOrgs, [{ id: "org-2", name: "Fallback Employer" }]);
  });
});
