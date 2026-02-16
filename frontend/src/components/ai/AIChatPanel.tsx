import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { X, Send, Trash2, StopCircle, ChevronDown } from "lucide-react";
import { useAIChat } from "../../contexts/AIChatContext";
import { useSSE } from "../../hooks/useSSE";
import { ChatMessageBubble } from "./ChatMessage";
import type { ChatMessage, AIModel } from "../../types";
import { api } from "../../lib/api";

export function AIChatPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    isOpen,
    close,
    messages,
    currentModel,
    currentContext,
    setModel,
    addMessage,
    updateLastAssistant,
    clearMessages,
    setSessionId,
  } = useAIChat();

  const [input, setInput] = useState("");
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available models
  useEffect(() => {
    if (!projectId) return;
    api
      .get<AIModel[]>(`/projects/${projectId}/ai/models`)
      .then(setModels)
      .catch(() => {});
  }, [projectId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleText = useCallback(
    (text: string) => {
      updateLastAssistant((prev) => ({
        ...prev,
        content: prev.content + text,
      }));
    },
    [updateLastAssistant],
  );

  const handleToolUse = useCallback(
    (tool: { name: string; input: Record<string, unknown> }) => {
      updateLastAssistant((prev) => ({
        ...prev,
        toolUses: [...(prev.toolUses || []), { ...tool }],
      }));
    },
    [updateLastAssistant],
  );

  const handleDone = useCallback(
    (result: { session_id: string | null; model: string }) => {
      updateLastAssistant((prev) => ({ ...prev, streaming: false }));
      if (result.session_id) setSessionId(result.session_id);
    },
    [updateLastAssistant, setSessionId],
  );

  const handleError = useCallback(
    (error: string) => {
      updateLastAssistant((prev) => ({
        ...prev,
        content: prev.content + `\n\n**Error:** ${error}`,
        streaming: false,
      }));
    },
    [updateLastAssistant],
  );

  const { send, isStreaming, abort } = useSSE(projectId || "", {
    onText: handleText,
    onToolUse: handleToolUse,
    onDone: handleDone,
    onError: handleError,
  });

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);

    // Add placeholder assistant message
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolUses: [],
      timestamp: Date.now(),
      streaming: true,
    };
    addMessage(assistantMsg);

    setInput("");
    send(text, currentContext || undefined, currentModel);
  }, [input, isStreaming, addMessage, send, currentContext, currentModel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const selectedModel = models.find((m) => m.id === currentModel);

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={close}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-[400px] z-40 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 h-14 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              AI Assistant
            </h2>
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <span className="truncate max-w-[120px]">
                  {selectedModel?.name || currentModel}
                </span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
              {modelDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(m.id);
                        setModelDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                        m.id === currentModel
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : ""
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {m.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {m.description}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearMessages}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={close}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <p className="text-sm font-medium">Ask about your project</p>
              <p className="text-xs mt-1 max-w-[240px]">
                I can help with architecture, ideas, components, deployment, and
                more.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-3">
          {/* Context indicator */}
          {currentContext?.page && (
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                {currentContext.page}
              </span>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your project..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              style={{ maxHeight: "120px" }}
            />
            {isStreaming ? (
              <button
                onClick={abort}
                className="shrink-0 p-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                title="Stop generating"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Send (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">
            Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}
