import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { CarveLogo } from "@/components/carve-logo";

// Top-level sections from the v1 task list (tasks-carve-v1.md). These routes
// don't all exist yet — later tasks (2.0+) build the pages themselves — this
// nav just establishes where they'll live.
const NAV_LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/assessment/new", label: "New assessment" },
  { href: "/assistant", label: "Ask Carve" },
  { href: "/outcomes", label: "Outcomes" },
] as const;

export function Nav({ userEmail }: { userEmail: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" aria-label="Carve dashboard"><CarveLogo /></Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {userEmail}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
