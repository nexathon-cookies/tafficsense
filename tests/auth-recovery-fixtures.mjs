import assert from "node:assert/strict";
import { readLocalStatus } from "../scripts/local-status.mjs";

export async function createRecoveryFixtures() {
  const status = await readLocalStatus();
  const users = [];
  const orgId = crypto.randomUUID();
  const orgName = "SIMULATED · Recovery test employer";
  async function request(path, method = "GET", body) {
    const response = await fetch(`${status.API_URL}${path}`, {
      method,
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Local recovery fixture request failed: ${method} ${path.split("?")[0]} (${response.status})`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function cleanup() {
    const results = await Promise.allSettled(users.map(user => request(`/auth/v1/admin/users/${user.id}`, "DELETE")));
    const organisation = await Promise.allSettled([request(`/rest/v1/organisations?id=eq.${orgId}`, "DELETE")]);
    assert.ok([...results, ...organisation].every(result => result.status === "fulfilled"), "Temporary recovery fixtures could not all be removed; inspect local test accounts before reseeding.");
  }
  try {
    await request("/rest/v1/organisations", "POST", { id: orgId, name: orgName });
    for (const role of ["employer", "commuter"]) {
      const email = `recovery-${role}-${crypto.randomUUID()}@demo.trafficsense.test`;
      const password = crypto.randomUUID();
      const user = await request("/auth/v1/admin/users", "POST", { email, password, email_confirm: true });
      assert.match(user.id, /^[0-9a-f-]{36}$/i);
      users.push({ id: user.id, label: `recovery-${role}`, email, password, role, ...(role === "employer" ? { orgId } : {}) });
      await request(`/rest/v1/profiles?id=eq.${user.id}`, "PATCH", { role });
    }
    const employer = users.find(user => user.role === "employer");
    const commuter = users.find(user => user.role === "commuter");
    const membership = () => request("/rest/v1/memberships", "POST", { user_id: employer.id, org_id: orgId });
    await membership();
    return {
      accounts: users,
      orgId,
      orgName,
      removeMembership: () => request(`/rest/v1/memberships?user_id=eq.${employer.id}&org_id=eq.${orgId}`, "DELETE"),
      restoreMembership: membership,
      setEmployerRole: role => {
        assert.ok(["employer", "commuter", "authority", "admin"].includes(role));
        return request(`/rest/v1/profiles?id=eq.${employer.id}`, "PATCH", { role });
      },
      removeProfile: () => request(`/rest/v1/profiles?id=eq.${commuter.id}`, "DELETE"),
      restoreProfile: () => request("/rest/v1/profiles", "POST", { id: commuter.id, role: "commuter" }),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
