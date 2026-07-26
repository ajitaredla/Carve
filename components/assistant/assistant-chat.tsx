"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { askCarve, type AssistantMessage } from "@/actions/assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STARTERS = [
  "What is most likely to block my next PO?",
  "What should I do before approaching this retailer?",
  "Explain my latest score in plain language.",
] as const;

export function AssistantChat({ initialMessages }: { initialMessages: AssistantMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || isPending) return;

    const optimistic: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: text,
      sources: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setQuestion("");
    setError(null);

    startTransition(async () => {
      const result = await askCarve({ question: text, conversationId });
      if (result.status === "error") {
        setMessages((current) => current.filter((message) => message.id !== optimistic.id));
        setQuestion(text);
        setError(result.message);
        return;
      }
      setConversationId(result.conversationId);
      setMessages((current) => [...current, ...result.messages]);
      inputRef.current?.focus();
    });
  }

  return (
    <div className="rounded-3xl border border-border bg-card shadow-[6px_6px_0_var(--border)]">
      <div className="flex items-start gap-3 border-b border-border p-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-accent">
          <Sparkles className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Ask Carve</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Answers use your saved brand profile and assessments. Review important decisions before acting.
          </p>
        </div>
      </div>

      <div className="min-h-96 space-y-5 p-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-4 py-6">
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              Ask about your scores, retailer preparation, margin, fulfillment, or the next action for your brand.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="rounded-full border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setQuestion(starter);
                    inputRef.current?.focus();
                  }}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-2xl border border-border bg-muted px-4 py-3" : "max-w-[90%] rounded-2xl border border-border bg-background px-4 py-3"}>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {message.role === "user" ? "You" : "Carve"}
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              {message.sources.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Based on: {message.sources.join(" · ")}</p>
              ) : null}
            </article>
          ))
        )}
        {isPending ? <p className="text-sm text-muted-foreground">Carve is checking your brand context…</p> : null}
      </div>

      <form onSubmit={submit} className="border-t border-border p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:ring-3 focus-within:ring-ring/30">
          <Textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about your retail plan…"
            maxLength={1200}
            className="min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label="Ask Carve a question"
          />
          <Button type="submit" size="icon" disabled={!question.trim() || isPending} aria-label="Send question">
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}
