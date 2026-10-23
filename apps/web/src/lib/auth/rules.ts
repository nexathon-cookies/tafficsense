export const roles = ["commuter", "employer", "authority", "admin"] as const;
export type Role = (typeof roles)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.some((role) => role === value);
}

export function canAccessRole(actual: unknown, required: Role): boolean {
  return isRole(actual) && actual === required;
}

export function validateCredentials(form: FormData, registration = false) {
  const rawEmail = form.get("email");
  const password = form.get("password");
  if (typeof rawEmail !== "string" || typeof password !== "string") return null;
  const email = rawEmail.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < (registration ? 12 : 1) ||
    password.length > 128
  ) return null;
  return { email, password };
}
