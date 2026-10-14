import { describePath, SCREEN_REFS } from "./field-labels";

/**
 * VALIDATION MESSAGES IN THE AUTHOR'S WORDS.
 *
 * The engine validates with zod, and zod reports `options.0.next: Invalid
 * input: expected string, received undefined`. That is exact and useless to
 * someone who has never seen the schema. This turns one issue into a sentence
 * naming the field as the form labels it ("Option 1 → Goes to needs a
 * destination screen.").
 *
 * It changes WORDING only. Nothing here decides whether something is valid —
 * the same schemas still refuse the same input, and every caller still
 * refuses to save when there is an issue.
 */

type Issue = {
  code?: string;
  path?: readonly PropertyKey[];
  message?: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  expected?: string;
  values?: readonly unknown[];
  keys?: readonly string[];
};

const lastField = (path: readonly PropertyKey[]) =>
  [...path].reverse().find((p): p is string => typeof p === "string") ?? "";

/** What a missing or empty field needs, by what it is. */
function needs(field: string): string {
  if (SCREEN_REFS.has(field)) return "a destination screen";
  if (field === "key" || field === "id") return "a name";
  if (field === "label" || field === "title") return "some text";
  return "a value";
}

/** One zod issue as a plain sentence. `where` is the default subject. */
export function friendlyIssue(issue: Issue, where = "This screen's settings"): string {
  const path = issue.path ?? [];
  const subject = describePath(path) || where;
  const field = lastField(path);

  switch (issue.code) {
    case "invalid_type":
      if (/received undefined|received null/.test(issue.message ?? "")) return `${subject} needs ${needs(field)}.`;
      return `${subject} should be ${issue.expected === "number" ? "a number" : issue.expected === "boolean" ? "yes or no" : issue.expected === "array" ? "a list" : `a ${issue.expected ?? "different kind of value"}`}.`;
    case "too_small":
      if (issue.origin === "string") return `${subject} needs ${needs(field)}.`;
      if (issue.origin === "array") return `${subject}: add at least ${String(issue.minimum)}.`;
      return `${subject} must be ${issue.inclusive === false ? "more than" : "at least"} ${String(issue.minimum)}.`;
    case "too_big":
      if (issue.origin === "string") return `${subject} is too long (at most ${String(issue.maximum)} characters).`;
      if (issue.origin === "array") return `${subject} has too many (at most ${String(issue.maximum)}).`;
      return `${subject} must be ${issue.inclusive === false ? "less than" : "at most"} ${String(issue.maximum)}.`;
    case "invalid_value":
      return `${subject} must be one of: ${(issue.values ?? []).map(String).join(", ")}.`;
    case "unrecognized_keys":
      return `${subject} has a setting the Academy doesn't recognise: ${(issue.keys ?? []).join(", ")}. Remove it under Advanced.`;
    case "invalid_union":
      return `${subject} isn't in a form the Academy recognises.`;
    case "invalid_format":
      return `${subject} isn't in the expected format.`;
    default:
      // `custom` and anything else: the schema's own message is already prose.
      return describePath(path) ? `${subject}: ${issue.message ?? "not valid"}` : (issue.message ?? `${where} isn't valid.`);
  }
}

/** The first issue of a failed parse, or a fallback. */
export function friendlyFirstIssue(issues: readonly Issue[] | undefined, where?: string): string {
  const first = issues?.[0];
  return first ? friendlyIssue(first, where) : `${where ?? "This"} isn't valid.`;
}
