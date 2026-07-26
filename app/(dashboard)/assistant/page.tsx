import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata = { title: "Ask Carve" };

export default function AssistantPage() {
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
