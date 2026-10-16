import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { importUploads } from "@/features/journal/import-run";
import { IMPORT_BODY_LIMIT } from "@/features/journal/medium";
import { AccessError } from "@/lib/permissions";
import { requireJournalEditor } from "@/lib/permissions/journal";
import { logAccessDenied } from "@/lib/observability/logger";

/**
 * POST /editorial/import/upload — a Medium import, uploaded with progress.
 *
 * A route handler rather than a server action: server actions stop at 1 MB,
 * which real exports exceed. The request still carries no authority of its
 * own: the editor's session is re-checked here, and every write inside the
 * import goes through the database with that session (D-129).
 *
 * Route handlers get none of the origin checking server actions have, so it
 * is done here: a cross-site form cannot start an import. Bodies are capped
 * below the proxy's 10 MB buffer (larger exports are reduced to their posts
 * in the browser first), so a request is never silently truncated.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: "This import must be started from the Journal studio." }, { status: 403 });
  }

  let staff;
  try {
    staff = await requireJournalEditor();
  } catch (e) {
    if (e instanceof AccessError) {
      logAccessDenied("journal_import", { reason: e.reason });
      return NextResponse.json({ error: "Only an editor can import." }, { status: 403 });
    }
    throw e;
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > IMPORT_BODY_LIMIT) {
    return NextResponse.json({ error: "That upload is too large for one import. Choose fewer posts and import the rest afterwards." }, { status: 413 });
  }
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Choose Medium's export .zip, or post .html files." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload didn't arrive complete. Try again." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const result = await importUploads(staff.supabase, files, { includeDrafts: form.get("includeDrafts") === "1" });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  revalidatePath("/editorial");
  revalidatePath("/editorial/import");
  return NextResponse.json({ runId: result.runId }, { headers: { "Cache-Control": "no-store" } });
}
