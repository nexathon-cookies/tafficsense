import { readFile, writeFile, chmod } from "node:fs/promises";
import { readLocalStatus, internalSupabaseUrl } from "./local-status.mjs";

const status = await readLocalStatus();
let current = "";
try { current = await readFile(".env.local", "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const previousUrl = current.match(/^SUPABASE_URL=(.*)$/m)?.[1];
if (previousUrl && previousUrl !== internalSupabaseUrl) throw new Error("Refusing to overwrite a different Supabase configuration.");
const settings = {
  SUPABASE_URL: internalSupabaseUrl,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  DEMO_MODE: "true",
  AUTH_COOKIE_SECURE: "false",
};
const otherLines = current.split("\n").filter((line) => !Object.keys(settings).some((key) => line.startsWith(`${key}=`))).filter(Boolean);
await writeFile(".env.local", `${[...otherLines, ...Object.entries(settings).map(([key, value]) => `${key}=${value}`)].join("\n")}\n`, { mode: 0o600 });
await chmod(".env.local", 0o600);
console.log("Configured .env.local for local Supabase. No privileged key was saved.");
