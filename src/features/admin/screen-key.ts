/**
 * A screen key suggested from its title.
 *
 * Keys are how screens point at each other, so they must match the rule
 * saveScreenAction enforces (lower-case words joined by underscores) and must
 * not collide: `admin_upsert_screen` saves BY KEY, so a new screen given an
 * existing key would replace that screen. The suggestion is therefore always
 * unused; the server refuses a clash as well (D-117).
 */
export const SCREEN_KEY_RULE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export function suggestScreenKey(title: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .split("_")
      .filter(Boolean)
      .slice(0, 5)
      .join("_")
      .slice(0, 40)
      .replace(/_+$/g, "") || "screen";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}
