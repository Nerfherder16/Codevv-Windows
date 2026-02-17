import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  X,
  Send,
  StopCircle,
  ChevronDown,
  Plus,
  MessageSquare,
  Clock,
  BookmarkPlus,
} from "lucide-react";
import { useAIChat } from "../../contexts/AIChatContext";
import { useSSE } from "../../hooks/useSSE";
import { ChatMessageBubble } from "./ChatMessage";
import type {
  ChatMessage,
  AIModel,
  Conversation,
  ConversationDetail,
} from "../../types";
import { api } from "../../lib/api";

export function AIChatPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    isOpen,
    close,
    messages,
    currentModel,
    currentContext,
    conversationId,
    conversations,
    setModel,
    addMessage,
    updateLastAssistant,
    clearMessages,
    setSessionId,
    setConversationId,
    setConversations,
    loadConversationMessages,
  } = useAIChat();

  const [input, setInput] = useState("");
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [convDropdownOpen, setConvDropdownOpen] = useState(false);
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

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    if (!projectId) return;
    try {
      const convs = await api.get<Conversation[]>(
        `/projects/${projectId}/conversations`,
      );
      setConversations(convs);
    } catch {
      // ignore
    }
  }, [projectId, setConversations]);

  useEffect(() => {
    if (isOpen) fetchConversations();
  }, [isOpen, fetchConversations]);

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
    (result: {
      session_id: string | null;
      model: string;
      conversation_id?: string;
    }) => {
      updateLastAssistant((prev) => ({ ...prev, streaming: false }));
      if (result.session_id) setSessionId(result.session_id);
      if (result.conversation_id) setConversationId(result.conversation_id);
      // Refresh conversation list after a response
      fetchConversations();
    },
    [updateLastAssistant, setSessionId, setConversationId, fetchConversations],
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

  const handleNewConversation = useCallback(async () => {
    if (!projectId) return;
    try {
      await api.delete(`/projects/${projectId}/ai/session`);
    } catch {
      // session may not exist
    }
    clearMessages();
    setConvDropdownOpen(false);
    fetchConversations();
  }, [projectId, clearMessages, fetchConversations]);

  const handleLoadConversation = useCallback(
    async (convId: string) => {
      if (!projectId) return;
      setConvDropdownOpen(false);
      try {
        const detail = await api.get<ConversationDetail>(
          `/projects/${projectId}/conversations/${convId}`,
        );
        // Convert persisted messages to ChatMessage format
        const chatMsgs: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          toolUses: m.tool_uses_json ? JSON.parse(m.tool_uses_json) : undefined,
          timestamp: new Date(m.created_at).getTime(),
        }));
        loadConversationMessages(chatMsgs);
        setConversationId(convId);
      } catch {
        // ignore
      }
    },
    [projectId, loadConversationMessages, setConversationId],
  );

  const handleSaveToMemory = useCallback(() => {
    if (isStreaming || messages.length === 0) return;
    const prompt =
      "Extract and save the key decisions, concepts, and architectural insights from this conversation to Recall using the push_to_recall tool.";

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
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

    send(prompt, currentContext || undefined, currentModel);
  }, [isStreaming, messages, addMessage, send, currentContext, currentModel]);

  const selectedModel = models.find((m) => m.id === currentModel);

  const currentConv = conversations.find((c) => c.id === conversationId);

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
        className={`fixed right-0 top-0 h-full w-[400px] z-40 flex flex-col bg-white dark:bg-gray-950/95 dark:backdrop-blur-xl border-l border-gray-200 dark:border-white/[0.06] shadow-2xl dark:shadow-black/40 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 h-14 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              AI Assistant
            </h2>
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
              >
                <span className="truncate max-w-[120px]">
                  {selectedModel?.name || currentModel}
                </span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
              {modelDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-gray-900/95 dark:backdrop-blur-xl border border-gray-200 dark:border-white/[0.08] rounded-xl shadow-lg dark:shadow-black/40 z-50 overflow-hidden">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(m.id);
                        setModelDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors ${
                        m.id === currentModel
                          ? "bg-amber-50 dark:bg-amber-500/10"
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
            {/* Conversation selector */}
            <div className="relative">
              <button
                onClick={() => setConvDropdownOpen(!convDropdownOpen)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.05] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Conversations"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              {convDropdownOpen && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-gray-900/95 dark:backdrop-blur-xl border border-gray-200 dark:border-white/[0.08] rounded-xl shadow-lg dark:shadow-black/40 z-50 overflow-hidden max-h-80 flex flex-col">
                  {/* New conversation button */}
                  <button
                    onClick={handleNewConversation}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border-b border-gray-100 dark:border-white/[0.04] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Conversation
                  </button>
                  {/* Conversation list */}
                  <div className="overflow-y-auto flex-1">
                    {conversations.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                        No conversations yet
                      </p>
                    ) : (
                      conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => handleLoadConversation(conv.id)}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors ${
                            conv.id === conversationId
                              ? "bg-amber-50 dark:bg-amber-500/10"
                              : ""
                          }`}
                        >
                          <p className="text-sm text-gray-900 dark:text-white truncate">
                            {conv.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {conv.message_count} messages
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={close}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.05] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center mb-3">
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
        <div className="shrink-0 border-t border-gray-200 dark:border-white/[0.06] p-3">
          {/* Context indicator */}
          <div className="mb-2 flex items-center gap-1.5">
            {currentContext?.page && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium">
                {currentContext.page}
              </span>
            )}
            {currentConv && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium truncate max-w-[200px]">
                {currentConv.title}
              </span>
            )}
            {messages.length > 0 && !isStreaming && (
              <button
                onClick={handleSaveToMemory}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-medium hover:bg-violet-200 dark:hover:bg-violet-900/40 transition-colors"
                title="Save conversation insights to project memory"
              >
                <BookmarkPlus className="w-3 h-3" />
                Save to Memory
              </button>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your project..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
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
                className="shrink-0 p-2 rounded-xl btn-glow text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
