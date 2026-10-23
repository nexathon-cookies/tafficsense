"use client";

import { useActionState } from "react";
import { login, register } from "@/app/auth-actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const registration = mode === "register";
  const [state, action, pending] = useActionState(registration ? register : login, {});
  return (
    <form action={action} className="form-stack">
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
  );
}
