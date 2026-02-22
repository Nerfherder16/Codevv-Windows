import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  PanelLeftClose,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { useAIChat } from "../../contexts/AIChatContext";
import { cn } from "../../lib/utils";
import type { Conversation } from "../../types";

function groupConversations(
  convs: Conversation[],
): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const c of convs) {
    const d = new Date(c.updated_at);
    if (d >= today) groups["Today"].push(c);
    else if (d >= yesterday) groups["Yesterday"].push(c);
    else if (d >= weekAgo) groups["Previous 7 days"].push(c);
    else groups["Older"].push(c);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename(trimmed);
    } else {
      setTitle(conv.title);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-3 py-2">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setTitle(conv.title);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 text-sm bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-gray-200 focus:outline-none focus:border-cyan-500/50"
        />
        <button
          onClick={handleSave}
          className="p-1 text-emerald-400 hover:text-emerald-300"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setTitle(conv.title);
            setEditing(false);
          }}
          className="p-1 text-gray-500 hover:text-gray-300"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-lg transition-all duration-150 relative",
        isActive
          ? "bg-white/[0.06] text-gray-200"
          : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]",
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-cyan-400" />
      )}
      <MessageSquare className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-sm truncate">{conv.title}</span>
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="p-1 rounded hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-white/[0.08] text-gray-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </button>
  );
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function ChatSidebar({ collapsed, onToggle }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    conversations,
    conversationId,
    fetchConversations,
    switchConversation,
    newConversation,
    renameConversation,
    deleteConversation,
  } = useAIChat();

  useEffect(() => {
    if (projectId) fetchConversations(projectId);
  }, [projectId, fetchConversations]);

  const groups = groupConversations(conversations);

  if (collapsed) return null;

  return (
    <div className="w-[260px] shrink-0 h-full flex flex-col border-r border-white/[0.06] bg-white/[0.01]">
      {/* Header */}
      <div className="shrink-0 p-3 flex items-center gap-2">
        <button
          onClick={() => projectId && newConversation(projectId)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm text-gray-300 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12] transition-all"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
        <button
          onClick={onToggle}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
          title="Close sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-8">
            No conversations yet
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === conversationId}
                    onSelect={() =>
                      projectId && switchConversation(projectId, conv.id)
                    }
                    onRename={(title) =>
                      projectId && renameConversation(projectId, conv.id, title)
                    }
                    onDelete={() =>
                      projectId && deleteConversation(projectId, conv.id)
                    }
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
