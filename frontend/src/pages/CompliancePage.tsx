import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Shield,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  MinusCircle,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  ComplianceChecklist,
  ComplianceCheck,
  ComplianceCheckStatus,
  LaunchReadiness,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";

const CHECK_STATUS_CONFIG: Record<
  ComplianceCheckStatus,
  {
    color: string;
    icon: React.ReactNode;
    label: string;
    next: ComplianceCheckStatus;
  }
> = {
  not_started: {
    color: "text-gray-400 dark:text-gray-500",
    icon: <Clock className="w-4 h-4" />,
    label: "Not Started",
    next: "in_progress",
  },
  in_progress: {
    color: "text-blue-400",
    icon: <Loader2 className="w-4 h-4" />,
    label: "In Progress",
    next: "passed",
  },
  passed: {
    color: "text-emerald-400",
    icon: <CheckCircle2 className="w-4 h-4" />,
    label: "Passed",
    next: "not_started",
  },
  failed: {
    color: "text-red-400",
    icon: <XCircle className="w-4 h-4" />,
    label: "Failed",
    next: "not_started",
  },
  waived: {
    color: "text-amber-400",
    icon: <MinusCircle className="w-4 h-4" />,
    label: "Waived",
    next: "not_started",
  },
};

const CATEGORIES = [
  "security",
  "performance",
  "legal",
  "infrastructure",
  "testing",
] as const;

export function CompliancePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [checklists, setChecklists] = useState<ComplianceChecklist[]>([]);
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, ComplianceCheck[]>>({});

  // Create checklist modal
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState("");
  const [newChecklistDesc, setNewChecklistDesc] = useState("");
  const [creatingChecklist, setCreatingChecklist] = useState(false);

  // Add check modal
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [checkChecklistId, setCheckChecklistId] = useState("");
  const [newCheckTitle, setNewCheckTitle] = useState("");
  const [newCheckDesc, setNewCheckDesc] = useState("");
  const [newCheckCategory, setNewCheckCategory] = useState<string>("security");
  const [addingCheck, setAddingCheck] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [cls, rd] = await Promise.all([
        api.get<ComplianceChecklist[]>(`/projects/${projectId}/compliance`),
        api
          .get<LaunchReadiness>(`/projects/${projectId}/compliance/readiness`)
          .catch(() => null),
      ]);
      setChecklists(cls);
      setReadiness(rd);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load compliance data";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExpand = async (checklistId: string) => {
    if (expandedId === checklistId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(checklistId);
    if (!checks[checklistId]) {
      try {
        const detail = await api.get<
          ComplianceChecklist & { checks: ComplianceCheck[] }
        >(`/projects/${projectId}/compliance/${checklistId}`);
        setChecks((prev) => ({ ...prev, [checklistId]: detail.checks }));
      } catch {
        /* ignore */
      }
    }
  };

  const handleCreateChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistName.trim()) {
      toast("Name is required.", "error");
      return;
    }
    setCreatingChecklist(true);
    try {
      const cl = await api.post<ComplianceChecklist>(
        `/projects/${projectId}/compliance`,
        {
          name: newChecklistName.trim(),
          description: newChecklistDesc.trim() || null,
        },
      );
      setChecklists((prev) => [cl, ...prev]);
      setChecklistModalOpen(false);
      setNewChecklistName("");
      setNewChecklistDesc("");
      toast("Checklist created!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create checklist";
      toast(msg, "error");
    } finally {
      setCreatingChecklist(false);
    }
  };

  const handleAddCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckTitle.trim()) {
      toast("Title is required.", "error");
      return;
    }
    setAddingCheck(true);
    try {
      const check = await api.post<ComplianceCheck>(
        `/projects/${projectId}/compliance/${checkChecklistId}/checks`,
        {
          title: newCheckTitle.trim(),
          description: newCheckDesc.trim() || null,
          category: newCheckCategory,
        },
      );
      setChecks((prev) => ({
        ...prev,
        [checkChecklistId]: [...(prev[checkChecklistId] || []), check],
      }));
      setCheckModalOpen(false);
      setNewCheckTitle("");
      setNewCheckDesc("");
      toast("Check added!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add check";
      toast(msg, "error");
    } finally {
      setAddingCheck(false);
    }
  };

  const handleToggleStatus = async (
    checklistId: string,
    check: ComplianceCheck,
  ) => {
    const nextStatus = CHECK_STATUS_CONFIG[check.status].next;
    try {
      const updated = await api.patch<ComplianceCheck>(
        `/projects/${projectId}/compliance/${checklistId}/checks/${check.id}`,
        { status: nextStatus },
      );
      setChecks((prev) => ({
        ...prev,
        [checklistId]: (prev[checklistId] || []).map((c) =>
          c.id === check.id ? updated : c,
        ),
      }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update status";
      toast(msg, "error");
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Launch Readiness"
        description="Track compliance checklists for launch preparation."
        action={
          <Button onClick={() => setChecklistModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            New Checklist
          </Button>
        }
      />

      {/* Readiness score */}
      {readiness && (
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="4"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke={
                    readiness.overall_score >= 80
                      ? "#34d399"
                      : readiness.overall_score >= 50
                        ? "#f59e0b"
                        : "#ef4444"
                  }
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(readiness.overall_score / 100) * 176} 176`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-900 dark:text-white">
                {readiness.overall_score}%
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Launch Readiness
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {readiness.passed} passed, {readiness.failed} failed,{" "}
                {readiness.total - readiness.passed - readiness.failed}{" "}
                remaining
              </p>
              {readiness.blockers.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {readiness.blockers.length} blocker
                  {readiness.blockers.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Checklists */}
      {checklists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
            No checklists yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mb-6">
            Create a checklist to track security, performance, legal, and
            infrastructure requirements for launch.
          </p>
          <Button onClick={() => setChecklistModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            New Checklist
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {checklists.map((cl) => {
            const isExpanded = expandedId === cl.id;
            const clChecks = checks[cl.id] || [];

            return (
              <Card key={cl.id} className="p-0 overflow-hidden">
                <button
                  onClick={() => handleExpand(cl.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {cl.name}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {cl.checks_count} checks
                    </span>
                    {cl.pass_rate !== undefined && (
                      <span
                        className={`text-xs font-medium ${
                          cl.pass_rate >= 80
                            ? "text-emerald-400"
                            : cl.pass_rate >= 50
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {cl.pass_rate}%
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/[0.04]">
                    {cl.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 mb-3">
                        {cl.description}
                      </p>
                    )}
                    {clChecks.length > 0 ? (
                      <div className="space-y-1.5 mt-3">
                        {clChecks.map((check) => {
                          const cfg = CHECK_STATUS_CONFIG[check.status];
                          return (
                            <div
                              key={check.id}
                              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={() =>
                                    handleToggleStatus(cl.id, check)
                                  }
                                  className={`${cfg.color} hover:opacity-80 transition-opacity`}
                                  title={`${cfg.label} — click to advance`}
                                >
                                  {cfg.icon}
                                </button>
                                <div>
                                  <span className="text-sm text-gray-900 dark:text-gray-100">
                                    {check.title}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 ml-2">
                                    {check.category}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-3">
                        No checks added yet.
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-3"
                      onClick={() => {
                        setCheckChecklistId(cl.id);
                        setCheckModalOpen(true);
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Check
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Checklist Modal */}
      <Modal
        open={checklistModalOpen}
        onClose={() => setChecklistModalOpen(false)}
        title="New Checklist"
      >
        <form onSubmit={handleCreateChecklist} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newChecklistName}
              onChange={(e) => setNewChecklistName(e.target.value)}
              placeholder="e.g. Pre-Launch Security"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={newChecklistDesc}
              onChange={(e) => setNewChecklistDesc(e.target.value)}
              placeholder="What this checklist covers..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setChecklistModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creatingChecklist}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Check Modal */}
      <Modal
        open={checkModalOpen}
        onClose={() => setCheckModalOpen(false)}
        title="Add Check"
      >
        <form onSubmit={handleAddCheck} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newCheckTitle}
              onChange={(e) => setNewCheckTitle(e.target.value)}
              placeholder="e.g. SQL injection prevention"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={newCheckCategory}
              onChange={(e) => setNewCheckCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={newCheckDesc}
              onChange={(e) => setNewCheckDesc(e.target.value)}
              placeholder="What needs to be verified..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCheckModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={addingCheck}>
              Add Check
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
