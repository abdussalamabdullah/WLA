// Re-encrypt every active child code copy under the current key (D-143).
//
//   CHILD_CODE_ENCRYPTION_KEY=<new> CHILD_CODE_ENCRYPTION_KEY_PREVIOUS=<old> \
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/rotate-child-code-key.ts
//
// Safe to run again: a copy already under the new key is left alone, and a
// credential replaced meanwhile fails its compare-and-swap harmlessly. Prints
// counts only. See docs/CHILD-CODE-ENCRYPTION.md.
// @ts-expect-error -- Node runs this file directly, which needs the extension.
import { CodeCopyError, isUnderCurrentKey, keysFromEnv, resealCode } from "../src/features/child-auth/code-crypto.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const keys = keysFromEnv();
if (!keys.current) throw new Error("Set CHILD_CODE_ENCRYPTION_KEY to the new key.");

const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const table = `${url.replace(/\/$/, "")}/rest/v1/child_access_credentials`;

const list = await fetch(
  `${table}?select=id,child_id,code_ciphertext&revoked_at=is.null&code_ciphertext=not.is.null`,
  { headers },
);
if (!list.ok) throw new Error(`Couldn't read the copies (HTTP ${list.status}).`);
const rows = (await list.json()) as { id: string; child_id: string; code_ciphertext: string }[];

let moved = 0, already = 0, unreadable = 0, failed = 0;
for (const row of rows) {
  if (isUnderCurrentKey(row.code_ciphertext, keys)) { already++; continue; }
  try {
    const sealed = resealCode(row.code_ciphertext, { childId: row.child_id, credentialId: row.id }, keys);
    const swap = await fetch(
      `${table}?id=eq.${row.id}&code_ciphertext=eq.${encodeURIComponent(row.code_ciphertext)}&revoked_at=is.null`,
      { method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ code_ciphertext: sealed }) },
    );
    if (swap.ok) moved++; else failed++;
  } catch (error) {
    if (error instanceof CodeCopyError) unreadable++; else failed++;
  }
}
console.log(JSON.stringify({ total: rows.length, moved, already, unreadable, failed }));
if (failed > 0 || unreadable > 0) process.exitCode = 1;
