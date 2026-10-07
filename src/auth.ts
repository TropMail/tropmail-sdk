import { ValidationError } from "./errors.js";

const LEGACY_KEY = /^[A-Za-z0-9]{32}$/;
const LIVE_KEY = /^tm_live_[A-Za-z0-9]{32}$/;

/**
 * Validate that an API key matches issued TropMail secrets:
 * Dashboard keys start with `tm_live_`. Paste the full secret. Older unprefixed keys still validate.
 */
export function validateApiKey(apiKey: string): void {
  if (!LEGACY_KEY.test(apiKey) && !LIVE_KEY.test(apiKey)) {
    throw new ValidationError(
      "API key must be 32 alphanumeric characters, optionally prefixed with tm_live_",
      0,
    );
  }
}

/**
 * Read `TROPMAIL_API_KEY` when a process environment exists.
 *
 * Guarded rather than imported so the SDK still loads in Workers and browsers.
 */
function apiKeyFromEnvironment(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.TROPMAIL_API_KEY;
}

/** Resolve an API key from explicit options, falling back to the environment. */
export function resolveApiKey(explicit?: string): string {
  const key = explicit && explicit.length > 0 ? explicit : apiKeyFromEnvironment();
  if (key === undefined || key.length === 0) {
    throw new ValidationError(
      "API key is required: pass apiKey or set TROPMAIL_API_KEY",
      0,
    );
  }
  validateApiKey(key);
  return key;
}
