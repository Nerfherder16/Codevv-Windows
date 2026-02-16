import React, { useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Pencil,
  Lightbulb,
  Code2,
  Share2,
  Video,
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
  { to: "deploy", icon: Rocket, label: "Deploy" },
  { to: "settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("bh-sidebar") !== "expanded",
  );
  const { projectId } = useParams();
  const basePath = projectId ? `/projects/${projectId}` : "/";

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("bh-sidebar", next ? "collapsed" : "expanded");
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-700/30 flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 p-4 border-b border-gray-200 dark:border-gray-700/30">
        <img
          src="/foundrylogo.png"
          alt="Foundry"
          className="w-8 h-8 shrink-0 rounded-lg"
        />
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight truncate">
            Foundry
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={`${basePath}/${item.to}`}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl text-sm transition-all duration-150",
                isActive
                  ? "bg-amber-500/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200",
              )
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapse}
        className="p-3 border-t border-gray-200 dark:border-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors text-gray-400"
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
