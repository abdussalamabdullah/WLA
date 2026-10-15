import { ok, preflight, unavailable } from "@/features/journal/http";
import { listPublicTags } from "@/features/journal/public-api";

/** GET /api/journal/tags — tags used by at least one published article. */
export async function GET() {
  try {
    return ok({ data: await listPublicTags() });
  } catch (e) {
    return unavailable(e, "tags");
  }
}

export const OPTIONS = preflight;
