import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useAIChat } from "../../contexts/AIChatContext";
import { Sun, Moon, LogOut, User, Sparkles } from "lucide-react";

export function TopBar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { toggle: toggleChat, isOpen: chatOpen } = useAIChat();

  return (
    <header className="h-14 border-b border-gray-200/80 dark:border-white/[0.04] flex items-center justify-between px-6 bg-white/60 dark:bg-transparent backdrop-blur-sm">
      <div />
      <div className="flex items-center gap-1.5">
        {/* AI toggle */}
        <button
          onClick={toggleChat}
          className={`p-2 rounded-xl transition-all duration-200 ${
            chatOpen
              ? "bg-cyan-500/15 text-cyan-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]"
              : "text-gray-400 dark:text-gray-500 hover:bg-white/[0.05] hover:text-gray-200"
          }`}
          title="AI Assistant"
        >
          <Sparkles className="w-[18px] h-[18px]" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200"
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </button>

        {/* Divider */}
        {user && (
          <div className="w-px h-6 bg-gray-200 dark:bg-white/[0.06] mx-1" />
        )}

        {user && (
          <>
            {/* User avatar */}
            <div className="flex items-center gap-2.5 text-sm ml-1">
              <div className="w-8 h-8 rounded-xl bg-cyan-500 text-white flex items-center justify-center text-xs font-bold shadow-lg shadow-cyan-500/20">
                {user.display_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <span className="hidden sm:inline text-gray-600 dark:text-gray-400 font-medium">
                {user.display_name}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-red-400 transition-all duration-200"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
