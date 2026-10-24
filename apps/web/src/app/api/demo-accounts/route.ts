import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type DemoAccount = { label: string; role: string; email: string; password: string };

async function readAccountsFile(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "supabase/.temp/demo-accounts.json"),
    path.resolve(process.cwd(), "../../supabase/.temp/demo-accounts.json"),
  ];
  for (const filePath of candidates) {
    try {
      return await readFile(/* turbopackIgnore: true */ filePath, "utf-8");
    } catch {
      // try next path
    }
  }
  throw new Error("demo-accounts.json not found");
}

/**
 * Local-only helper for the hackathon demo: exposes the seeded demo logins so the
 * login page can offer 1-click sign-in. Disabled outside DEMO_MODE and in production.
 */
export async function GET() {
  if (process.env.DEMO_MODE !== "true" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, accounts: [] });
  }
  try {
    const raw = await readAccountsFile();
    const parsed: unknown = JSON.parse(raw);
    const accounts: DemoAccount[] = (Array.isArray(parsed) ? parsed : [])
      .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
      .filter((a) => typeof a.email === "string" && typeof a.password === "string")
      .map((a) => ({
        label: typeof a.label === "string" ? a.label : String(a.email),
        role: typeof a.role === "string" ? a.role : "commuter",
        email: a.email as string,
        password: a.password as string,
      }));
    return NextResponse.json({ ok: true, accounts });
  } catch {
    return NextResponse.json({ ok: false, accounts: [] });
  }
}
