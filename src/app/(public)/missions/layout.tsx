import type { Metadata } from "next";
import { PublicFooter } from "@/components/public-site/public-site";

/*
 * TEMPORARY stand-in for the Lovable Missions pages (D-109). Not approved as
 * production marketing, so it asks not to be indexed. The footer lives here
 * rather than in the public layout so no other public page changes.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicFooter />
    </>
  );
}
