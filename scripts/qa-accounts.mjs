/**
 * Staging QA review accounts — the credentials are NEVER in this repository.
 *
 * A = admin (is_admin), B = parent, C = family (a second, separate parent).
 *
 * Read, in this order:
 *   1. environment variables WLA_QA_<A|B|C>_EMAIL and WLA_QA_<A|B|C>_PASSWORD;
 *   2. the private recovery file `.env.staging-qa` at the repository root —
 *      git-ignored (`.env*`), and refused unless only its owner can read it
 *      (chmod 600).
 *
 * Nothing here prints a value. A missing credential names only the variable.
 * See docs/REVIEW-ACCESS-PACK.md §1 for how to obtain access.
 */
import { readFileSync, statSync } from "node:fs";

export const QA_FILE = new URL("../.env.staging-qa", import.meta.url);
const LABEL = { admin: "A", parent: "B", family: "C" };

// undefined: not read yet · null: no file · object: its values. A refused file
// is never cached, so every call re-checks it and refuses with the same reason.
let fileValues;
function fromFile(file) {
  if (fileValues !== undefined) return fileValues;
  let mode;
  try {
    mode = statSync(file).mode;
  } catch {
    fileValues = null; // no file: environment variables only
    return null;
  }
  if (mode & 0o077) {
    throw new Error(`${file.pathname ?? file} is readable by other users; run: chmod 600 .env.staging-qa`);
  }
  fileValues = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^(WLA_QA_[ABC]_(?:EMAIL|PASSWORD))=(.*)$/.exec(line.trim());
    if (m) fileValues[m[1]] = m[2];
  }
  return fileValues;
}

/**
 * [email, password] for one QA account.
 * @param {"admin" | "parent" | "family"} role
 * @param {{ env?: Record<string, string | undefined>, file?: URL | string }} [opts] for tests
 */
export function qaAccount(role, { env = process.env, file = QA_FILE } = {}) {
  const label = LABEL[role];
  if (!label) throw new Error(`unknown QA account role: ${role}`);
  const keys = [`WLA_QA_${label}_EMAIL`, `WLA_QA_${label}_PASSWORD`];
  const values = keys.map((k) => env[k] || fromFile(file)?.[k] || "");
  const missing = keys.filter((_, i) => !values[i]);
  if (missing.length) {
    throw new Error(`staging QA account ${label} (${role}) is not configured: set ${missing.join(" and ")}, or create the private .env.staging-qa (docs/REVIEW-ACCESS-PACK.md §1)`);
  }
  return values;
}

/** Test hook: forget the cached file. */
export function resetQaAccountCache() {
  fileValues = undefined;
}
