"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { login, register } from "@/app/auth-actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const registration = mode === "register";
  const [state, action, pending] = useActionState(registration ? register : login, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [demoAccounts, setDemoAccounts] = useState<Array<{ label: string; role: string; email: string; password: string }>>([]);

  useEffect(() => {
    if (registration) return;
    let cancelled = false;
    fetch("/api/demo-accounts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ok && Array.isArray(data.accounts)) setDemoAccounts(data.accounts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [registration]);

  function quickSignIn(account: { email: string; password: string }) {
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = account.email;
    (form.elements.namedItem("password") as HTMLInputElement).value = account.password;
    form.requestSubmit();
  }

  const roleTitle = (a: { label: string; role: string }) =>
    a.label.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
    {demoAccounts.length > 0 && (
      <div className="mb-4 p-3 rounded-lg bg-surface-container-low border border-surface-container space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-surface-on-variant">Quick Judge Demo Sign-In (1-Click)</p>
        <div className="flex flex-wrap gap-2">
          {demoAccounts.map((a) => (
            <button
              key={a.email}
              type="button"
              disabled={pending}
              onClick={() => quickSignIn(a)}
              className="button secondary text-xs py-1.5 px-3"
              title={`${a.role} · ${a.email}`}
            >
              {roleTitle(a)}
            </button>
          ))}
        </div>
      </div>
    )}
    <form ref={formRef} action={action} className="form-stack">
      <div>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" maxLength={254} required />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={registration ? "new-password" : "current-password"} minLength={registration ? 12 : 1} maxLength={128} required aria-describedby={registration ? "password-help" : undefined} />
        {registration && <p id="password-help" className="hint">Use 12–128 characters. New accounts receive commuter access only.</p>}
      </div>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.message && <p className="notice" role="status">{state.message}</p>}
      <button className="button" disabled={pending} type="submit">{pending ? "Please wait…" : registration ? "Create commuter account" : "Sign in"}</button>
    </form>
    </>
  );
}
