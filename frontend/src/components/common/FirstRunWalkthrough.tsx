import {
  Sparkles,
  Pencil,
  Lightbulb,
  Code2,
  Share2,
  Activity,
  Rocket,
  Plus,
} from "lucide-react";

const FEATURES = [
  {
    icon: Pencil,
    title: "Canvas",
    desc: "Draw architecture on an infinite whiteboard",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    icon: Lightbulb,
    title: "Idea Vault",
    desc: "Capture and vote on product ideas",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    icon: Code2,
    title: "Code Scaffold",
    desc: "AI generates code from your designs",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  {
    icon: Share2,
    title: "Knowledge Graph",
    desc: "Map relationships between components",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  {
    icon: Activity,
    title: "Agent Pipeline",
    desc: "Automated agents analyze your codebase",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
  },
  {
    icon: Rocket,
    title: "Deploy",
    desc: "Ship to production with one click",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
] as const;

interface Props {
  onCreateProject: () => void;
}

export function FirstRunWalkthrough({ onCreateProject }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Hero icon */}
      <div
        className="walkthrough-fade w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-6"
        style={{ animationDelay: "0ms" }}
      >
        <Sparkles className="w-7 h-7 text-cyan-400" />
      </div>

      {/* Heading */}
      <h2
        className="walkthrough-fade text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2"
        style={{ animationDelay: "100ms" }}
      >
        Everything you need to build
      </h2>

      {/* Subtitle */}
      <p
        className="walkthrough-fade text-gray-400 dark:text-gray-500 text-sm max-w-md mb-10"
        style={{ animationDelay: "250ms" }}
      >
        Design architecture, generate code, and ship — all powered by AI in one
        workspace.
      </p>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl mb-10">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="walkthrough-fade flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06] text-left"
            style={{ animationDelay: `${400 + i * 100}ms` }}
          >
            <div
              className={`w-8 h-8 rounded-lg ${f.bg} flex items-center justify-center shrink-0`}
            >
              <f.icon className={`w-4 h-4 ${f.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {f.title}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Gradient divider */}
      <div
        className="walkthrough-scale-x w-48 h-px mb-10"
        style={{
          animationDelay: "1100ms",
          background:
            "linear-gradient(90deg, transparent, rgba(0,175,185,0.4), transparent)",
        }}
      />

      {/* CTA button */}
      <button
        onClick={onCreateProject}
        className="walkthrough-fade btn-pulse-glow inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-cyan-500 text-white font-medium text-sm transition-all duration-200 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
        style={{ animationDelay: "1300ms" }}
      >
        <Plus className="w-4 h-4" />
        Create Your First Project
      </button>
    </div>
  );
}
