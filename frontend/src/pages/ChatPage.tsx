import React, { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { useAIChat } from "../contexts/AIChatContext";
import { useSSE } from "../hooks/useSSE";
import { ChatSidebar } from "../components/chat/ChatSidebar";
import { ChatMessageList } from "../components/chat/ChatMessageList";
import { ChatInput } from "../components/chat/ChatInput";
import type { ChatMessage } from "../types";

export function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const {
    messages,
    currentModel,
    currentContext,
    addMessage,
    updateLastAssistant,
    setSessionId,
    setConversationId,
    fetchConversations,
  } = useAIChat();

  const handleText = useCallback(
    (text: string) => {
      updateLastAssistant((prev) => ({
        ...prev,
        content: prev.content + text,
      }));
    },
    [updateLastAssistant],
  );

  const handleDone = useCallback(
    (result: {
      session_id: string | null;
      model: string;
      conversation_id?: string;
    }) => {
      updateLastAssistant((prev) => ({ ...prev, streaming: false }));
      if (result.session_id) setSessionId(result.session_id);
      if (result.conversation_id) setConversationId(result.conversation_id);
      if (projectId) fetchConversations(projectId);
    },
    [
      updateLastAssistant,
      setSessionId,
      setConversationId,
      fetchConversations,
      projectId,
    ],
  );

  const { send, isStreaming } = useSSE(projectId || "", {
    onText: handleText,
    onToolUse: (tool) => {
      updateLastAssistant((prev) => ({
        ...prev,
        toolUses: [...(prev.toolUses || []), { ...tool }],
      }));
    },
    onDone: handleDone,
    onError: (error) => {
      updateLastAssistant((prev) => ({
        ...prev,
        content: prev.content + `\n\n**Error:** ${error}`,
        streaming: false,
      }));
    },
  });

  const handleSuggestionClick = useCallback(
    (text: string) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        toolUses: [],
        timestamp: Date.now(),
        streaming: true,
      };
      addMessage(assistantMsg);

      send(text, currentContext || undefined, currentModel);
    },
    [isStreaming, addMessage, send, currentContext, currentModel],
  );

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
      <ChatSidebar
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar: sidebar toggle */}
        {!sidebarOpen && (
          <div className="shrink-0 px-3 pt-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
              title="Open sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        <ChatMessageList
          messages={messages}
          onSuggestionClick={handleSuggestionClick}
        />

        <ChatInput />
      </div>
    </div>
  );
}
