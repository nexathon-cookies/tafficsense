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

const FALLBACK_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "commuter",
    role: "commuter",
    email: "commuter@demo.trafficsense.test",
    password: "6ut8HigaF43KtVyksSI4YLyjKKsvvdXD",
  },
  {
    label: "commuter-b",
    role: "commuter",
    email: "commuter-b@demo.trafficsense.test",
    password: "MIXwr3TtWiXjCSpetowtx1SRTLKGkewN",
  },
  {
    label: "employer-a",
    role: "employer",
    email: "employer-a@demo.trafficsense.test",
    password: "z8ww797fmZc-Yg8JAdvZQ9-vw_pOsTkD",
  },
  {
    label: "authority",
    role: "authority",
    email: "authority@demo.trafficsense.test",
    password: "kej7NDq-PcEjUQwd8Ny3TEMs4E7AxcyA",
  },
  {
    label: "admin",
    role: "admin",
    email: "admin@demo.trafficsense.test",
    password: "1hEKVvSzJ4p0xXi3_xxDUte0XIlHFiWc",
  },
];

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
    return NextResponse.json({ ok: true, accounts: accounts.length > 0 ? accounts : FALLBACK_DEMO_ACCOUNTS });
  } catch {
    return NextResponse.json({ ok: true, accounts: FALLBACK_DEMO_ACCOUNTS });
  }
}
