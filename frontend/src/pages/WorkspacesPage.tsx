import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Terminal, ExternalLink, ArrowLeft, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";

interface WorkspaceConfig {
  code_server_url: string;
  is_configured: boolean;
}

export function WorkspacesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.get<WorkspaceConfig>("/workspaces/config");
      setConfig(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load config";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Workspaces"
        description="Cloud development environments powered by code-server."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      />

      {config?.is_configured ? (
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Terminal className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                code-server
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                VS Code in the browser — edit files, run terminals, and install
                extensions from your CasaOS server.
              </p>
              <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-2">
                {config.code_server_url}
              </p>
            </div>
            <Button
              onClick={() =>
                window.open(config.code_server_url, "_blank", "noopener")
              }
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            code-server Not Configured
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 max-w-md">
            Set{" "}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              CODE_SERVER_URL
            </code>{" "}
            in your .env file to enable cloud workspaces. Point it to your
            code-server instance (e.g.{" "}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              http://192.168.50.19:8443
            </code>
            ).
          </p>
        </div>
      )}
    </div>
  );
}
