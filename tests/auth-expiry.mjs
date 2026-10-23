import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { internalSupabaseUrl } from "../scripts/local-status.mjs";

export async function waitForSignedExpiry(session, account) {
  assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl, "Expiry checks require the local backend");
  const key = process.env.SUPABASE_ANON_KEY;
  assert.ok(key, "The local anonymous API key is required");
  const api = "http://127.0.0.1:54321";
  const request = path => fetch(`${api}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(5000),
  });
  const [headerPart, claimsPart, signaturePart] = session.access_token.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url"));
  const claims = JSON.parse(Buffer.from(claimsPart, "base64url"));
  assert.equal(header.alg, "ES256", "Use the local Auth-issued asymmetric token, not a re-signed fixture");
  assert.equal(claims.sub, account.id);
  assert.ok(claims.exp - claims.iat > 90 && claims.exp - claims.iat <= 120,
    "Use local jwt_expiry = 120 (above the SDK's 90-second refresh margin), then restore it");
  const keysResponse = await request("/auth/v1/.well-known/jwks.json");
  assert.equal(keysResponse.status, 200);
  const jwk = (await keysResponse.json()).keys.find(item => item.kid === header.kid);
  assert.ok(jwk, "Auth must publish the issued token's verification key");
  assert.ok(verify("sha256", Buffer.from(`${headerPart}.${claimsPart}`), {
    key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363",
  }, Buffer.from(signaturePart, "base64url")), "The original access-token signature must be valid");
  const user = await request("/auth/v1/user");
  assert.equal(user.status, 200, "The unchanged token must be accepted before expiry");
  assert.equal((await user.json()).id, account.id);
  const profile = await request("/rest/v1/profiles?select=id,role");
  assert.equal(profile.status, 200);
  assert.deepEqual(await profile.json(), [{ id: account.id, role: account.role }]);
  const remainingMs = claims.exp * 1000 - Date.now() + 1500;
  assert.ok(remainingMs > 0 && remainingMs <= 122000, "Bound the real-clock expiry wait");
  await new Promise(resolve => setTimeout(resolve, remainingMs));
  assert.ok(claims.exp * 1000 < Date.now());
  assert.ok([401, 403].includes((await request("/auth/v1/user")).status), "Auth must reject the unchanged expired token");
  // Measure the database validator separately; its expiration tolerance can differ from Auth's.
  const databaseDeadline = claims.exp * 1000 + 35_000;
  let databaseStatus;
  do {
    databaseStatus = (await request("/rest/v1/profiles?select=id,role")).status;
    assert.ok([200, 401].includes(databaseStatus), "An unrelated database failure must not count as token rejection");
    if (databaseStatus === 401) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < databaseDeadline);
  assert.equal(databaseStatus, 401, "Database must reject the unchanged token within 35 seconds after signed expiration");
  console.log(`PASS signed-token backend check: Auth rejected after expiration; database rejection observed ${Math.ceil((Date.now() - claims.exp * 1000) / 1000)} seconds after expiration`);
}
