import { useRef, useCallback, useState } from "react";
import type { ChatContext, ToolUseEvent, DoneEvent } from "../types";

interface SSECallbacks {
  onText?: (text: string) => void;
  onToolUse?: (tool: ToolUseEvent) => void;
  onToolResult?: (tool: ToolUseEvent) => void;
  onDone?: (result: DoneEvent) => void;
  onError?: (error: string) => void;
}

export function useSSE(projectId: string, callbacks: SSECallbacks) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const send = useCallback(
    async (message: string, context?: ChatContext, model?: string) => {
      // Abort any existing stream
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const token = localStorage.getItem("bh-token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(
          `/api/projects/${projectId}/ai/chat`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ message, context, model }),
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          callbacksRef.current.onError?.(err.detail || `HTTP ${res.status}`);
          setIsStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          callbacksRef.current.onError?.("No response body");
          setIsStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // keep incomplete last line

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);

                switch (eventType) {
                  case "text":
                    callbacksRef.current.onText?.(parsed.text);
                    break;
                  case "tool_use":
                    callbacksRef.current.onToolUse?.(parsed);
                    break;
                  case "tool_result":
                    callbacksRef.current.onToolResult?.(parsed);
                    break;
                  case "done":
                    callbacksRef.current.onDone?.(parsed);
                    break;
                  case "error":
                    callbacksRef.current.onError?.(parsed.message);
                    break;
                }
              } catch {
                // non-JSON data line, ignore
              }
              eventType = "";
            }
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // User aborted, not an error
        } else {
          callbacksRef.current.onError?.(
            e instanceof Error ? e.message : "Stream failed",
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [projectId],
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return { send, isStreaming, abort };
}
