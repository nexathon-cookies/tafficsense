import http from "node:http";

// Test-only: never accept an upstream URL from a request or environment variable.
const UPSTREAM = new URL("http://supabase_kong_trafficsense-nk-local:8000");
const REQUEST_TIMEOUT_MS = 10_000;
const CONTROL_BODY_LIMIT_BYTES = 1024;
const MODES = new Set(["healthy", "auth", "database", "organisations", "all", "report-response-loss"]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);
let mode = "healthy";

function endJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store",
    connection: "close",
  });
  response.end(payload);
}

function forwardHeaders(headers) {
  const excluded = new Set(HOP_BY_HOP_HEADERS);
  for (const name of (headers.connection ?? "").split(",")) {
    excluded.add(name.trim().toLowerCase());
  }
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name)));
}

function isApiPath(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function controlFault(request, response) {
  if (request.method !== "POST") {
    endJson(response, 405, { error: "Use POST for fault control." });
    request.resume();
    return;
  }
  // Browser-originated control changes are not part of the local test interface.
  if (request.headers.origin || request.headers["sec-fetch-site"] === "cross-site") {
    endJson(response, 403, { error: "Browser-originated controls are not allowed." });
    request.resume();
    return;
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")
    || request.headers["content-encoding"]) {
    endJson(response, 415, { error: "Use unencoded application/json." });
    request.resume();
    return;
  }
  if (Number(request.headers["content-length"] ?? 0) > CONTROL_BODY_LIMIT_BYTES) {
    endJson(response, 413, { error: "Control body is too large." });
    request.resume();
    return;
  }

  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    if (response.writableEnded || response.destroyed) return;
    size += chunk.length;
    if (size > CONTROL_BODY_LIMIT_BYTES) {
      chunks.length = 0;
      endJson(response, 413, { error: "Control body is too large." });
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    if (response.writableEnded || response.destroyed) return;
    let control;
    try {
      control = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      endJson(response, 400, { error: "Invalid JSON control." });
      return;
    }
    if (!control || Array.isArray(control) || typeof control !== "object"
      || Object.keys(control).length !== 1 || !MODES.has(control.mode)) {
      endJson(response, 400, { error: "Expected one valid mode field." });
      return;
    }
    mode = control.mode;
    endJson(response, 200, { mode });
  });
}

const server = http.createServer({
  headersTimeout: REQUEST_TIMEOUT_MS,
  requestTimeout: REQUEST_TIMEOUT_MS,
  connectionsCheckingInterval: 1000,
  maxHeaderSize: 16 * 1024,
}, (request, response) => {
  let upstreamRequest;
  let upstreamResponse;
  const timer = setTimeout(() => {
    endJson(response, upstreamRequest ? 504 : 408, { error: "Test proxy request timed out." });
    upstreamRequest?.destroy();
    upstreamResponse?.destroy();
    request.resume();
  }, REQUEST_TIMEOUT_MS);
  const cleanup = () => {
    clearTimeout(timer);
    upstreamRequest?.destroy();
    upstreamResponse?.destroy();
  };
  response.once("finish", cleanup);
  response.once("close", cleanup);
  response.on("error", cleanup);
  request.once("aborted", () => response.destroy());
  request.on("error", () => {
    endJson(response, 400, { error: "Invalid request." });
    cleanup();
  });

  // Origin-form paths only; absolute URLs and tunnels cannot select another host.
  if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
    endJson(response, 400, { error: "Expected an origin-form request path." });
    request.resume();
    return;
  }
  const path = request.url.split("?", 1)[0];
  if (path === "/__health") {
    endJson(response, request.method === "GET" ? 200 : 405,
      request.method === "GET" ? { status: "ok" } : { error: "Use GET for readiness." });
    request.resume();
    return;
  }
  if (path === "/__test_fault") {
    controlFault(request, response);
    return;
  }
  const authFault = isApiPath(path, "/auth/v1") && (mode === "auth" || mode === "all");
  const databaseFault = isApiPath(path, "/rest/v1") && (mode === "database" || mode === "all");
  const organisationFault = path === "/rest/v1/organisations" && mode === "organisations";
  if (authFault || databaseFault || organisationFault) {
    endJson(response, 503, { error: "Test backend outage." });
    request.resume();
    return;
  }

  const loseReportResponse = mode === "report-response-loss" && request.method === "POST" && path === "/rest/v1/rpc/submit_traffic_report";
  upstreamRequest = http.request({
    hostname: UPSTREAM.hostname,
    port: UPSTREAM.port,
    method: request.method,
    path: request.url,
    headers: { ...forwardHeaders(request.headers), host: UPSTREAM.host },
    agent: false,
  }, (incoming) => {
    upstreamResponse = incoming;
    incoming.on("error", () => response.destroy());
    incoming.once("aborted", () => response.destroy());
    if (response.destroyed || response.writableEnded) {
      incoming.destroy();
      return;
    }
    if (loseReportResponse) {
      incoming.once("end", () => response.destroy());
      incoming.resume();
      return;
    }
    response.writeHead(incoming.statusCode, incoming.statusMessage, forwardHeaders(incoming.headers));
    // Raw streams preserve compressed bytes and repeated Set-Cookie headers.
    incoming.pipe(response);
  });
  upstreamRequest.on("error", () => {
    endJson(response, 502, { error: "Test upstream unavailable." });
    request.resume();
  });
  request.pipe(upstreamRequest);
});

// Upgrades and CONNECT tunnels are outside the auth/REST test interface.
server.on("upgrade", (_request, socket) => socket.destroy());
server.on("connect", (_request, socket) => socket.destroy());
server.on("error", () => process.exit(1));
server.listen(8000, "0.0.0.0");
