import { AuthScreen } from "@/components/auth-screen";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const { notice } = await searchParams;
  return <AuthScreen mode="login" revocationUnconfirmed={notice === "revocation-unconfirmed"} />;
}
