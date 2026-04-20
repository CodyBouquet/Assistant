// Safe logging helpers. Strips known-sensitive fields before writing.

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accessToken",
  "public_token",
  "publicToken",
  "auth_token",
  "authToken",
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "secret",
  "api_key",
  "apiKey",
  "token",
  "session",
  "sessionToken",
  "x-twilio-signature",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export function logError(scope: string, err: unknown, extra?: Record<string, unknown>) {
  const base: Record<string, unknown> = { scope };
  if (err instanceof Error) {
    base.message = err.message;
    base.name = err.name;
    // Plaid/axios errors: extract status + code without leaking token.
    const anyErr = err as { response?: { status?: number; data?: unknown } };
    if (anyErr.response) {
      base.status = anyErr.response.status;
      base.data = redact(anyErr.response.data);
    }
  } else {
    base.err = redact(err);
  }
  if (extra) base.extra = redact(extra);
  console.error(JSON.stringify(base));
}

export function logInfo(scope: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ scope, ...(extra ? { extra: redact(extra) } : {}) }));
}
