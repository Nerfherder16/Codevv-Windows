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
} from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  { to: "", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "canvas", icon: Pencil, label: "Canvas" },
  { to: "ideas", icon: Lightbulb, label: "Idea Vault" },
  { to: "scaffold", icon: Code2, label: "Code Scaffold" },
  { to: "knowledge", icon: Share2, label: "Knowledge Graph" },
  { to: "rooms", icon: Video, label: "Video Rooms" },
  { to: "workspaces", icon: Terminal, label: "Workspaces" },
  { to: "deploy", icon: Rocket, label: "Deploy" },
  { to: "settings", icon: Settings, label: "Settings" },
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
      {/* Header */}
      <div className="flex items-center gap-2.5 p-4 border-b border-gray-200/80 dark:border-white/[0.04]">
        <img src="/codevvtrans.png" alt="Codevv" className="w-8 h-8 shrink-0" />
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight truncate gradient-text">
            Codevv
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={`${basePath}/${item.to}`}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                isActive
                  ? "nav-active text-amber-500 dark:text-amber-400 font-medium"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-white/[0.04]",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                )}
                <item.icon
                  className={cn(
                    "w-5 h-5 shrink-0 transition-colors",
                    isActive && "drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]",
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
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
