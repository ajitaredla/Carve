import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NotchCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card-pop p-6 sm:p-8", className)}>{children}</section>;
}
