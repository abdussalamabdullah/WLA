import { ok, preflight, unavailable } from "@/features/journal/http";
import { listPublicCategories } from "@/features/journal/public-api";

/** GET /api/journal/categories — the Journal's sections, in editorial order. */
export async function GET() {
  try {
    return ok({ data: await listPublicCategories() });
  } catch (e) {
    return unavailable(e, "categories");
  }
}

export const OPTIONS = preflight;
