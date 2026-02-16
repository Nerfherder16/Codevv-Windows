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
    <header className="h-14 border-b border-gray-200 dark:border-gray-700/30 flex items-center justify-between px-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
      <div />
      <div className="flex items-center gap-2">
        <button
          onClick={toggleChat}
          className={`p-2 rounded-xl transition-all duration-150 ${
            chatOpen
              ? "bg-amber-500/10 text-amber-500"
              : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-600 dark:hover:text-gray-200"
          }`}
          title="AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={toggle}
          className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-150"
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
        {user && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 ml-1">
              <div className="w-7 h-7 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-xs font-semibold">
                {user.display_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <span className="hidden sm:inline">{user.display_name}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-150"
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
