/**
 * ACADEMY SHELL.
 *
 * Deliberately renders no header. Each page renders <AcademyChrome /> itself,
 * choosing the default or quiet variant — Active Mission needs the quiet one
 * (UI/UX §17), and nested layouts in Next.js compose rather than replace, so a
 * header here would stack above it.
 */
export default function AcademyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh">{children}</div>;
}
