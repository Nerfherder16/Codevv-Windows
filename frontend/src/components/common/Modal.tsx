import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      ref.current?.showModal();
    } else {
      ref.current?.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl bg-white dark:bg-gray-900/95 dark:backdrop-blur-xl border border-gray-200 dark:border-white/[0.08] shadow-2xl dark:shadow-black/40 p-0 max-w-lg w-full",
        className,
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/[0.06]">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
