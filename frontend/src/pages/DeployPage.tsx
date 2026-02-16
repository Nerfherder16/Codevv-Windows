import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Rocket,
  FileCode2,
  Server,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  Terminal,
} from "lucide-react";
import { api } from "../lib/api";
import type { Environment, DeployJob, DeployStatus, Canvas } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";

const deployStatusConfig: Record<
  DeployStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    icon: <Clock className="w-3.5 h-3.5" />,
    label: "Pending",
  },
  running: {
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    label: "Running",
  },
  success: {
    color:
      "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: "Success",
  },
  failed: {
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: "Failed",
  },
  cancelled: {
    color:
      "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    icon: <Ban className="w-3.5 h-3.5" />,
    label: "Cancelled",
  },
};

/* ---------- Log Streamer ---------- */

function LogStream({ projectId, jobId }: { projectId: string; jobId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([]);
    setDone(false);

    const eventSource = new EventSource(
      `/api/projects/${projectId}/deploy/jobs/${jobId}/logs`,
    );

    eventSource.addEventListener("log", (e) => {
      setLogs((prev) => [...prev, e.data]);
    });

    eventSource.addEventListener("done", () => {
      setDone(true);
      eventSource.close();
    });

    eventSource.onerror = () => {
      setDone(true);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [projectId, jobId]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Deploy Logs
        </span>
        {!done && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
        {done && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Stream ended
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="max-h-48 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 leading-relaxed"
      >
        {logs.length === 0 && !done && (
          <span className="text-gray-500">Waiting for logs...</span>
        )}
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {done && logs.length === 0 && (
          <span className="text-gray-500">No log output.</span>
        )}
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export function DeployPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [deployJobs, setDeployJobs] = useState<DeployJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Create environment modal
  const [createEnvOpen, setCreateEnvOpen] = useState(false);
  const [envName, setEnvName] = useState("");
  const [creatingEnv, setCreatingEnv] = useState(false);

  // Generate compose modal
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [composeEnvName, setComposeEnvName] = useState("");
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [composeCanvasId, setComposeCanvasId] = useState("");
  const [generatingCompose, setGeneratingCompose] = useState(false);

  // Preview YAML modal
  const [previewEnv, setPreviewEnv] = useState<Environment | null>(null);

  // Deploy loading
  const [deploying, setDeploying] = useState<string | null>(null);

  // Expanded job (for log streaming)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [envs, jobs] = await Promise.all([
        api.get<Environment[]>(`/projects/${projectId}/deploy/environments`),
        api
          .get<DeployJob[]>(`/projects/${projectId}/deploy/jobs`)
          .catch(() => [] as DeployJob[]),
      ]);
      setEnvironments(envs);
      setDeployJobs(jobs);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load deploy data";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envName.trim()) {
      toast("Environment name is required.", "error");
      return;
    }

    setCreatingEnv(true);
    try {
      const env = await api.post<Environment>(
        `/projects/${projectId}/deploy/environments`,
        { name: envName.trim() },
      );
      setEnvironments((prev) => [env, ...prev]);
      setCreateEnvOpen(false);
      setEnvName("");
      toast("Environment created!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create environment";
      toast(msg, "error");
    } finally {
      setCreatingEnv(false);
    }
  };

  const openComposeModal = async (envName?: string) => {
    setComposeModalOpen(true);
    setComposeEnvName(envName || "dev");
    try {
      const data = await api.get<Canvas[]>(`/projects/${projectId}/canvases`);
      setCanvases(data);
    } catch {
      toast("Failed to load canvases", "error");
    }
  };

  const handleGenerateCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeCanvasId) {
      toast("Select a canvas.", "error");
      return;
    }
    if (!composeEnvName.trim()) {
      toast("Environment name is required.", "error");
      return;
    }

    setGeneratingCompose(true);
    try {
      const env = await api.post<Environment>(
        `/projects/${projectId}/deploy/generate-compose`,
        {
          canvas_id: composeCanvasId,
          environment_name: composeEnvName.trim(),
        },
      );
      // Update or add the environment
      setEnvironments((prev) => {
        const idx = prev.findIndex((e) => e.id === env.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = env;
          return copy;
        }
        return [env, ...prev];
      });
      setComposeModalOpen(false);
      setPreviewEnv(env);
      toast("Compose file generated!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate compose";
      toast(msg, "error");
    } finally {
      setGeneratingCompose(false);
    }
  };

  const handleDeploy = async (environmentId: string) => {
    setDeploying(environmentId);
    try {
      const job = await api.post<DeployJob>(
        `/projects/${projectId}/deploy/jobs`,
        { environment_id: environmentId },
      );
      setDeployJobs((prev) => [job, ...prev]);
      setExpandedJobId(job.id);
      toast("Deploy job started!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start deploy";
      toast(msg, "error");
    } finally {
      setDeploying(null);
    }
  };

  // Find deploy jobs for an environment
  const jobsForEnv = (envId: string) =>
    deployJobs.filter((j) => j.environment_id === envId);

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Deploy"
        description="Manage environments, generate Docker Compose, and deploy."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button variant="secondary" onClick={() => openComposeModal()}>
              <FileCode2 className="w-4 h-4" />
              Generate Compose
            </Button>
            <Button onClick={() => setCreateEnvOpen(true)}>
              <Plus className="w-4 h-4" />
              New Environment
            </Button>
          </div>
        }
      />

      {/* Environment list */}
      {environments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Server className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            No environments yet
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-4">
            Create an environment to start deploying.
          </p>
          <Button onClick={() => setCreateEnvOpen(true)} size="sm">
            <Plus className="w-4 h-4" />
            New Environment
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {environments.map((env) => {
            const envJobs = jobsForEnv(env.id);

            return (
              <Card key={env.id} className="p-5">
                {/* Environment header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {env.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Created {relativeTime(env.created_at)}
                        </span>
                        {env.compose_yaml ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <FileCode2 className="w-3 h-3" />
                            Compose ready
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            No compose file
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {env.compose_yaml && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewEnv(env)}
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        View YAML
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openComposeModal(env.name)}
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      Generate
                    </Button>
                    {env.compose_yaml && (
                      <Button
                        size="sm"
                        loading={deploying === env.id}
                        onClick={() => handleDeploy(env.id)}
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        Deploy
                      </Button>
                    )}
                  </div>
                </div>

                {/* Deploy jobs for this environment */}
                {envJobs.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Deploy History
                    </p>
                    <div className="space-y-2">
                      {envJobs.map((job) => {
                        const cfg = deployStatusConfig[job.status];
                        const isExpanded = expandedJobId === job.id;

                        return (
                          <div key={job.id}>
                            <div
                              onClick={() =>
                                setExpandedJobId(isExpanded ? null : job.id)
                              }
                              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}
                                >
                                  {cfg.icon}
                                  {cfg.label}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  {job.id.slice(0, 8)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                                {job.started_at && (
                                  <span>
                                    Started {relativeTime(job.started_at)}
                                  </span>
                                )}
                                {job.completed_at && (
                                  <span>
                                    Completed {relativeTime(job.completed_at)}
                                  </span>
                                )}
                                {!job.started_at && (
                                  <span>
                                    Created {relativeTime(job.created_at)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Log stream for expanded job */}
                            {isExpanded &&
                              (job.status === "running" ||
                                job.status === "pending") && (
                                <LogStream
                                  projectId={projectId!}
                                  jobId={job.id}
                                />
                              )}
                            {isExpanded && job.logs && (
                              <div className="mt-2">
                                <pre className="max-h-48 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 leading-relaxed whitespace-pre-wrap">
                                  {job.logs}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Environment Modal */}
      <Modal
        open={createEnvOpen}
        onClose={() => {
          setCreateEnvOpen(false);
          setEnvName("");
        }}
        title="New Environment"
      >
        <form onSubmit={handleCreateEnv} className="space-y-4">
          <div>
            <label
              htmlFor="envName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Environment Name <span className="text-red-500">*</span>
            </label>
            <input
              id="envName"
              type="text"
              value={envName}
              onChange={(e) => setEnvName(e.target.value)}
              placeholder="e.g. dev, staging, production"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateEnvOpen(false);
                setEnvName("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creatingEnv}>
              Create Environment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Generate Compose Modal */}
      <Modal
        open={composeModalOpen}
        onClose={() => {
          setComposeModalOpen(false);
          setComposeCanvasId("");
          setComposeEnvName("");
        }}
        title="Generate Docker Compose"
      >
        <form onSubmit={handleGenerateCompose} className="space-y-4">
          <div>
            <label
              htmlFor="composeCanvas"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Canvas <span className="text-red-500">*</span>
            </label>
            <select
              id="composeCanvas"
              value={composeCanvasId}
              onChange={(e) => setComposeCanvasId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="">Select a canvas...</option>
              {canvases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.component_count} components)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="composeEnv"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Environment Name <span className="text-red-500">*</span>
            </label>
            <input
              id="composeEnv"
              type="text"
              value={composeEnvName}
              onChange={(e) => setComposeEnvName(e.target.value)}
              placeholder="e.g. dev"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setComposeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={generatingCompose}
              disabled={!composeCanvasId}
            >
              <FileCode2 className="w-4 h-4" />
              Generate
            </Button>
          </div>
        </form>
      </Modal>

      {/* YAML Preview Modal */}
      <Modal
        open={!!previewEnv}
        onClose={() => setPreviewEnv(null)}
        title={`Compose - ${previewEnv?.name || ""}`}
        className="max-w-3xl"
      >
        {previewEnv?.compose_yaml ? (
          <pre className="max-h-[60vh] overflow-auto bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 font-mono text-xs text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
            {previewEnv.compose_yaml}
          </pre>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No compose YAML generated for this environment.
          </p>
        )}
      </Modal>
    </div>
  );
}
