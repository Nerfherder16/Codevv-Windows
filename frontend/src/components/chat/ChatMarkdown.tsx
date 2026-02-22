import React, { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";

function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-white/[0.06]">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wide">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-[#0d0b14]">
        <code className="text-sm font-mono text-gray-200 leading-relaxed">
          {children}
        </code>
      </pre>
    </div>
  );
}

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-sm leading-relaxed text-gray-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const text = String(children).replace(/\n$/, "");

            // Inline code vs block
            if (!match && !className) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-cyan-300 text-[13px] font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return <CodeBlock language={match?.[1] || ""}>{text}</CodeBlock>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          p({ children }) {
            return <p className="my-2">{children}</p>;
          },
          h1({ children }) {
            return (
              <h1 className="text-lg font-bold text-white mt-4 mb-2">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="text-base font-semibold text-white mt-4 mb-2">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="text-sm font-semibold text-white mt-3 mb-1">
                {children}
              </h3>
            );
          },
          ul({ children }) {
            return (
              <ul className="list-disc list-outside ml-5 my-2 space-y-1">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="list-decimal list-outside ml-5 my-2 space-y-1">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="text-gray-300">{children}</li>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-white/20 pl-4 my-2 text-gray-400 italic">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08]">
                <table className="w-full text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-2 border-t border-white/[0.04] text-gray-300">
                {children}
              </td>
            );
          },
          strong({ children }) {
            return (
              <strong className="font-semibold text-white">{children}</strong>
            );
          },
          hr() {
            return <hr className="my-4 border-white/[0.08]" />;
          },
        }}
      />
    </div>
  );
}
