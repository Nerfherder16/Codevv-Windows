import React, { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, User, Bot } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { ChatMessage as ChatMessageType, ToolUseEvent } from "../../types";

function ToolUseIndicator({ tool }: { tool: ToolUseEvent }) {
  const [open, setOpen] = useState(false);
  const shortName = tool.name.replace(/^mcp__\w+__/, "");

  return (
    <div className="my-1 rounded border border-gray-200 dark:border-gray-700 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
      >
        <Wrench className="w-3 h-3 text-gray-400 shrink-0" />
        <span className="font-mono text-gray-600 dark:text-gray-400 truncate flex-1">
          {shortName}
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1 border-t border-gray-200 dark:border-gray-700 pt-1">
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
            ? "bg-blue-600 text-white"
            : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
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
        className={`max-w-[85%] rounded-xl px-3 py-2 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
