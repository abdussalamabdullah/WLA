/**
 * Search as a plain GET form.
 *
 * No client state and no debounce: the result is a URL an admin can bookmark
 * and share with a colleague, and it works with JavaScript disabled. A
 * keystroke-by-keystroke search would send every prefix of an email address to
 * the server for no gain.
 */
export function AdminSearch({
  placeholder,
  defaultValue,
  name = "q",
}: {
  placeholder: string;
  defaultValue?: string;
  name?: string;
}) {
  return (
    <form role="search" className="flex flex-wrap gap-[var(--space-s)]">
      <label htmlFor="admin-search" className="sr-only">{placeholder}</label>
      <input
        id="admin-search"
        type="search"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="min-h-[var(--target-min)] min-w-[240px] flex-1 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      />
      <button
        type="submit"
        className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-button)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-m)] text-[length:var(--text-label)] hover:bg-[var(--color-surface-raised)]"
      >
        Search
      </button>
    </form>
  );
}
