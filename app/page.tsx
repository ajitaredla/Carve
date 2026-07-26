import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CarveLogo } from "@/components/carve-logo";
import { NotchCard } from "@/components/notch-card";

const STEPS = [
  ["01", "Answer one practical intake", "Share the pricing, operations, certifications, and distribution facts buyers evaluate."],
  ["02", "Find the one blocker", "Carve scores your readiness and focuses attention on the most important action."],
  ["03", "Prepare the next move", "Model your unit economics and build buyer-ready materials from your saved facts."],
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="border-b border-border bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Carve home"><CarveLogo /></Link>
          <Button variant="outline" size="sm" render={<Link href="/login" />}>Sign in</Button>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(232,98,42,0.12),transparent_70%)]" />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-5 py-16 text-center sm:px-8 md:py-24">
          <p className="chip mb-7"><span className="chip-dot" /> Retail readiness for CPG founders</p>
          <h1 className="max-w-4xl font-display text-5xl font-medium leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Shelf space isn&apos;t given.<br />
            <span className="underline-scribble italic">It&apos;s carved out.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
            Carve shows emerging CPG brands the single thing most likely to delay
            their next purchase order, then helps them take the next practical step.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {['Pricing', 'Distribution', 'Operations', 'Certifications'].map((item) => <span key={item} className="chip">{item}</span>)}
          </div>
          <NotchCard className="mt-10 w-full max-w-md text-left">
            <p className="carve-label">Start here</p>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              Complete one assessment. Carve will identify the clearest action to
              improve your retailer readiness.
            </p>
            <Button className="mt-5 w-full bg-orange text-primary-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:bg-orange/90" render={<Link href="/login" />}>
              Start an assessment <ArrowRight aria-hidden="true" />
            </Button>
          </NotchCard>
          <div className="mt-10 flex flex-wrap justify-center gap-x-7 gap-y-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            <span>One blocker at a time</span><span>Grounded in your facts</span><span>Buyer-ready materials</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <p className="carve-label">How Carve works</p>
        <h2 className="mt-4 max-w-2xl font-display text-4xl font-medium tracking-tight sm:text-5xl">Practical preparation, not generic advice.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map(([number, title, description]) => (
            <article key={number} className="card-flat p-6">
              <p className="font-mono text-sm text-muted-foreground">{number}</p>
              <h3 className="mt-12 font-display text-2xl font-medium">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-warm">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:px-8">
          <p className="carve-label">Your decision, better prepared</p>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-medium tracking-tight sm:text-5xl">You review every recommendation before you act.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Carve organises your existing facts into a clear next step. It does not submit applications or send materials without you.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
        <h2 className="mx-auto max-w-2xl font-display text-4xl font-medium tracking-tight sm:text-5xl">Ready to find the clearest route to your next PO?</h2>
        <Button className="mt-7 bg-orange text-primary-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:bg-orange/90" render={<Link href="/login" />}>Sign in to Carve <ArrowRight aria-hidden="true" /></Button>
      </section>
      <footer className="border-t border-border py-8"><p className="text-center font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Shelf space isn&apos;t given · It&apos;s carved out</p></footer>
    </main>
  );
}
