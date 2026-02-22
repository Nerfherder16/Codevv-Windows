export interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar"]',
    title: "Your Navigation Hub",
    description:
      "All your tools organized into Core, Build, Platform, and Operations.",
    position: "right",
  },
  {
    target: '[data-tour="canvas-card"]',
    title: "Draw Your Architecture",
    description:
      "Sketch components, flows, and system diagrams on an infinite whiteboard.",
    position: "bottom",
  },
  {
    target: '[data-tour="ideas-card"]',
    title: "Capture Every Idea",
    description:
      "Log feature ideas, vote on priorities, and track them to implementation.",
    position: "bottom",
  },
  {
    target: '[data-tour="members"]',
    title: "Your Team",
    description:
      "Invite collaborators and manage roles \u2014 everyone works in the same project.",
    position: "top",
  },
  {
    target: '[data-tour="ai-chat"]',
    title: "Your AI Copilot",
    description:
      "Ask questions about your project, generate code, debug issues \u2014 all context-aware.",
    position: "bottom",
  },
  {
    target: '[data-tour="scaffold"]',
    title: "Generate Code",
    description:
      "Turn your designs and ideas into working code with AI assistance.",
    position: "right",
  },
  {
    target: '[data-tour="deploy"]',
    title: "Ship It",
    description: "Deploy to production with a single click when you're ready.",
    position: "right",
  },
];
