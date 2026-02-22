import React, { createContext, useContext, useState, useCallback } from "react";
import type {
  ChatMessage,
  ChatContext as ChatContextType,
  Conversation,
  ConversationDetail,
} from "../types";
import { api } from "../lib/api";

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
  fetchConversations: (projectId: string) => Promise<void>;
  switchConversation: (projectId: string, convId: string) => Promise<void>;
  newConversation: (projectId: string) => Promise<void>;
  renameConversation: (
    projectId: string,
    convId: string,
    title: string,
  ) => Promise<void>;
  deleteConversation: (projectId: string, convId: string) => Promise<void>;
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
    () => localStorage.getItem("cv-ai-model") || "claude-opus-4-6",
  );

  const open = useCallback((context?: ChatContextType) => {
    if (context) setCurrentContext(context);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const setModel = useCallback((model: string) => {
    setCurrentModelState(model);
    localStorage.setItem("cv-ai-model", model);
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

  const fetchConversations = useCallback(async (projectId: string) => {
    try {
      const convs = await api.get<Conversation[]>(
        `/projects/${projectId}/conversations`,
      );
      setConversations(convs);
    } catch {
      // ignore
    }
  }, []);

  const switchConversation = useCallback(
    async (projectId: string, convId: string) => {
      try {
        const detail = await api.get<ConversationDetail>(
          `/projects/${projectId}/conversations/${convId}`,
        );
        const chatMsgs: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          toolUses: m.tool_uses_json ? JSON.parse(m.tool_uses_json) : undefined,
          timestamp: new Date(m.created_at).getTime(),
        }));
        setMessages(chatMsgs);
        setConversationId(convId);
        setSessionId(null);
      } catch {
        // ignore
      }
    },
    [],
  );

  const newConversation = useCallback(
    async (projectId: string) => {
      try {
        await api.delete(`/projects/${projectId}/ai/session`);
      } catch {
        // session may not exist
      }
      setMessages([]);
      setSessionId(null);
      setConversationId(null);
      await fetchConversations(projectId);
    },
    [fetchConversations],
  );

  const renameConversation = useCallback(
    async (projectId: string, convId: string, title: string) => {
      try {
        await api.patch(`/projects/${projectId}/conversations/${convId}`, {
          title,
        });
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title } : c)),
        );
      } catch {
        // ignore
      }
    },
    [],
  );

  const deleteConversation = useCallback(
    async (projectId: string, convId: string) => {
      try {
        await api.delete(`/projects/${projectId}/conversations/${convId}`);
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        // If deleted conversation was active, clear messages
        setConversationId((current) => {
          if (current === convId) {
            setMessages([]);
            setSessionId(null);
            return null;
          }
          return current;
        });
      } catch {
        // ignore
      }
    },
    [],
  );

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
        fetchConversations,
        switchConversation,
        newConversation,
        renameConversation,
        deleteConversation,
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
