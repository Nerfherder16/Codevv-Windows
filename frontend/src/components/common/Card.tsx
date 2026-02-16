import React from "react";
import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  glow?: boolean;
}

export function Card({ children, className, onClick, hover, glow }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 transition-all duration-300",
        // Light mode: white card, dark mode: glass
        "bg-white dark:bg-white/[0.03] dark:backdrop-blur-xl",
        hover &&
          "cursor-pointer hover:border-amber-400/40 dark:hover:border-amber-400/20 hover:shadow-lg dark:hover:shadow-amber-500/[0.03]",
        glow && "glow-card",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}
