"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const TRANSCRIPT = [
  "Shelf space is earned in the details.",
  "Carve brings the readiness factors buyers evaluate into one focused assessment.",
  "Then it shows the one thing most likely to delay your next purchase order.",
  "In this illustrative example, that is fulfillment readiness. Validate production timing and capacity, then decide what to do next.",
  "Ask Carve to explain the facts behind the recommendation.",
  "When you are ready, review buyer-ready drafts built from your saved information. You stay in control.",
  "One assessment. One blocker. A clearer route to your next purchase order.",
];

export function CarveStory() {
  const [isOpen, setIsOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
  const previewRef = useRef<HTMLVideoElement>(null);
  const storyRef = useRef<HTMLVideoElement>(null);
  const watchRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) previewRef.current?.pause();
  }, [reduceMotion]);

  useEffect(() => {
    const video = previewRef.current;
    if (!video || reduceMotion) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden && isPreviewPlaying) {
          void video.play().catch(() => setIsPreviewPlaying(false));
        } else {
          video.pause();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [isPreviewPlaying, reduceMotion]);

  useEffect(() => {
    if (!isOpen) return;
    const preview = previewRef.current;
    const story = storyRef.current;
    preview?.pause();
    const originalOverflow = document.body.style.overflow;
    const watchButton = watchRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], summary, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (story) {
        story.pause();
        story.currentTime = 0;
      }
      if (preview && !reduceMotion && isPreviewPlaying && !document.hidden) {
        void preview.play().catch(() => setIsPreviewPlaying(false));
      }
      watchButton?.focus();
    };
  }, [isOpen, isPreviewPlaying, reduceMotion]);

  const togglePreview = () => {
    const video = previewRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setIsPreviewPlaying(true)).catch(() => setIsPreviewPlaying(false));
    } else {
      video.pause();
      setIsPreviewPlaying(false);
    }
  };

  const previewMotionPlaying = !reduceMotion && isPreviewPlaying;

  return (
    <>
      <section aria-label="Carve product story" className="mt-10 w-full max-w-4xl text-left">
        <div className="overflow-hidden rounded-[24px] border-[1.5px] border-ink bg-ink shadow-[7px_7px_0_var(--ink)]">
          <div className="relative aspect-video bg-warm">
            {reduceMotion ? (
              <Image
                src="/media/carve-teaser-v5-poster.webp"
                alt="Carve product film opening with its retail-readiness promise."
                fill
                sizes="(max-width: 1024px) 100vw, 896px"
                className="object-cover"
              />
            ) : (
              <video
                ref={previewRef}
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                poster="/media/carve-teaser-v5-poster.webp"
                aria-hidden="true"
                tabIndex={-1}
              >
                <source src="/media/carve-teaser-v5-preview.webm" type="video/webm" />
                <source src="/media/carve-teaser-v5-preview.mp4" type="video/mp4" />
              </video>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent px-5 pb-5 pt-16 text-paper sm:px-7 sm:pb-7">
              <p className="font-mono text-[10px] font-semibold tracking-[0.16em] uppercase text-paper/75">Illustrative product film · 50 seconds</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <p className="max-w-md font-display text-2xl leading-tight sm:text-3xl">See how Carve turns facts into a clearer next move.</p>
                <div className="flex flex-wrap items-center gap-3">
                <button
                  ref={watchRef}
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="rounded-full border-[1.5px] border-paper bg-paper px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:bg-orange hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
                >
                  Watch the 50-second film
                </button>
                {!reduceMotion ? <button type="button" onClick={togglePreview} className="rounded-full border border-paper/80 px-3 py-2 text-xs font-semibold text-paper hover:bg-paper/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper">{previewMotionPlaying ? "Pause motion" : "Play motion"}</button> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => setIsOpen(false)}>
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="carve-story-title"
            className="max-h-[94vh] w-full max-w-5xl overflow-auto rounded-[24px] border-[1.5px] border-ink bg-paper p-4 shadow-[8px_8px_0_var(--ink)] sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-5">
              <div>
                <p className="carve-label">Illustrative Carve product film</p>
                <h2 id="carve-story-title" className="mt-1 font-display text-2xl font-medium sm:text-3xl">One assessment. One clear next move.</h2>
              </div>
              <button ref={closeRef} type="button" onClick={() => setIsOpen(false)} className="shrink-0 rounded-full border-[1.5px] border-ink px-4 py-2 text-sm font-semibold hover:bg-warm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange">
                Close
              </button>
            </div>
            <video ref={storyRef} controls playsInline poster="/media/carve-teaser-v5-poster.webp" className="aspect-video w-full rounded-xl bg-ink" preload="metadata">
              <source src="/media/carve-teaser-review-v5.mp4" type="video/mp4" />
              <track kind="captions" src="/media/carve-product-story.vtt" srcLang="en" label="English" default />
              Your browser does not support video playback.
            </video>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">This walkthrough uses fictional demo data. Your assessment is based on your brand facts and the retailer you choose. Carve prepares drafts for your review; it does not send or submit anything for you.</p>
            <details className="mt-4 rounded-xl border border-line bg-warm p-4 text-sm text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-ink">Read transcript</summary>
              <div className="mt-3 space-y-3 leading-relaxed">{TRANSCRIPT.map((line) => <p key={line}>{line}</p>)}</div>
            </details>
          </section>
        </div>
      ) : null}
    </>
  );
}
