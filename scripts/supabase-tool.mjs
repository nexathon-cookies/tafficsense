import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const networkName = "trafficsense-nk_supabase";
const network = JSON.parse(execFileSync("docker", ["network", "inspect", networkName], { encoding: "utf8" }))[0];
const hostBinding = process.env.LOCAL_SUPABASE_HOST_BIND ?? "127.0.0.1";
if (
  network.Driver !== "bridge" ||
  network.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== hostBinding ||
  !["127.0.0.1", "0.0.0.0"].includes(hostBinding)
) {
  throw new Error("Local Supabase requires its dedicated configured bridge.");
}
const version = execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
if (Number.parseInt(version, 10) < 28) throw new Error("Local Supabase requires Docker Engine 28 or newer.");
const config = readFileSync("supabase/config.toml", "utf8");
if (!/^project_id = "trafficsense-nk-local"$/m.test(config)) throw new Error("Unexpected Supabase project ID.");
const args = process.argv.slice(2);
if (args.some((arg) => ["--linked", "--all", "--no-backup", "--ignore-health-check", "--project-id", "--network-id"].includes(arg))) {
  throw new Error("This tooling is restricted to the local TrafficSense project.");
}
const result = spawnSync("pnpm", ["--dir", "/app", "--silent", "exec", "supabase", "--workdir", process.cwd(), ...args], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
