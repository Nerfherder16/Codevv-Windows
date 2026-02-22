import React, { useState } from "react";
import {
  Sparkles,
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  Plug,
} from "lucide-react";
import { ChatMarkdown } from "./ChatMarkdown";
import type { ChatMessage, ToolUseEvent } from "../../types";

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
    <div className="my-1.5 rounded-lg border border-white/[0.06] text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 py-2 hover:bg-white/[0.03] text-left rounded-lg transition-colors"
      >
        {parsed.isMCP ? (
          <Plug className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        ) : (
          <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
        <span className="font-mono text-gray-400 truncate flex-1">
          {parsed.tool}
        </span>
        {parsed.isMCP && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium shrink-0">
            {parsed.server}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-1 border-t border-white/[0.06] pt-2">
          <div>
            <span className="text-gray-500">Input:</span>
            <pre className="mt-0.5 p-2 rounded-lg bg-[#0d0b14] overflow-x-auto whitespace-pre-wrap break-all text-gray-300 font-mono">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {tool.output && (
            <div>
              <span className="text-gray-500">Output:</span>
              <pre className="mt-0.5 p-2 rounded-lg bg-[#0d0b14] overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto text-gray-300 font-mono">
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatPageMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-start gap-3 max-w-[85%]">
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-5 py-3.5">
            <p className="text-sm text-gray-200 whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
          <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mt-0.5">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 max-w-full">
      <div className="shrink-0 w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <ChatMarkdown content={message.content} />
        {message.streaming && (
          <span className="inline-block w-[3px] h-5 bg-cyan-400 animate-pulse ml-0.5 align-text-bottom rounded-full" />
        )}
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
