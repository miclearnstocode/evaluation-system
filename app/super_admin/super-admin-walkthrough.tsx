"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const steps = [
  {
    href: "/super_admin/survey-builder",
    target: "#survey-editor",
    title: "Build a survey",
    instruction: "Use the survey editor to add a title, a section, and at least one question. Use Preview to check the form, then select Save draft at the bottom of the editor.",
  },
  {
    href: "/super_admin/survey-builder",
    target: "#saved-surveys",
    title: "Publish the survey",
    instruction: "In Saved surveys, find your draft and select Publish. A published survey is available when you create a cycle.",
  },
  {
    href: "/super_admin/cycles",
    target: '[aria-labelledby="create-cycle-title"]',
    title: "Set up a cycle",
    instruction: "Enter a name, choose a published survey, and set the opening and closing times. Review the same-campus option and select Save cycle.",
  },
  {
    href: "/super_admin/cycles",
    target: '[aria-labelledby="cycle-directory-title"]',
    title: "Adjust dates and open the cycle",
    instruction: "Find your cycle in the directory. To reschedule it, choose Edit dates and then Save changes. Select Open cycle when the draft is ready.",
  },
  {
    href: "/super_admin/submissions",
    target: '[aria-labelledby="review-targets-title"]',
    title: "Check submissions",
    instruction: "Use the cycle selector above, then choose an office in the highlighted list. Review its submitted and pending counts. Select a diagram marker to find that evaluator’s row.",
  },
  {
    href: "/super_admin/standing",
    target: "#standing-cycle-filter",
    title: "Review live office scores",
    instruction: "Choose a cycle in the highlighted selector. Select an office in the table below to see section averages and numbered evaluator scores.",
  },
  {
    href: "/super_admin/results",
    target: '[aria-label="Result filters"]',
    title: "Choose a cycle to review",
    instruction: "Select an evaluation cycle. Use Cycle summary to compare offices or Office details to review one office.",
  },
  {
    href: "/super_admin/results",
    target: "#generate-cycle-summary",
    title: "Generate the cycle summary",
    instruction: "In Cycle summary, select Generate summary. Use the charts to compare office scores, submission counts, and evaluator roles.",
  },
  {
    href: "/super_admin/comments",
    target: '[aria-label="Comment filters"]',
    title: "Read comments by office",
    instruction: "Use the highlighted filters to choose a cycle and office. The combined feedback appears below.",
  },
  {
    href: "/super_admin/cycles",
    target: '[aria-labelledby="cycle-directory-title"]',
    title: "Close the cycle",
    instruction: "After the scheduled closing time, find the cycle in the directory and select Close cycle. If the cycle is still running, leave it open and finish the walkthrough.",
  },
] as const;

function scrollToFocusBox(target: HTMLElement, coach: HTMLElement | null) {
  const coachInset = coach ? Number.parseFloat(window.getComputedStyle(coach).top) || 0 : 0;
  const clearance = coachInset + (coach?.offsetHeight ?? 0) + 16;
  window.scrollBy({
    top: target.getBoundingClientRect().top - clearance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}

function updateSpotlight(overlay: HTMLDivElement, target: HTMLElement | null) {
  const bounds = target?.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  if (!bounds || bounds.bottom <= 0 || bounds.right <= 0 || bounds.top >= height || bounds.left >= width) {
    overlay.hidden = true;
    return;
  }

  // Keep the outline crisp by including it inside the cutout.
  const inset = 8;
  const left = Math.max(0, bounds.left - inset);
  const right = Math.min(width, bounds.right + inset);
  const top = Math.max(0, bounds.top - inset);
  const bottom = Math.min(height, bounds.bottom + inset);
  const hole = `${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px`;

  // The even-odd fill cuts the inner rectangle out of the viewport-sized polygon.
  overlay.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole})`;
  overlay.hidden = false;
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

export default function SuperAdminWalkthrough({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const step = index === null ? null : steps[index];
  const onStepPage = pathname.replace(/\/+$/, "") === step?.href;

  const coach = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<HTMLElement | null>(null);
  const selector = onStepPage ? step?.target : undefined;

  useEffect(() => {
    const root = content.current;
    const overlay = overlayRef.current;
    if (!root || !overlay || !selector) return;
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
      const previous = focusTarget.current;
      if (previous !== next) {
        if (previous) {
          previous.removeAttribute("data-tour-focused");
          resizeObserver.unobserve(previous);
        }
        if (next) {
          next.setAttribute("data-tour-focused", "");
          resizeObserver.observe(next);
        }
        focusTarget.current = next;
      }
      if (next && firstScroll) {
        firstScroll = false;
        scrollToFocusBox(next, coach.current);
      }
      updateSpotlight(overlay, next);
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
      focusTarget.current?.removeAttribute("data-tour-focused");
      focusTarget.current = null;
      overlay.hidden = true;
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
    router.push("/super_admin/tutorial");
  }

  return (
    <WalkthroughContext.Provider value={{ active: step !== null, startOrResume: () => goToStep(index ?? 0) }}>
      <div ref={overlayRef} aria-hidden="true" hidden
        className="pointer-events-none fixed inset-0 z-20 bg-slate-950/10 backdrop-blur-sm"
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
      {completed && pathname === "/super_admin/tutorial" && (
        <p role="status" className="mx-auto mb-5 max-w-7xl rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-900">
          Walkthrough complete.
        </p>
      )}
      <div ref={content} className="[&_[data-tour-focused]]:outline-3 [&_[data-tour-focused]]:outline-offset-4 [&_[data-tour-focused]]:outline-teal-600">
        {children}
      </div>
    </WalkthroughContext.Provider>
  );
}
