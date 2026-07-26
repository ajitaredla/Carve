import Link from "next/link";
import { SignupForm } from "@/app/login/signup-form";
import { CarveLogo } from "@/components/carve-logo";

export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-border"><div className="mx-auto flex max-w-6xl px-5 py-4 sm:px-8"><Link href="/" aria-label="Carve home"><CarveLogo /></Link></div></header>
      <div className="flex flex-1 items-center justify-center px-5 py-12"><SignupForm /></div>
    </main>
  );
}
