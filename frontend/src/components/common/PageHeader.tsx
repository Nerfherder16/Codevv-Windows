import React from "react";

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: Props) {
  return (
    <div className="flex items-start justify-between mb-8 animate-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="dark:gradient-text">{title}</span>
          <span className="dark:hidden">{""}</span>
        </h1>
        {description && (
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
