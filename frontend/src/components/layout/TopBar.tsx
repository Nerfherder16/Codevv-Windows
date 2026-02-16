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
    <header className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white dark:bg-gray-900/50">
      <div />
      <div className="flex items-center gap-3">
        <button
          onClick={toggleChat}
          className={`p-2 rounded-lg transition-colors ${
            chatOpen
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
              : "hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
          title="AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4" />
              <span>{user.display_name}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
