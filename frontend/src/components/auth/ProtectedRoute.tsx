import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import { LoginPage } from "./LoginPage";
import { PageLoading } from "../common/LoadingSpinner";

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <PageLoading />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
