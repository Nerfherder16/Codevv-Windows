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
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4",
        hover &&
          "cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}
