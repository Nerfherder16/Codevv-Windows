import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAIChat } from "./AIChatContext";
import { buildTourSteps } from "../components/tour/tourSteps";
import type { TourStep } from "../components/tour/tourSteps";

interface TourState {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  runningAction: boolean;
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
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [runningAction, setRunningAction] = useState(false);

  const navigate = useNavigate();
  const { projectId } = useParams();
  const { open: openChat, close: closeChat } = useAIChat();

  const runningRef = useRef(false);

  const dismiss = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    setSteps([]);
    closeChat();
    localStorage.setItem(STORAGE_KEY, "1");
  }, [closeChat]);

  const goToStep = useCallback(
    async (idx: number, builtSteps: TourStep[]) => {
      if (runningRef.current) return;
      const step = builtSteps[idx];
      if (!step) return;

      if (step.action) {
        runningRef.current = true;
        setRunningAction(true);

        await step.action({
          navigate,
          openChat,
          closeChat,
        });

        // Wait for navigation/render to settle
        const delay = step.delay ?? 400;
        await new Promise((r) => setTimeout(r, delay));

        runningRef.current = false;
        setRunningAction(false);
      }

      setStepIndex(idx);
    },
    [navigate, openChat, closeChat],
  );

  const startTour = useCallback(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const basePath = projectId ? `/projects/${projectId}` : "/";
    const builtSteps = buildTourSteps(basePath);
    setSteps(builtSteps);
    setStepIndex(0);
    setActive(true);

    // Run first step's action if it has one
    const first = builtSteps[0];
    if (first?.action) {
      goToStep(0, builtSteps);
    }
  }, [projectId, goToStep]);

  const nextStep = useCallback(() => {
    if (runningRef.current) return;
    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      dismiss();
      return;
    }
    goToStep(nextIdx, steps);
  }, [stepIndex, steps, dismiss, goToStep]);

  const prevStep = useCallback(() => {
    if (runningRef.current) return;
    if (stepIndex <= 0) return;
    goToStep(stepIndex - 1, steps);
  }, [stepIndex, steps, goToStep]);

  return (
    <TourContext.Provider
      value={{
        active,
        stepIndex,
        steps,
        runningAction,
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
