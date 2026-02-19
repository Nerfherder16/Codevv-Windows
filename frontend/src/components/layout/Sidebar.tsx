import React, { useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Pencil,
  Lightbulb,
  Code2,
  Share2,
  Video,
  Terminal,
  Rocket,
  Settings,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  GitBranch,
  Activity,
  Coins,
  ClipboardList,
  Shield,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Core",
    items: [
      { to: "", icon: LayoutDashboard, label: "Overview", end: true },
      { to: "canvas", icon: Pencil, label: "Canvas" },
      { to: "ideas", icon: Lightbulb, label: "Idea Vault" },
      { to: "knowledge", icon: Share2, label: "Knowledge Graph" },
      { to: "rules", icon: BookOpen, label: "Business Rules" },
    ],
  },
  {
    title: "Build",
    items: [
      { to: "scaffold", icon: Code2, label: "Code Scaffold" },
      { to: "pipeline", icon: Activity, label: "Agent Pipeline" },
      { to: "dependencies", icon: GitBranch, label: "Dependencies" },
    ],
  },
  {
    title: "Platform",
    items: [
      { to: "deploy", icon: Rocket, label: "Deploy" },
      { to: "solana", icon: Coins, label: "Blockchain" },
      { to: "rooms", icon: Video, label: "Video Rooms" },
      { to: "workspaces", icon: Terminal, label: "Workspaces" },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "audit", icon: ClipboardList, label: "Audit Prep" },
      { to: "compliance", icon: Shield, label: "Launch Readiness" },
      { to: "settings", icon: Settings, label: "Settings" },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("cv-sidebar") !== "expanded",
  );
  const { projectId } = useParams();
  const basePath = projectId ? `/projects/${projectId}` : "/";

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("cv-sidebar", next ? "collapsed" : "expanded");
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col transition-all duration-300 ease-out",
        "bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl",
        "border-r border-gray-200/80 dark:border-white/[0.04]",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      {/* Header — large proud logo */}
      <div className="flex items-center justify-center border-b border-gray-200/80 dark:border-white/[0.04] overflow-hidden">
        <img
          src="/codevvtrans.png"
          alt="Codevv"
          className={cn(
            "shrink-0 transition-all duration-300",
            collapsed ? "w-10 h-10 my-3" : "w-36 h-36 -my-6",
          )}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 px-3 mb-1.5">
                {section.title}
              </p>
            )}
            {collapsed && (
              <div className="mx-3 mb-1.5 border-t border-gray-200/60 dark:border-white/[0.04]" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={`${basePath}/${item.to}`}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                      isActive
                        ? "nav-active text-cyan-400 dark:text-cyan-400 font-medium"
                        : "text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-white/[0.04]",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]" />
                      )}
                      <item.icon
                        className={cn(
                          "w-5 h-5 shrink-0 transition-colors",
                          isActive &&
                            "drop-shadow-[0_0_6px_rgba(56,189,248,0.3)]",
                        )}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapse}
        className="p-3 border-t border-gray-200/80 dark:border-white/[0.04] hover:bg-gray-100/80 dark:hover:bg-white/[0.04] transition-all text-gray-400 dark:text-gray-500"
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5 mx-auto" />
        ) : (
          <ChevronLeft className="w-5 h-5 mx-auto" />
        )}
      </button>
    </aside>
  );
}
