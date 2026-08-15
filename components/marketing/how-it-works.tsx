function BrowserChrome({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b-[1.5px] border-ink bg-warm px-3 py-2.5">
      <span className="size-1.5 rounded-full bg-line" />
      <span className="size-1.5 rounded-full bg-line" />
      <span className="size-1.5 rounded-full bg-line" />
      <span className="ml-2 font-mono text-[9.5px] text-muted-foreground">{path}</span>
    </div>
  );
}

function IntakePreview() {
  return (
    <div className="flex min-h-[148px] flex-col justify-center gap-2 p-4" aria-hidden="true">
      <span className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">Wholesale price</span>
      <div className="h-[22px] rounded-md border-[1.3px] border-line bg-paper" />
      <span className="mt-1.5 font-mono text-[9px] tracking-wide text-muted-foreground uppercase">Distributor</span>
      <div className="h-[22px] rounded-md border-[1.3px] border-line bg-paper" />
    </div>
  );
}

function ScorePreview() {
  return (
    <div className="flex min-h-[148px] flex-col justify-center gap-3 p-4" aria-hidden="true">
      <div className="flex items-center gap-3.5">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-full"
          style={{ background: "conic-gradient(var(--orange) 0deg 252deg, var(--line) 252deg 360deg)" }}
        >
          <span className="grid size-[42px] place-items-center rounded-full bg-card font-mono text-[13px] font-bold">70</span>
        </span>
        <span className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">Readiness score</span>
      </div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-rust bg-orange-lt px-2.5 py-1 font-mono text-[10.5px] text-rust">
        ● Fulfillment readiness
      </span>
    </div>
  );
}

function DocumentsPreview() {
  return (
    <div className="flex min-h-[148px] items-center justify-center p-4" aria-hidden="true">
      <div className="relative h-[70px] w-[110px]">
        <div className="absolute top-3 left-0 h-[52px] w-[70px] -rotate-6 rounded-md border-[1.3px] border-ink bg-paper p-1.5">
          <div className="h-1 w-full rounded-full bg-line" />
          <div className="mt-1 h-1 w-3/5 rounded-full bg-line" />
        </div>
        <div className="absolute top-1 left-7 h-[52px] w-[70px] rotate-2 rounded-md border-[1.3px] border-ink bg-paper p-1.5">
          <div className="h-1 w-full rounded-full bg-line" />
          <div className="mt-1 h-1 w-3/5 rounded-full bg-line" />
        </div>
        <div className="absolute top-3.5 left-14 h-[52px] w-[70px] rotate-[9deg] rounded-md border-[1.3px] border-ink bg-card p-1.5">
          <div className="h-1 w-full rounded-full bg-line" />
          <div className="mt-1 h-1 w-3/5 rounded-full bg-line" />
        </div>
      </div>
    </div>
  );
}

const FRAMES = [
  { path: "carve.app/intake", preview: IntakePreview, number: "01", title: "Answer one practical intake", description: "Share the pricing, operations, certifications, and distribution facts buyers evaluate." },
  { path: "carve.app/assessment", preview: ScorePreview, number: "02", title: "Find the one blocker", description: "Carve scores your readiness and focuses attention on the most important action." },
  { path: "carve.app/documents", preview: DocumentsPreview, number: "03", title: "Prepare the next move", description: "Model your unit economics and build buyer-ready materials from your saved facts." },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <p className="carve-label">How Carve works</p>
      <h2 className="mt-4 max-w-2xl font-display text-4xl font-medium tracking-tight sm:text-5xl">What you&apos;ll actually see.</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {FRAMES.map(({ path, preview: Preview, number, title, description }) => (
          <div key={number}>
            <div className="overflow-hidden rounded-[18px] border-[1.5px] border-ink bg-card shadow-[5px_5px_0_var(--ink)]">
              <BrowserChrome path={path} />
              <Preview />
            </div>
            <p className="mt-4 font-mono text-sm text-muted-foreground">{number}</p>
            <h3 className="mt-1 font-display text-2xl font-medium">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
