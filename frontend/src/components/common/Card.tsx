import React from "react";
import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className, onClick, hover }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900 p-5 transition-all duration-200",
        hover &&
          "cursor-pointer hover:border-amber-400/60 dark:hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}
