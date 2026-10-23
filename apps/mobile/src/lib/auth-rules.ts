// Pure credential rules shared by the auth provider and its tests.
export const MIN_REGISTRATION_PASSWORD = 12;
export const MAX_PASSWORD = 128;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string, registration = false) {
  const normalizedEmail = normalizeEmail(email);
  const minimum = registration ? MIN_REGISTRATION_PASSWORD : 1;
  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    password.length < minimum ||
    password.length > MAX_PASSWORD
  ) {
    return null;
  }
  return { email: normalizedEmail, password };
}

// Only a safe in-app path may be used after sign-in, so a link cannot redirect off-app.
const ALLOWED_RETURN_PATHS = ["/report", "/planner", "/traffic", "/journeys"] as const;

export function safeReturnPath(value: string | undefined | null): string {
  return ALLOWED_RETURN_PATHS.find((path) => path === value) ?? "/workspace";
}
