import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("w-6 h-6 animate-spin text-blue-500", className)} />
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner className="w-8 h-8" />
    </div>
  );
}
