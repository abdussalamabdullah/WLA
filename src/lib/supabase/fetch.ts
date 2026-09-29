/**
 * A fetch for Supabase that cannot hang for ever.
 *
 * supabase-js sets no timeout. Found in staging QA after a spell of heavy
 * packet loss: requests sent over connections that had died silently never
 * settled, so a child's "Continue" sat on "Saving…" for 15+ minutes even
 * though the save itself had succeeded — the follow-up render was waiting on a
 * dead socket. Bounding every request turns that into an ordinary failure,
 * which the permission layer reports as ServiceUnavailableError and the error
 * boundary offers to retry.
 *
 * Uploads are exempt: a 20 MB Mission Kit file on a slow connection can
 * legitimately take longer than any sensible read timeout.
 */
export const SUPABASE_TIMEOUT_MS = 20_000;

function isUpload(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const url = input instanceof Request ? input.url : String(input);
  return (method === "POST" || method === "PUT") && url.includes("/storage/v1/object/") && !url.includes("/storage/v1/object/sign/");
}

export const boundedFetch: typeof fetch = (input, init) => {
  if (isUpload(input, init)) return fetch(input, init);
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
