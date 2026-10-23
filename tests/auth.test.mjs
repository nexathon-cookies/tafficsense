import assert from "node:assert/strict";
import test from "node:test";
import { validateCredentials, isRole, canAccessRole } from "../apps/web/src/lib/auth/rules.ts";

function credentials(email, password, extra = {}) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

test("credentials are normalized without changing the password or trusting role fields", () => {
  assert.deepEqual(validateCredentials(credentials("  DEMO@example.test ", " a-long-password ", { role: "admin", org_id: "other" })), {
    email: "demo@example.test", password: " a-long-password ",
  });
});

test("missing, malformed, oversized and non-string credentials are rejected", () => {
  for (const form of [new FormData(), credentials("invalid", "valid-password"), credentials("a@b.test", ""), credentials("a@b.test", "x".repeat(129)), credentials(`${"x".repeat(250)}@b.test`, "valid-password")]) {
    assert.equal(validateCredentials(form), null);
  }
  const file = credentials("a@b.test", "valid-password");
  file.set("email", new Blob(["a@b.test"]), "email.txt");
  assert.equal(validateCredentials(file), null);
});

test("registration requires at least twelve characters; login can accept existing passwords", () => {
  assert.equal(validateCredentials(credentials("a@b.test", "short"), true), null);
  assert.ok(validateCredentials(credentials("a@b.test", "short")));
  assert.ok(validateCredentials(credentials("a@b.test", "long-password"), true));
});

test("only known database roles are valid", () => {
  for (const role of ["commuter", "employer", "authority", "admin"]) assert.equal(isRole(role), true);
  for (const role of [null, undefined, "superuser", "ADMIN", {}, ""]) assert.equal(isRole(role), false);
});

test("each role page requires its exact role; admin does not imply employer access", () => {
  const roles = ["commuter", "employer", "authority", "admin"];
  for (const actual of roles) {
    for (const required of roles) assert.equal(canAccessRole(actual, required), actual === required);
  }
  assert.equal(canAccessRole("forged", "employer"), false);
});
