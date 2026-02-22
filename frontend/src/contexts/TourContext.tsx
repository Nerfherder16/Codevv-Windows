import React, { createContext, useContext, useState, useCallback } from "react";
import { TOUR_STEPS } from "../components/tour/tourSteps";
import type { TourStep } from "../components/tour/tourSteps";

interface TourState {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
}

const STORAGE_KEY = "cv-tour-complete";

const TourContext = createContext<TourState | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const dismiss = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  const startTour = useCallback(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    setStepIndex(0);
    setActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex((i) => {
      if (i >= TOUR_STEPS.length - 1) {
        dismiss();
        return 0;
      }
      return i + 1;
    });
  }, [dismiss]);

  const prevStep = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  return (
    <TourContext.Provider
      value={{
        active,
        stepIndex,
        steps: TOUR_STEPS,
        startTour,
        nextStep,
        prevStep,
        skipTour: dismiss,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
