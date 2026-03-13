import { decrypt } from "./crypto";

/**
 * Safely converts a Prisma JsonValue (project.env) into a plain
 * Record<string, string> suitable for docker -e injection.
 * Non-object, null, or array values are treated as empty.
 * Non-string property values are skipped.
 */
export function parseProjectEnv(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.length > 0 && typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Decrypts a flat env object read from the database.
 * Existing plaintext values from before encryption support will fail here
 * and should be re-saved through the API so they are stored encrypted.
 */
export function decryptProjectEnv(raw: unknown): Record<string, string> {
  const parsed = parseProjectEnv(raw);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    result[key] = decrypt(value);
  }

  return result;
}

/**
 * Validates that a value is a flat object with non-empty string keys
 * and string values. Returns an error message or null if valid.
 */
export function validateEnvObject(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "env must be a plain object";
  }
  for (const [key, val] of Object.entries(value)) {
    if (key.length === 0) {
      return "env keys must be non-empty strings";
    }
    if (typeof val !== "string") {
      return `env value for key "${key}" must be a string`;
    }
  }
  return null;
}
