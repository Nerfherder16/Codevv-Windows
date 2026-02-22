import React, {
  useState,
  useLayoutEffect,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useTour } from "../../contexts/TourContext";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const TOOLTIP_GAP = 12;
const TYPEWRITER_INTERVAL = 50;

export function TourOverlay() {
  const {
    active,
    stepIndex,
    steps,
    runningAction,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const prevActiveRef = useRef<string | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [typewriterDone, setTypewriterDone] = useState(false);
  const step = steps[stepIndex];

  // Measure target element position
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    });
  }, [step]);

  // Main layout effect for measuring and highlighting
  useLayoutEffect(() => {
    if (!active || !step || runningAction) return;

    // Remove previous data-tour-active
    if (prevActiveRef.current) {
      const prev = document.querySelector(prevActiveRef.current);
      prev?.removeAttribute("data-tour-active");
    }

    // Set current target active
    const el = document.querySelector(step.target);
    el?.setAttribute("data-tour-active", "");
    prevActiveRef.current = step.target;

    measure();

    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step, measure, runningAction]);

  // Cleanup data-tour-active on unmount or deactivation
  useLayoutEffect(() => {
    if (!active && prevActiveRef.current) {
      const prev = document.querySelector(prevActiveRef.current);
      prev?.removeAttribute("data-tour-active");
      prevActiveRef.current = null;
    }
  }, [active]);

  // Typewriter effect
  useEffect(() => {
    // Cleanup previous typewriter
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    setTypewriterDone(false);

    if (!active || !step?.typewriter || runningAction) return;

    const text = step.typewriter;
    const textarea = document.querySelector(
      'textarea[placeholder="Ask about your project..."]',
    ) as HTMLTextAreaElement | null;

    if (!textarea) return;

    // Check reduced motion preference
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      // Fill instantly
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
      setTypewriterDone(true);
      return;
    }

    let charIdx = 0;
    typewriterRef.current = setInterval(() => {
      if (charIdx >= text.length) {
        if (typewriterRef.current) clearInterval(typewriterRef.current);
        typewriterRef.current = null;
        setTypewriterDone(true);
        return;
      }

      charIdx++;
      const partial = text.slice(0, charIdx);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, partial);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, TYPEWRITER_INTERVAL);

    return () => {
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    };
  }, [active, step, stepIndex, runningAction]);

  // Clear typewriter text when leaving a typewriter step
  useEffect(() => {
    return () => {
      if (step?.typewriter) {
        const textarea = document.querySelector(
          'textarea[placeholder="Ask about your project..."]',
        ) as HTMLTextAreaElement | null;
        if (textarea) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(textarea, "");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }
    };
  }, [stepIndex, step?.typewriter]);

  // Escape key to skip tour
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        skipTour();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, skipTour]);

  if (!active || !step) return null;

  // While running an action, show backdrop only (no tooltip)
  if (runningAction) {
    return (
      <div
        className="fixed inset-0 z-[60] bg-black/60 transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (!targetRect) return null;

  const tooltip = computeTooltipPosition(targetRect, step.position);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <>
      {/* Clickable backdrop to prevent interaction */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight cutout */}
      <div
        className="tour-spotlight"
        style={{
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
        }}
      />

      {/* Tooltip */}
      <div
        className="tour-tooltip"
        style={{ top: tooltip.top, left: tooltip.left }}
      >
        <div className={`tour-tooltip-arrow tour-arrow-${tooltip.arrowSide}`} />

        {/* Segmented progress bar */}
        <div className="flex gap-1 mb-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                i <= stepIndex ? "bg-cyan-400" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <p className="text-sm font-semibold text-white mb-1">{step.title}</p>
        <p className="text-sm text-gray-400 mb-4">{step.description}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={skipTour}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={prevStep}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
              >
                Back
              </button>
            )}
            <button
              onClick={nextStep}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-500 text-white font-medium hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/20"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function computeTooltipPosition(
  rect: Rect,
  position: "top" | "bottom" | "left" | "right",
) {
  const TOOLTIP_W = 280;
  const TOOLTIP_H = 180;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrowSide = position;

  switch (position) {
    case "bottom":
      top = rect.top + rect.height + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      arrowSide = "top";
      break;
    case "top":
      top = rect.top - TOOLTIP_H - TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      arrowSide = "bottom";
      break;
    case "right":
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      left = rect.left + rect.width + TOOLTIP_GAP;
      arrowSide = "left";
      break;
    case "left":
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      left = rect.left - TOOLTIP_W - TOOLTIP_GAP;
      arrowSide = "right";
      break;
  }

  // Clamp to viewport
  if (left < 12) left = 12;
  if (left + TOOLTIP_W > vw - 12) left = vw - TOOLTIP_W - 12;
  if (top < 12) top = 12;
  if (top + TOOLTIP_H > vh - 12) top = vh - TOOLTIP_H - 12;

  return { top, left, arrowSide };
}
