import { cn } from "@/lib/utils";

export function CarveLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true">
        <path d="M4 4 H19 L28 13 V28 H4 Z" fill="currentColor" />
        <path d="M22 3 L29 10 L29 3 Z" fill="var(--orange)" />
      </svg>
      <span className="font-mono text-[15px] font-medium tracking-[0.05em]">CARVE</span>
    </span>
  );
}
