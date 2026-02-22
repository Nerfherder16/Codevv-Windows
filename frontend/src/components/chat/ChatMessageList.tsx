import React, { useRef, useEffect } from "react";
import { ChatPageMessage } from "./ChatPageMessage";
import { ChatEmptyState } from "./ChatEmptyState";
import type { ChatMessage } from "../../types";

interface Props {
  messages: ChatMessage[];
  onSuggestionClick: (text: string) => void;
}

export function ChatMessageList({ messages, onSuggestionClick }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return <ChatEmptyState onSuggestionClick={onSuggestionClick} />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {messages.map((msg) => (
          <ChatPageMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
