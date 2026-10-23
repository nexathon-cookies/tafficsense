import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const accounts = JSON.parse(readFileSync("supabase/.temp/demo-accounts.json", "utf8"));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
assert.equal(process.env.DEMO_MODE, "true", "Integration tests require the local demo configuration");
assert.ok(url && key, "Supabase configuration is required");
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(role) {
  const supabase = client();
  const account = accounts.find((account) => account.label === role);
  const { error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(error, null);
  return supabase;
}

test("anonymous requests cannot read profiles, memberships or organisations", async () => {
  const supabase = client();
  for (const table of ["profiles", "memberships", "organisations"]) {
    const { data, error } = await supabase.from(table).select("*");
    assert.ok(error || data.length === 0, `${table} disclosed anonymous rows`);
  }
});

test("every synthetic user sees only their own assigned profile", async () => {
  for (const account of accounts) {
    const supabase = await signIn(account.label);
    const { data, error } = await supabase.from("profiles").select("id,role");
    assert.equal(error, null);
    assert.equal(data.length, 1);
    assert.equal(data[0].id, account.id);
    assert.equal(data[0].role, account.role);
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("unassigned employers and non-employer roles cannot read organisations or memberships", async () => {
  for (const label of ["commuter", "authority", "admin", "employer-unassigned"]) {
    const supabase = await signIn(label);
    for (const table of ["organisations", "memberships"]) {
      const { data, error } = await supabase.from(table).select("*");
      assert.equal(error, null);
      assert.deepEqual(data, []);
    }
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("malformed bearer tokens cannot read access data", async () => {
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: "Bearer invalid-token" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error, status } = await supabase.from("profiles").select("*");
  assert.equal(status, 401);
  assert.ok(error);
  assert.equal(data, null);
});

test("employers can read only their own organisation and membership", async () => {
  for (const label of ["employer-a", "employer-b"]) {
    const supabase = await signIn(label);
    const account = accounts.find((account) => account.label === label);
    const other = accounts.find((account) => account.label === (label === "employer-a" ? "employer-b" : "employer-a"));
    for (const table of ["memberships", "organisations"]) {
      const { data, error } = await supabase.from(table).select("*");
      assert.equal(error, null);
      assert.equal(data.length, 1);
      assert.equal(table === "memberships" ? data[0].org_id : data[0].id, account.orgId);
    }
    const { data, error } = await supabase.from("organisations").select("*").eq("id", other.orgId);
    assert.equal(error, null);
    assert.deepEqual(data, []);
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("client writes cannot assign roles, alter memberships, or change organisations", async () => {
  const supabase = await signIn("commuter");
  const commuter = accounts.find((account) => account.label === "commuter");
  const employer = accounts.find((account) => account.label === "employer-a");
  const initialEmployer = await signIn("employer-a");
  const orgBefore = await initialEmployer.from("organisations").select("id,name").single();
  await initialEmployer.auth.signOut({ scope: "local" });
  for (const label of ["commuter", "employer-a"]) {
    const writer = await signIn(label);
    for (const operation of [
      writer.from("profiles").update({ role: "admin" }).eq("id", commuter.id).select(),
      writer.from("profiles").upsert({ id: commuter.id, role: "admin" }).select(),
      writer.from("memberships").insert({ user_id: commuter.id, org_id: employer.orgId }).select(),
      writer.from("memberships").update({ org_id: employer.orgId }).eq("user_id", employer.id).select(),
      writer.from("memberships").delete().eq("user_id", employer.id).select(),
      writer.from("organisations").insert({ name: "forged" }).select(),
      writer.from("organisations").update({ name: "forged" }).eq("id", employer.orgId).select(),
      writer.from("organisations").delete().eq("id", employer.orgId).select(),
    ]) {
      const { error } = await operation;
      assert.equal(error?.code, "42501", "writes must fail for insufficient privileges, not an unrelated error");
    }
    await writer.auth.signOut({ scope: "local" });
  }
  const employerClient = await signIn("employer-a");
  const orgAfter = await employerClient.from("organisations").select("id,name").single();
  assert.equal(orgBefore.error, null);
  assert.equal(orgAfter.error, null);
  assert.deepEqual(orgAfter.data, orgBefore.data);
  await employerClient.auth.signOut({ scope: "local" });
  const { data, error } = await supabase.from("profiles").select("role").single();
  assert.equal(error, null);
  assert.equal(data.role, "commuter");
  const metadata = await supabase.auth.updateUser({ data: { role: "admin", org_id: employer.orgId } });
  assert.equal(metadata.error, null);
  const after = await supabase.from("profiles").select("role").single();
  assert.equal(after.data.role, "commuter");
  await supabase.auth.signOut({ scope: "local" });
});

test("registration creates a commuter even when privileged metadata is submitted", async () => {
  const supabase = client();
  const { data, error } = await supabase.auth.signUp({
    email: `negative-${crypto.randomUUID()}@example.test`,
    password: crypto.randomUUID(),
    options: { data: { role: "admin", org_id: accounts.find((account) => account.orgId).orgId } },
  });
  assert.equal(error, null);
  assert.ok(data.session, "Local synthetic registrations should not require email delivery");
  const profile = await supabase.from("profiles").select("role").single();
  assert.equal(profile.error, null);
  assert.equal(profile.data.role, "commuter");
  const memberships = await supabase.from("memberships").select("*");
  assert.equal(memberships.error, null);
  assert.deepEqual(memberships.data, []);
  await supabase.auth.signOut({ scope: "local" });
  const signedOut = await supabase.from("profiles").select("*");
  assert.ok(signedOut.error || signedOut.data.length === 0);
});
