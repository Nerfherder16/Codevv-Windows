export interface TourActionContext {
  navigate: (path: string) => void;
  openChat: () => void;
  closeChat: () => void;
}

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
  action?: (ctx: TourActionContext) => Promise<void>;
  delay?: number;
  typewriter?: string;
}

export function buildTourSteps(basePath: string): TourStep[] {
  return [
    {
      target: '[data-tour="sidebar"]',
      title: "Your Navigation Hub",
      description:
        "Core, Build, Platform, and Operations \u2014 everything organized.",
      position: "right",
      action: async (ctx) => {
        ctx.navigate(`${basePath}`);
      },
      delay: 300,
    },
    {
      target: '[data-tour="page-content"]',
      title: "Draw Your Architecture",
      description:
        "Sketch components, flows, and system diagrams on an infinite whiteboard.",
      position: "bottom",
      action: async (ctx) => {
        ctx.navigate(`${basePath}/canvas`);
      },
      delay: 500,
    },
    {
      target: '[data-tour="page-content"]',
      title: "Capture Every Idea",
      description:
        "Log feature ideas, vote on priorities, and track to implementation.",
      position: "bottom",
      action: async (ctx) => {
        ctx.navigate(`${basePath}/ideas`);
      },
      delay: 500,
    },
    {
      target: '[data-tour="page-content"]',
      title: "Knowledge Graph",
      description: "Map entities, relationships, and decisions visually.",
      position: "bottom",
      action: async (ctx) => {
        ctx.navigate(`${basePath}/knowledge`);
      },
      delay: 500,
    },
    {
      target: '[data-tour="page-content"]',
      title: "Generate Code",
      description: "Turn designs and ideas into working code with AI.",
      position: "bottom",
      action: async (ctx) => {
        ctx.navigate(`${basePath}/scaffold`);
      },
      delay: 500,
    },
    {
      target: '[data-tour="page-content"]',
      title: "Ship It",
      description: "Deploy to production with a single click.",
      position: "bottom",
      action: async (ctx) => {
        ctx.navigate(`${basePath}/deploy`);
      },
      delay: 500,
    },
    {
      target: '[data-tour="members"]',
      title: "Your Team",
      description:
        "Invite collaborators and manage roles \u2014 everyone works in the same project.",
      position: "top",
      action: async (ctx) => {
        ctx.navigate(`${basePath}`);
      },
      delay: 500,
    },
    {
      target: '[data-tour="ai-chat"]',
      title: "Your AI Copilot",
      description: "Context-aware AI assistant for your project.",
      position: "bottom",
    },
    {
      target: '[data-tour="ai-panel"]',
      title: "Ask Anything",
      description:
        "Ask questions, generate code, debug issues \u2014 all context-aware.",
      position: "left",
      action: async (ctx) => {
        ctx.openChat();
      },
      delay: 400,
      typewriter: "Hi Claude, what are we working on?",
    },
    {
      target: '[data-tour="sidebar"]',
      title: "You're All Set!",
      description: "Explore, build, and ship something great.",
      position: "right",
      action: async (ctx) => {
        ctx.closeChat();
      },
      delay: 400,
    },
  ];
}
