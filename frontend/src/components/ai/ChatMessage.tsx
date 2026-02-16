import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Plug,
  User,
  Bot,
} from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { ChatMessage as ChatMessageType, ToolUseEvent } from "../../types";

function parseMCPToolName(name: string): {
  isMCP: boolean;
  server: string;
  tool: string;
} {
  const match = name.match(/^mcp__([^_]+(?:[-][^_]+)*)__(.+)$/);
  if (match) {
    return { isMCP: true, server: match[1], tool: match[2] };
  }
  return { isMCP: false, server: "", tool: name };
}

function ToolUseIndicator({ tool }: { tool: ToolUseEvent }) {
  const [open, setOpen] = useState(false);
  const parsed = parseMCPToolName(tool.name);

  return (
    <div className="my-1 rounded-lg border border-gray-200 dark:border-white/[0.08] text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.03] text-left rounded-lg transition-colors"
      >
        {parsed.isMCP ? (
          <Plug className="w-3 h-3 text-violet-400 shrink-0" />
        ) : (
          <Wrench className="w-3 h-3 text-amber-400 shrink-0" />
        )}
        <span className="font-mono text-gray-600 dark:text-gray-400 truncate flex-1">
          {parsed.tool}
        </span>
        {parsed.isMCP && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 font-medium shrink-0">
            {parsed.server}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1 border-t border-gray-200 dark:border-white/[0.06] pt-1">
          <div>
            <span className="text-gray-500 dark:text-gray-500">Input:</span>
            <pre className="mt-0.5 p-1.5 rounded bg-gray-50 dark:bg-gray-800 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {tool.output && (
            <div>
              <span className="text-gray-500 dark:text-gray-500">Output:</span>
              <pre className="mt-0.5 p-1.5 rounded bg-gray-50 dark:bg-gray-800 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatMessageBubble({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/20"
            : "bg-gray-200 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
          isUser
            ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/15"
            : "bg-gray-100 dark:bg-white/[0.04] dark:border dark:border-white/[0.06] text-gray-900 dark:text-gray-100"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <MarkdownRenderer content={message.content} />
            {message.streaming && (
              <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom" />
            )}
          </>
        )}

        {/* Tool uses */}
        {message.toolUses && message.toolUses.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolUses.map((tool, i) => (
              <ToolUseIndicator key={i} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
