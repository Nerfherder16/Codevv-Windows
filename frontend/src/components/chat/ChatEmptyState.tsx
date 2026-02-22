import React from "react";
import { Sparkles } from "lucide-react";

interface Props {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  "Explain this project",
  "Help me plan a feature",
  "Review my architecture",
  "What should I build next?",
];

export function ChatEmptyState({ onSuggestionClick }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-5">
        <Sparkles className="w-6 h-6 text-gray-500" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        How can I help you today?
      </h2>
      <p className="text-sm text-gray-500 mb-8 text-center max-w-sm">
        Ask me about architecture, ideas, components, deployment, or anything
        about your project.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            onClick={() => onSuggestionClick(text)}
            className="px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-sm text-gray-400 hover:text-gray-200 hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-200"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
