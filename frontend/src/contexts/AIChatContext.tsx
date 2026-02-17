import React, { createContext, useContext, useState, useCallback } from "react";
import type {
  ChatMessage,
  ChatContext as ChatContextType,
  Conversation,
} from "../types";

interface AIChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  sessionId: string | null;
  conversationId: string | null;
  conversations: Conversation[];
  currentModel: string;
  currentContext: ChatContextType | null;
  open: (context?: ChatContextType) => void;
  close: () => void;
  toggle: () => void;
  setModel: (model: string) => void;
  addMessage: (msg: ChatMessage) => void;
  updateLastAssistant: (updater: (prev: ChatMessage) => ChatMessage) => void;
  clearMessages: () => void;
  setSessionId: (id: string | null) => void;
  setConversationId: (id: string | null) => void;
  setConversations: (convs: Conversation[]) => void;
  loadConversationMessages: (msgs: ChatMessage[]) => void;
}

const AIChatCtx = createContext<AIChatState | null>(null);

export function AIChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentContext, setCurrentContext] = useState<ChatContextType | null>(
    null,
  );

  // Read model preference from localStorage
  const [currentModel, setCurrentModelState] = useState(
    () => localStorage.getItem("bh-ai-model") || "claude-opus-4-6",
  );

  const open = useCallback((context?: ChatContextType) => {
    if (context) setCurrentContext(context);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const setModel = useCallback((model: string) => {
    setCurrentModelState(model);
    localStorage.setItem("bh-ai-model", model);
  }, []);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback(
    (updater: (prev: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "assistant") {
            copy[i] = updater(copy[i]);
            break;
          }
        }
        return copy;
      });
    },
    [],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setConversationId(null);
  }, []);

  const loadConversationMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  return (
    <AIChatCtx.Provider
      value={{
        isOpen,
        messages,
        sessionId,
        conversationId,
        conversations,
        currentModel,
        currentContext,
        open,
        close,
        toggle,
        setModel,
        addMessage,
        updateLastAssistant,
        clearMessages,
        setSessionId,
        setConversationId,
        setConversations,
        loadConversationMessages,
      }}
    >
      {children}
    </AIChatCtx.Provider>
  );
}

export function useAIChat(): AIChatState {
  const ctx = useContext(AIChatCtx);
  if (!ctx) throw new Error("useAIChat must be used within AIChatProvider");
  return ctx;
}
