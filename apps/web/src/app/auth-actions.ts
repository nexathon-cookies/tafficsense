"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/auth/config";
import { clearReportGuestCookies, createAuthClient } from "@/lib/auth/server";
import { validateCredentials } from "@/lib/auth/rules";

export type AuthFormState = { error?: string; message?: string };

export async function login(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const credentials = validateCredentials(form);
  if (!credentials) return { error: "Enter a valid email and password." };
  try {
    const supabase = await createAuthClient(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) return { error: error.status === 400 ? "Email or password is incorrect." : "Sign-in is unavailable. Please try again." };
  } catch {
    return { error: "Sign-in is unavailable. Please try again." };
  }
  await clearReportGuestCookies();
  revalidatePath("/", "layout");
  redirect("/workspace");
}

export async function register(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const credentials = validateCredentials(form, true);
  if (!credentials) return { error: "Enter a valid email and a password of 12–128 characters." };
  try {
    const supabase = await createAuthClient(true);
    const { data, error } = await supabase.auth.signUp(credentials);
    if (error) return { error: "Account creation was unsuccessful. Try another email or try again later." };
    if (!data.session) return { message: "Check your email to confirm your account before signing in." };
  } catch {
    return { error: "Account creation is unavailable. Please try again." };
  }
  await clearReportGuestCookies();
  revalidatePath("/", "layout");
  redirect("/workspace");
}

export async function logout(): Promise<AuthFormState> {
  let revocationConfirmed = false;
  try {
    const supabase = await createAuthClient(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    revocationConfirmed = !error;
  } catch {
    revocationConfirmed = false;
  }
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (/^trafficsense-auth(?:\.\d+)?$/.test(cookie.name)) {
      store.set({ ...authCookieOptions, name: cookie.name, value: "", maxAge: 0, expires: new Date(0) });
    }
  }
  await clearReportGuestCookies();
  revalidatePath("/", "layout");
  redirect(revocationConfirmed ? "/login" : "/login?notice=revocation-unconfirmed");
}
