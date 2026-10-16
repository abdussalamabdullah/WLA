"use client";

import { unzip } from "fflate";

import { IMPORT_BODY_LIMIT, MAX_EXPORT_PICK_BYTES } from "./import-limits";

/**
 * MEDIUM IMPORT, browser side. Medium's export .zip carries far more than the
 * posts (followers, lists, highlights…). When the picked files are too large
 * for one request, the .zip is opened HERE and only posts/*.html travel; the
 * server reads them exactly as it reads posts from a .zip (medium.ts), with
 * every safeguard unchanged.
 */
export type PreparedImport = { files: File[]; reduced: boolean } | { error: string };

const POST = /(^|\/)posts\/[^/]+\.html?$/i;

export async function prepareImport(picked: File[]): Promise<PreparedImport> {
  const usable = picked.filter((f) => /\.(zip|html?)$/i.test(f.name));
  if (usable.length === 0) return { error: "Choose Medium's export .zip, or post .html files from its posts folder." };
  const total = usable.reduce((n, f) => n + f.size, 0);
  if (total > MAX_EXPORT_PICK_BYTES) return { error: "That is larger than 200 MB, which is more than a Medium export should be. Check you chose the right file." };
  if (total <= IMPORT_BODY_LIMIT) return { files: usable, reduced: false };

  const out: File[] = [];
  for (const f of usable) {
    if (!/\.zip$/i.test(f.name)) {
      out.push(f);
      continue;
    }
    const entries = await new Promise<Record<string, Uint8Array> | null>((resolve) => {
      f.arrayBuffer().then((buf) =>
        unzip(new Uint8Array(buf), { filter: (e) => POST.test(e.name) }, (err, data) => resolve(err ? null : data)),
      );
    });
    if (!entries) return { error: `${f.name} isn't a readable .zip file.` };
    for (const [name, bytes] of Object.entries(entries)) {
      out.push(new File([bytes as BlobPart], name.split("/").pop() ?? name, { type: "text/html" }));
    }
  }
  if (out.length === 0) return { error: "No posts were found in that export. Is it Medium's .zip?" };
  const reducedTotal = out.reduce((n, f) => n + f.size, 0);
  if (reducedTotal > IMPORT_BODY_LIMIT) {
    return { error: `The posts add up to ${(reducedTotal / 1048576).toFixed(1)} MB, more than one import can take. Choose some of the .html files from the posts folder, import them, then import the rest.` };
  }
  return { files: out, reduced: true };
}

/** POST to the import route with upload progress. Resolves with the run id. */
export function sendImport(files: File[], includeDrafts: boolean, onProgress: (fraction: number) => void): Promise<{ runId: string } | { error: string }> {
  return new Promise((resolve) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    if (includeDrafts) fd.append("includeDrafts", "1");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/editorial/import/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { runId?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON: a proxy or sign-in page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.runId) resolve({ runId: body.runId });
      else resolve({ error: body.error ?? (xhr.status === 401 || xhr.status === 403 ? "Your session has expired. Sign in again, then retry." : "The import couldn't be completed. Try again.") });
    };
    xhr.onerror = () => resolve({ error: "The upload was interrupted. Check your connection and try again." });
    xhr.send(fd);
  });
}
