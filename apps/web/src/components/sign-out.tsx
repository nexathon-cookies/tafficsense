"use client";

import { useActionState } from "react";
import { logout } from "@/app/auth-actions";

export function SignOut() {
  const [state, action, pending] = useActionState(logout, {});
  return (
    <form action={action}>
      <button className="button secondary" disabled={pending} type="submit">{pending ? "Signing out…" : "Sign out"}</button>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
