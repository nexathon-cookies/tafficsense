import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  submitIncidentReport,
  getActiveLiveIncidents,
  authorityUpdateIncident,
  getAuthorityIncidentHistory,
  getAuthorityNotifications,
  markAuthorityNotificationAsRead,
} from "../apps/web/src/lib/incidents/server.ts";

describe("Plan 4 (revised) – Live Incident Reporting and Verification RPCs", () => {
  it("submitIncidentReport invokes submit_live_incident_report RPC", async () => {
    const rpcCalls = [];
    const mockSupabase = {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        return {
          data: {
            ok: true,
            incident_id: "inc-uuid-1",
            level: "L1",
            level_reason: "Report submitted by commuter (unconfirmed)",
          },
          error: null,
        };
      },
    };

    const res = await submitIncidentReport(mockSupabase, {
      category: "accident",
      lat: 12.871,
      lng: 74.842,
      gps_accuracy_m: 15.0,
      gps_fix_at: "2026-10-18T14:00:00Z",
      note: "Near signal",
    });

    assert.equal(res.ok, true);
    assert.equal(rpcCalls.length, 2);
    assert.equal(rpcCalls[0].name, "submit_live_incident_report");
    assert.equal(rpcCalls[0].params.p_category, "accident");
    assert.equal(rpcCalls[0].params.p_lat, 12.871);
    assert.equal(rpcCalls[0].params.p_lng, 74.842);
    assert.equal(rpcCalls[0].params.p_gps_accuracy_m, 15.0);
    assert.equal(rpcCalls[0].params.p_note, "Near signal");

    assert.equal(rpcCalls[1].name, "dispatch_authority_notification");
    assert.equal(rpcCalls[1].params.p_incident_id, "inc-uuid-1");
    assert.equal(rpcCalls[1].params.p_category, "accident");
    assert.equal(rpcCalls[1].params.p_has_photo, false);
    assert.match(rpcCalls[1].params.p_landmark, /Hampankatta|Jyoti|Lalbagh/i);
  });

  it("getActiveLiveIncidents invokes read_active_live_incidents RPC", async () => {
    const rpcCalls = [];
    const mockIncidents = [
      {
        id: "inc-1",
        category: "accident",
        lat: 12.87,
        lng: 74.84,
        status: "open",
        level: "L3",
        level_reason: "Verified by 3 independent commuters",
        first_reported_at: "2026-10-18T13:45:00Z",
        last_confirmed_at: "2026-10-18T13:55:00Z",
        provenance: "verified",
        report_count: 3,
      },
    ];

    const mockSupabase = {
      rpc: async (name) => {
        rpcCalls.push({ name });
        return { data: mockIncidents, error: null };
      },
    };

    const incidents = await getActiveLiveIncidents(mockSupabase);
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].id, "inc-1");
    assert.equal(incidents[0].level, "L3");
    assert.equal(rpcCalls[0].name, "read_active_live_incidents");
  });

  it("authorityUpdateIncident invokes authority_update_incident RPC for each review decision", async () => {
    const rpcCalls = [];
    const mockSupabase = {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        return { data: { ok: true }, error: null };
      },
    };

    const confirmRes = await authorityUpdateIncident(mockSupabase, "inc-1", "confirm");
    assert.equal(confirmRes.ok, true);
    assert.equal(rpcCalls[0].name, "authority_update_incident");
    assert.equal(rpcCalls[0].params.p_incident_id, "inc-1");
    assert.equal(rpcCalls[0].params.p_action, "confirm");

    const resolveRes = await authorityUpdateIncident(mockSupabase, "inc-1", "resolve");
    assert.equal(resolveRes.ok, true);
    assert.equal(rpcCalls[1].name, "authority_update_incident");
    assert.equal(rpcCalls[1].params.p_incident_id, "inc-1");
    assert.equal(rpcCalls[1].params.p_action, "resolve");

    const rejectRes = await authorityUpdateIncident(mockSupabase, "inc-1", "reject");
    assert.equal(rejectRes.ok, true);
    assert.equal(rpcCalls[2].params.p_action, "reject");
  });

  it("getAuthorityIncidentHistory invokes the restricted history RPC with a bounded request", async () => {
    const calls = [];
    const history = await getAuthorityIncidentHistory({
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: [{ id: "audit-1", action: "reject_incident" }], error: null };
      },
    });
    assert.equal(history.length, 1);
    assert.deepEqual(calls, [{ name: "read_authority_incident_history", params: { p_limit: 20 } }]);
  });

  it("submitIncidentReport with photo evidence dispatches notification with has_photo=true and L5", async () => {
    const rpcCalls = [];
    const mockSupabase = {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        if (name === "apply_incident_photo_verification") {
          return { data: { ok: true, level_reason: "L5 Vision corroborated" }, error: null };
        }
        return {
          data: {
            ok: true,
            incident_id: "inc-photo-123",
            level: "L1",
            level_reason: "Initial report",
          },
          error: null,
        };
      },
    };

    const res = await submitIncidentReport(mockSupabase, {
      category: "flood",
      lat: 12.885,
      lng: 74.848,
      l5_verified: true,
      l5_summary: "Deep waterlogging across both lanes near Bejai",
      reporter_email: "commuter@trafficsense.local",
    });

    assert.equal(res.ok, true);
    assert.equal(res.level, "L5");

    const dispatchCall = rpcCalls.find((c) => c.name === "dispatch_authority_notification");
    assert.ok(dispatchCall, "Must dispatch authority notification");
    assert.equal(dispatchCall.params.p_has_photo, true);
    assert.equal(dispatchCall.params.p_level, "L5");
    assert.equal(dispatchCall.params.p_category, "flood");
    assert.match(dispatchCall.params.p_landmark, /KSRTC|Bejai/i);
    assert.equal(dispatchCall.params.p_photo_summary, "Deep waterlogging across both lanes near Bejai");
    assert.equal(dispatchCall.params.p_reporter_email, "commuter@trafficsense.local");
  });

  it("getAuthorityNotifications and markAuthorityNotificationAsRead invoke their respective RPCs", async () => {
    const calls = [];
    const mockSupabase = {
      rpc: async (name, params) => {
        calls.push({ name, params });
        if (name === "read_authority_notifications") {
          return {
            data: {
              ok: true,
              notifications: [
                { id: "notif-1", incident_id: "inc-1", category: "accident", landmark: "Near Hampankatta", has_photo: true },
              ],
            },
            error: null,
          };
        }
        if (name === "mark_authority_notification_read") {
          return { data: { ok: true, affected: 1 }, error: null };
        }
        return { data: null, error: null };
      },
    };

    const notifs = await getAuthorityNotifications(mockSupabase, "2026-10-24T00:00:00Z", 20);
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].id, "notif-1");
    assert.equal(notifs[0].has_photo, true);
    assert.equal(calls[0].name, "read_authority_notifications");
    assert.equal(calls[0].params.p_since, "2026-10-24T00:00:00Z");
    assert.equal(calls[0].params.p_limit, 20);

    const markRes = await markAuthorityNotificationAsRead(mockSupabase, "notif-1");
    assert.equal(markRes.ok, true);
    assert.equal(markRes.affected, 1);
    assert.equal(calls[1].name, "mark_authority_notification_read");
    assert.equal(calls[1].params.p_notification_id, "notif-1");
  });
});
