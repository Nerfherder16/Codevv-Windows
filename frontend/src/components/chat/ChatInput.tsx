import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, StopCircle, ChevronDown } from "lucide-react";
import { useParams } from "react-router-dom";
import { useAIChat } from "../../contexts/AIChatContext";
import { useSSE } from "../../hooks/useSSE";
import type { ChatMessage, AIModel } from "../../types";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

export function ChatInput() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    currentModel,
    currentContext,
    setModel,
    addMessage,
    updateLastAssistant,
    setSessionId,
    setConversationId,
    fetchConversations,
  } = useAIChat();

  const [input, setInput] = useState("");
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    api
      .get<AIModel[]>(`/projects/${projectId}/ai/models`)
      .then(setModels)
      .catch(() => {});
  }, [projectId]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

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

  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: msg,
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

      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      send(msg, currentContext || undefined, currentModel);
    },
    [input, isStreaming, addMessage, send, currentContext, currentModel],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const selectedModel = models.find((m) => m.id === currentModel);

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] focus-within:border-white/[0.15] transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude..."
            rows={1}
            className="w-full resize-none bg-transparent px-5 pt-4 pb-12 text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
            style={{ maxHeight: "160px" }}
          />
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
            {/* Model selector */}
            <div className="relative" ref={modelRef}>
              <button
                onClick={() => setModelOpen(!modelOpen)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] text-gray-500 hover:text-gray-300 hover:bg-white/[0.08] transition-colors"
              >
                <span className="truncate max-w-[140px]">
                  {selectedModel?.name || currentModel}
                </span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
              {modelOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 border border-white/[0.08] rounded-xl shadow-xl shadow-black/40 z-50 overflow-hidden">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(m.id);
                        setModelOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-white/[0.05] transition-colors",
                        m.id === currentModel && "bg-white/[0.04]",
                      )}
                    >
                      <p className="text-sm font-medium text-white">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Send / Stop */}
            {isStreaming ? (
              <button
                onClick={abort}
                className="p-2 rounded-xl bg-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.12] transition-all"
                title="Stop generating"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  input.trim()
                    ? "bg-white text-gray-900 hover:bg-gray-200"
                    : "bg-white/[0.06] text-gray-600 cursor-not-allowed",
                )}
                title="Send (Enter)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-gray-600 mt-2 text-center">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// Export handleSend trigger for external use (suggestion chips)
export type ChatInputHandle = {
  sendMessage: (text: string) => void;
};
