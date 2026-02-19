import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  Plus,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  AgentRun,
  AgentRunStatus,
  AgentRunType,
  AgentFinding,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";

const STATUS_CONFIG: Record<
  AgentRunStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  queued: {
    color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    icon: <Clock className="w-3.5 h-3.5" />,
    label: "Queued",
  },
  running: {
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    label: "Running",
  },
  completed: {
    color:
      "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: "Completed",
  },
  failed: {
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: "Failed",
  },
};

const SEVERITY_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode }
> = {
  info: {
    color: "text-blue-400",
    icon: <Info className="w-3.5 h-3.5" />,
  },
  warning: {
    color: "text-amber-400",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  error: {
    color: "text-red-400",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  critical: {
    color: "text-rose-500",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

const AGENT_TYPES: AgentRunType[] = [
  "scaffold",
  "feasibility",
  "embedding",
  "custom",
];

export function PipelinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [findings, setFindings] = useState<Record<string, AgentFinding[]>>({});

  // Filters
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [newType, setNewType] = useState<AgentRunType>("scaffold");
  const [newInput, setNewInput] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchRuns = useCallback(async () => {
    if (!projectId) return;
    try {
      let url = `/projects/${projectId}/pipeline`;
      const params: string[] = [];
      if (filterType) params.push(`agent_type=${filterType}`);
      if (filterStatus) params.push(`status=${filterStatus}`);
      if (params.length > 0) url += `?${params.join("&")}`;

      const data = await api.get<AgentRun[]>(url);
      setRuns(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load pipeline";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, filterType, filterStatus, toast]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleExpand = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!findings[runId]) {
      try {
        const detail = await api.get<AgentRun & { findings: AgentFinding[] }>(
          `/projects/${projectId}/pipeline/${runId}`,
        );
        setFindings((prev) => ({ ...prev, [runId]: detail.findings }));
      } catch {
        /* ignore */
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      let inputJson = {};
      if (newInput.trim()) {
        inputJson = JSON.parse(newInput);
      }
      const run = await api.post<AgentRun>(`/projects/${projectId}/pipeline`, {
        agent_type: newType,
        input_json: inputJson,
      });
      setRuns((prev) => [run, ...prev]);
      setModalOpen(false);
      setNewInput("");
      toast("Agent run triggered!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to trigger run";
      toast(msg, "error");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Agent Pipeline"
        description="Track AI agent runs — scaffolding, analysis, embeddings."
        action={
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            Trigger Run
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All types</option>
          {AGENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as AgentRunStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
      </div>

      {/* Runs list */}
      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
            <Activity className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
            No agent runs yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mb-6">
            Trigger an agent run to scaffold code, analyze feasibility, or
            generate embeddings.
          </p>
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            Trigger Run
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const cfg = STATUS_CONFIG[run.status];
            const isExpanded = expandedRunId === run.id;
            const runFindings = findings[run.id] || [];

            return (
              <Card key={run.id} className="p-0 overflow-hidden">
                <button
                  onClick={() => handleExpand(run.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {run.agent_type}
                    </span>
                    {run.findings_count > 0 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {run.findings_count} findings
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {relativeTime(run.created_at)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/[0.04]">
                    {run.error_message && (
                      <div className="mt-3 p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-sm text-red-400">
                        {run.error_message}
                      </div>
                    )}
                    {runFindings.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {runFindings.map((f) => {
                          const sev =
                            SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
                          return (
                            <div
                              key={f.id}
                              className="flex items-start gap-2 text-sm"
                            >
                              <span className={sev.color}>{sev.icon}</span>
                              <div>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {f.title}
                                </span>
                                {f.description && (
                                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                                    {f.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!run.error_message && runFindings.length === 0 && (
                      <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
                        No findings for this run.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Trigger Run Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Trigger Agent Run"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Agent Type
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as AgentRunType)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Input JSON (optional)
            </label>
            <textarea
              value={newInput}
              onChange={(e) => setNewInput(e.target.value)}
              placeholder='{"key": "value"}'
              rows={4}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Trigger Run
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
