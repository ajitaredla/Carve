"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, MessageCircle, Sparkles, X } from "lucide-react";
import { askCarve, type AssistantMessage } from "@/actions/assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STARTERS = [
  "What is most likely to block my next PO?",
  "What should I do before approaching this retailer?",
  "Explain my latest score in plain language.",
] as const;

/**
 * Floating bottom-right chat widget — replaces the old dedicated /assistant
 * page. Only mounted by (dashboard)/layout.tsx when the signed-in founder
 * has a brand (see DashboardLayout): every quick-start question and the
 * assistant itself depend on brand context, so there's nothing useful to
 * offer before that exists.
 */
export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

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

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open Ask Carve"
        className="fixed right-6 bottom-6 z-50 flex size-14 items-center justify-center rounded-full border border-ink bg-ink text-paper shadow-[4px_4px_0_var(--border)] transition hover:-translate-y-0.5"
      >
        <MessageCircle className="size-6" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Ask Carve"
      className="fixed right-6 bottom-6 z-50 flex h-[32rem] max-h-[calc(100vh-3rem)] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[6px_6px_0_var(--border)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-accent">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Ask Carve</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Uses your saved brand profile and assessments.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Close Ask Carve"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ask about your scores, retailer preparation, margin, fulfillment, or the next action for your brand.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
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
            <article
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl border border-border bg-muted px-3 py-2"
                  : "max-w-[90%] rounded-2xl border border-border bg-background px-3 py-2"
              }
            >
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {message.role === "user" ? "You" : "Carve"}
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              {message.sources.length > 0 ? (
                <p className="mt-2 text-[10px] text-muted-foreground">Based on: {message.sources.join(" · ")}</p>
              ) : null}
            </article>
          ))
        )}
        {isPending ? <p className="text-xs text-muted-foreground">Carve is checking your brand context…</p> : null}
      </div>

      <form onSubmit={submit} className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:ring-3 focus-within:ring-ring/30">
          <Textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about your retail plan…"
            maxLength={1200}
            className="min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label="Ask Carve a question"
          />
          <Button type="submit" size="icon" disabled={!question.trim() || isPending} aria-label="Send question">
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
        {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}
