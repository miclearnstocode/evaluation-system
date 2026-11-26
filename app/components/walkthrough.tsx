"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type WalkthroughStep = {
  href: string;
  target: string;
  title: string;
  instruction: string;
};

function scrollToFocusBox(target: HTMLElement, coach: HTMLElement | null) {
  const coachInset = coach ? Number.parseFloat(window.getComputedStyle(coach).top) || 0 : 0;
  const clearance = coachInset + (coach?.offsetHeight ?? 0) + 16;
  window.scrollBy({
    top: target.getBoundingClientRect().top - clearance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}

function updateSpotlight(overlay: HTMLDivElement, focusBox: HTMLDivElement, target: HTMLElement | null) {
  const bounds = target?.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  if (!bounds || bounds.bottom <= 0 || bounds.right <= 0 || bounds.top >= height || bounds.left >= width) {
    overlay.hidden = true;
    focusBox.hidden = true;
    return;
  }

  const padding = 8;
  const left = bounds.left - padding;
  const right = bounds.right + padding;
  const top = bounds.top - padding;
  const bottom = bounds.bottom + padding;
  const radius = Math.min(14, (right - left) / 2, (bottom - top) / 2);
  const corner = `A ${radius} ${radius} 0 0 1`;
  const cutout = [
    `M ${left + radius} ${top}`,
    `H ${right - radius} ${corner} ${right} ${top + radius}`,
    `V ${bottom - radius} ${corner} ${right - radius} ${bottom}`,
    `H ${left + radius} ${corner} ${left} ${bottom - radius}`,
    `V ${top + radius} ${corner} ${left + radius} ${top} Z`,
  ].join(" ");

  // An even-odd path leaves the rounded opening clear through the blur layer.
  overlay.style.clipPath = `path(evenodd, "M 0 0 H ${width} V ${height} H 0 Z ${cutout}")`;
  Object.assign(focusBox.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${right - left}px`,
    height: `${bottom - top}px`,
    borderRadius: `${radius}px`,
  });
  overlay.hidden = false;
  focusBox.hidden = false;
}

const WalkthroughContext = createContext<{
  active: boolean;
  startOrResume: () => void;
} | null>(null);

const secondaryButton = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50";
const primaryButton = "rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900";

export function StartWalkthroughButton() {
  const walkthrough = useContext(WalkthroughContext);
  if (!walkthrough) return null;
  return (
    <button type="button" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-teal-950 hover:bg-teal-50" onClick={walkthrough.startOrResume}>
      {walkthrough.active ? "Resume walkthrough" : "Start walkthrough"}
    </button>
  );
}

export default function Walkthrough({ children, steps, tutorialHref }: {
  children: ReactNode;
  steps: readonly WalkthroughStep[];
  tutorialHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const step = index === null ? null : steps[index];
  const onStepPage = pathname.replace(/\/+$/, "") === step?.href;

  const coach = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const focusBoxRef = useRef<HTMLDivElement>(null);
  const selector = onStepPage ? step?.target : undefined;

  useEffect(() => {
    const root = content.current;
    const overlay = overlayRef.current;
    const focusBox = focusBoxRef.current;
    if (!root || !overlay || !focusBox || !selector) return;
    let focusTarget: HTMLElement | null = null;
    let firstScroll = true;
    let frame: number | null = null;

    function queueUpdate() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        highlight();
      });
    }

    const resizeObserver = new ResizeObserver(queueUpdate);
    const highlight = () => {
      const found = root.querySelector<HTMLElement>(selector);
      const next = found && found.getClientRects().length ? found : null;
      if (focusTarget !== next) {
        if (focusTarget) resizeObserver.unobserve(focusTarget);
        if (next) resizeObserver.observe(next);
        focusTarget = next;
      }
      if (next && firstScroll) {
        firstScroll = false;
        scrollToFocusBox(next, coach.current);
      }
      updateSpotlight(overlay, focusBox, next);
    };

    const observer = new MutationObserver(queueUpdate);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    resizeObserver.observe(root);
    window.addEventListener("scroll", queueUpdate, { capture: true, passive: true });
    window.addEventListener("resize", queueUpdate);
    queueUpdate();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", queueUpdate, true);
      window.removeEventListener("resize", queueUpdate);
      overlay.hidden = true;
      focusBox.hidden = true;
    };
  }, [index, selector]);

  function goToStep(next: number) {
    setCompleted(false);
    setIndex(next);
    if (pathname.replace(/\/+$/, "") !== steps[next].href) router.push(steps[next].href);
  }

  function finish() {
    setIndex(null);
    setCompleted(true);
    router.push(tutorialHref);
  }

  return (
    <WalkthroughContext.Provider value={{ active: step !== null, startOrResume: () => goToStep(index ?? 0) }}>
      <div ref={overlayRef} aria-hidden="true" hidden
        className="pointer-events-none fixed inset-0 z-20 bg-slate-950/10 backdrop-blur-sm"
      />
      <div ref={focusBoxRef} aria-hidden="true" hidden
        className="pointer-events-none fixed z-20 box-border border-[3px] border-teal-600"
      />
      {step && index !== null && (
        <aside aria-labelledby="walkthrough-title" ref={coach} className="sticky top-18 z-30 mx-auto mb-5 max-h-[45dvh] max-w-7xl space-y-3 overflow-y-auto rounded-xl border border-teal-300 bg-teal-50 p-4 shadow-sm sm:p-5">
          <div aria-live="polite">
            <p className="text-xs font-semibold text-teal-800">Walkthrough step {index + 1} of {steps.length}</p>
            <h2 id="walkthrough-title" className="mt-1 font-bold text-slate-900">{step.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
              {onStepPage ? step.instruction : "Return to the walkthrough step when you’re ready to continue."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => setIndex(null)}>End walkthrough</button>
            {index > 0 && <button type="button" className={secondaryButton} onClick={() => goToStep(index - 1)}>Back</button>}
            {!onStepPage ? (
              <button type="button" className={primaryButton} onClick={() => goToStep(index)}>Return to step</button>
            ) : index === steps.length - 1 ? (
              <button type="button" className={primaryButton} onClick={finish}>Finish walkthrough</button>
            ) : (
              <button type="button" className={primaryButton} onClick={() => goToStep(index + 1)}>Next step</button>
            )}
          </div>
        </aside>
      )}
      {completed && pathname === tutorialHref && (
        <p role="status" className="mx-auto mb-5 max-w-7xl rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-900">
          Walkthrough complete.
        </p>
      )}
      <div ref={content}>{children}</div>
    </WalkthroughContext.Provider>
  );
}
