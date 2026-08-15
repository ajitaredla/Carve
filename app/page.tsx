import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CarveLogo } from "@/components/carve-logo";
import { CarveStory } from "@/components/marketing/carve-story";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { NotchCard } from "@/components/notch-card";

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
          <CarveStory />
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

      <HowItWorks />

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-[6px_6px_0_var(--border)] sm:p-8">
          <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Carve workspace</p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Ready to find the clearest route to your next PO?</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You review every recommendation before you act. Carve organises your
            existing facts into a clear next step — it does not submit
            applications or send materials without you.
          </p>
          <Button className="w-full bg-orange text-primary-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:bg-orange/90" render={<Link href="/login" />}>
            Sign in to Carve <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>
      <footer className="border-t border-border py-8"><p className="text-center font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Shelf space isn&apos;t given · It&apos;s carved out</p></footer>
    </main>
  );
}
