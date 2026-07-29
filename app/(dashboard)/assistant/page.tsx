import Link from "next/link";
import { getCurrentFounderAndBrand } from "@/lib/auth/current-brand";
import { AccountNotProvisioned } from "@/components/account-not-provisioned";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata = { title: "Ask Carve" };

export default async function AssistantPage() {
  const founder = await getCurrentFounderAndBrand();

  if (!founder) {
    return <AccountNotProvisioned redirectTo="/assistant" />;
  }

  if (!founder.brand) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          No brand yet
        </h1>
        <p className="text-muted-foreground">
          Set up your brand and run your first assessment before asking Carve
          questions about it.
        </p>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          render={<Link href="/assessment/new">Get started</Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div className="space-y-2">
        <p className="font-mono text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Your retail copilot</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em]">Make your next move clearer.</h1>
        <p className="max-w-2xl text-muted-foreground">Carve can explain the information already in your workspace and help you decide what to do next.</p>
      </div>
      <AssistantChat initialMessages={[]} />
    </div>
  );
}
