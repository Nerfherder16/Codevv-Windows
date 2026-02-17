import React, { useCallback, useRef } from "react";
import { Tldraw, type Editor, type TLStoreSnapshot } from "tldraw";
import "tldraw/tldraw.css";

interface TldrawCanvasProps {
  snapshot: Record<string, unknown> | null;
  onSave: (snapshot: Record<string, unknown>) => void;
}

export function TldrawCanvas({ snapshot, onSave }: TldrawCanvasProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Load existing snapshot if provided
      if (snapshot) {
        try {
          editor.store.loadStoreSnapshot(
            snapshot as unknown as TLStoreSnapshot,
          );
        } catch (err) {
          console.warn("Failed to load tldraw snapshot:", err);
        }
      }

      // Listen for changes and debounce save
      const unsub = editor.store.listen(
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            const snap = editor.store.getStoreSnapshot();
            onSave(snap as unknown as Record<string, unknown>);
          }, 2000);
        },
        { scope: "document", source: "user" },
      );

      return () => {
        unsub();
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    },
    [snapshot, onSave],
  );

  return (
    <div className="absolute inset-0">
      <Tldraw onMount={handleMount} />
    </div>
  );
}
