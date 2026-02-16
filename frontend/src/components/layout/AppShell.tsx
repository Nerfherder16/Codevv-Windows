import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AIChatProvider } from "../../contexts/AIChatContext";
import { AIChatPanel } from "../ai/AIChatPanel";

export function AppShell() {
  return (
    <AIChatProvider>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-6 overflow-auto bg-grid">
            <Outlet />
          </main>
        </div>
        <AIChatPanel />
      </div>
    </AIChatProvider>
  );
}
