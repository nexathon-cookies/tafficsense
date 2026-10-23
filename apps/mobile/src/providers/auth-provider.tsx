import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { supabase, supabaseConfigError } from "../lib/supabase";
import { validateCredentials } from "../lib/auth-rules";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isInvalidCredentials(error: { status?: number; message?: string }) {
  return error.status === 400 || /invalid login credentials/i.test(error.message ?? "");
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  // Never trust a stored session without a sign-in check: restoration failure fails closed.

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    // Defer setup until after the initial Fabric commit. Supabase can emit its initial
    // session event immediately when the subscription is created.
    const timer = setTimeout(() => {
      if (!isMounted) return;

      const { data: authListener } = sb.auth.onAuthStateChange((_event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        setLoading(false);
      });
      unsubscribe = () => authListener.subscription.unsubscribe();

      void sb.auth
        .getSession()
        .then(({ data, error }) => {
          if (!isMounted) return;
          setSession(error ? null : data.session);
          setLoading(false);
        })
        .catch(() => {
          if (!isMounted) return;
          setSession(null);
          setLoading(false);
        });
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      configurationError: supabaseConfigError,
      async signIn(email, password) {
        const credentials = validateCredentials(email, password);
        if (!credentials) return "Enter a valid email and password.";
        if (!supabase) return supabaseConfigError;
        try {
          const { error } = await supabase.auth.signInWithPassword(credentials);
          return error ? (isInvalidCredentials(error) ? "Email or password is incorrect." : "Sign-in is unavailable. Please try again.") : null;
        } catch {
          return "Sign-in is unavailable. Check your connection and try again.";
        }
      },
      async signUp(email, password) {
        const credentials = validateCredentials(email, password, true);
        if (!credentials) return { error: "Enter a valid email and a password of 12-128 characters.", needsConfirmation: false };
        if (!supabase) return { error: supabaseConfigError, needsConfirmation: false };
        try {
          const { data, error } = await supabase.auth.signUp(credentials);
          if (error) return { error: "Account creation was unsuccessful. Try another email or try again later.", needsConfirmation: false };
          return { error: null, needsConfirmation: !data.session };
        } catch {
          return { error: "Account creation is unavailable. Check your connection and try again.", needsConfirmation: false };
        }
      },
      async signOut() {
        if (!supabase) return supabaseConfigError;
        try {
          const { error } = await supabase.auth.signOut({ scope: "local" });
          return error ? "Sign-out could not be confirmed. Please try again." : null;
        } catch {
          return "Sign-out is unavailable. Check your connection and try again.";
        }
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
