import { AcademyShell } from "@/components/academy/academy-shell";

/**
 * ACCOUNT SHELL.
 *
 * Brief §18 / §6.1: the parent's experience should be "available when needed
 * without turning the Academy into a parent dashboard." The account pages stay
 * plain; what they share with the rest of the parent's Academy is its shell —
 * My Missions, Mission Board, Account, Help, Log out and the child switcher.
 *
 * It used to render a header of its own, so opening Account dropped the parent
 * out of their navigation. One shell, one place it is defined.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AcademyShell audience="parent">{children}</AcademyShell>;
}
