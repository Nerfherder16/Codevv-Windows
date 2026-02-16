import React from "react";

/**
 * Lightweight regex-based markdown renderer.
 * Handles: **bold**, *italic*, `code`, ```code blocks```, lists, links, headers.
 * No external dependencies.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Pattern: **bold**, *italic*, `code`, [text](url)
  const regex =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(escapeHtml(text.slice(lastIndex, match.index)));
    }

    if (match[1]) {
      // **bold**
      nodes.push(
        <strong key={key++} className="font-semibold">
          {escapeHtml(match[2])}
        </strong>,
      );
    } else if (match[3]) {
      // *italic*
      nodes.push(
        <em key={key++} className="italic">
          {escapeHtml(match[4])}
        </em>,
      );
    } else if (match[5]) {
      // `code`
      nodes.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-sm font-mono"
        >
          {escapeHtml(match[6])}
        </code>,
      );
    } else if (match[7]) {
      // [text](url)
      nodes.push(
        <a
          key={key++}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline"
        >
          {escapeHtml(match[8])}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(escapeHtml(text.slice(lastIndex)));
  }

  return nodes.length > 0 ? nodes : [escapeHtml(text)];
}

export function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={key++}
          className="my-2 p-3 rounded-lg bg-gray-900 dark:bg-gray-950 text-gray-100 text-sm font-mono overflow-x-auto"
        >
          {lang && <div className="text-xs text-gray-500 mb-1">{lang}</div>}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={key++}
          className="text-sm font-semibold text-gray-900 dark:text-white mt-3 mb-1"
        >
          {renderInline(line.slice(4))}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={key++}
          className="text-base font-semibold text-gray-900 dark:text-white mt-3 mb-1"
        >
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={key++}
          className="text-lg font-bold text-gray-900 dark:text-white mt-3 mb-1"
        >
          {renderInline(line.slice(2))}
        </h1>,
      );
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(
          <li key={items.length}>{renderInline(lines[i].slice(2))}</li>,
        );
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside my-1 space-y-0.5">
          {items}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(
          <li key={items.length}>
            {renderInline(lines[i].replace(/^\d+\. /, ""))}
          </li>,
        );
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside my-1 space-y-0.5">
          {items}
        </ol>,
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={key++} className="my-1">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <div className="text-sm leading-relaxed">{elements}</div>;
}
