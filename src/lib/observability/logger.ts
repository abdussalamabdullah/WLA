import "server-only";

/**
 * OPS-01 — errors are logged.
 *
 * A structured server-side logging boundary. One line of JSON per event on
 * stdout/stderr, which every host this can deploy to already collects
 * (Vercel, Fly, a container platform, or `next start` behind a process
 * manager). That is the whole point of choosing it: OPEN-09 has not selected
 * a monitoring vendor, and inventing one would be a product decision. This
 * works without one, and gives a vendor a single place to attach when one is
 * chosen — `emit()`.
 *
 * WHAT MUST NEVER REACH A LOG
 *
 * Logs are read by people and shipped to third parties. Nothing here may carry
 * a child's name, a mission response, a Final Judgement, a reflection, a
 * signed URL, a session token or a key. `redact()` enforces the mechanical
 * part of that — key names that look like secrets are replaced, and long
 * strings are truncated so a stray payload cannot be dumped wholesale — but
 * the real rule is at the call site: pass identifiers, not content.
 *
 * Child data specifically: pass a `childId` only when it is genuinely needed
 * to investigate, never a display name. Mission content is never loggable.
 */

type Level = "info" | "warn" | "error";

/** Anything that could carry a credential, a token or a URL that grants access. */
const SECRET_KEY =
  /(key|token|secret|password|authorization|cookie|signature|signedurl|apikey)/i;
/**
 * Free-text fields that carry a child's own words or identity.
 *
 * `name` on its own is deliberately NOT here. It matched `error.name` and the
 * analytics event name, so both came back `[omitted]` — over-redaction that
 * cost real diagnostic value without protecting anything, since a child's name
 * never travels under a bare `name` key. The qualified forms are matched
 * instead, and the call-site rule still stands: pass identifiers, not content.
 */
const CONTENT_KEY =
  /((display|child|full|first|last|user|parent)_?name|email|response|answer|reflection|judgement|body|content)/i;

const MAX_STRING = 200;

export function redact(value: unknown, keyHint = ""): unknown {
  if (value === null || value === undefined) return value;

  if (SECRET_KEY.test(keyHint)) return "[redacted]";
  if (CONTENT_KEY.test(keyHint)) return "[omitted]";

  if (typeof value === "string") {
    if (/^https?:\/\//.test(value) && /token=|signature=/i.test(value)) {
      return "[redacted-url]";
    }
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING}]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v));
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message) };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  return "[unloggable]";
}

/**
 * The single seam a monitoring provider attaches to.
 *
 * Kept synchronous and non-throwing: logging is never allowed to become the
 * reason a request fails. If a provider is added here it must be fire-and-
 * forget for the same reason.
 */
function emit(level: Level, event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(event: string, fields: Record<string, unknown> = {}) {
  emit("info", event, fields);
}

export function logWarn(event: string, fields: Record<string, unknown> = {}) {
  emit("warn", event, fields);
}

/**
 * Log an error and return a stable reference.
 *
 * The reference is what a user is shown; the detail stays in the log. That is
 * the whole contract of OPS-01's "internal errors are not leaked to users":
 * someone can tell us "it said WLA-K3F2QX" and we can find the line, without
 * the interface ever having explained what actually broke.
 */
export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): string {
  const ref = newRef();
  emit("error", event, {
    ref,
    ...fields,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack?.split("\n").slice(0, 4).join(" | "),
          }
        : redact(error),
  });
  return ref;
}

/**
 * A security-relevant event that is NOT an error.
 *
 * A refused cross-family read is the system working, not failing — but a burst
 * of them is worth seeing. Logged at warn so it is separable from noise, and
 * deliberately without the requested ids' contents.
 */
export function logAccessDenied(
  reason: string,
  fields: Record<string, unknown> = {},
) {
  emit("warn", "access_denied", { reason, ...fields });
}

function newRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `WLA-${out}`;
}
