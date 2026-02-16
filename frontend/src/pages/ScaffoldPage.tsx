import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Hammer,
  Eye,
  Check,
  X,
  ChevronRight,
  FileCode,
  Folder,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  ScaffoldJob,
  ScaffoldStatus,
  Canvas,
  CanvasComponent,
  CanvasDetail,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";

const statusColors: Record<ScaffoldStatus, string> = {
  pending: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  generating:
    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  review:
    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  approved:
    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  failed: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

const statusIcons: Record<ScaffoldStatus, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5" />,
  generating: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  review: <Eye className="w-3.5 h-3.5" />,
  approved: <Check className="w-3.5 h-3.5" />,
  rejected: <X className="w-3.5 h-3.5" />,
  failed: <AlertTriangle className="w-3.5 h-3.5" />,
};

/* ---------- file tree helper ---------- */

interface FileTreeNode {
  name: string;
  path: string;
  children: FileTreeNode[];
  content?: string;
}

function buildFileTree(files: Record<string, string>): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const existing = current.find((n) => n.name === name);

      if (i === parts.length - 1) {
        // leaf file
        current.push({ name, path, children: [], content });
      } else if (existing) {
        current = existing.children;
      } else {
        const dir: FileTreeNode = {
          name,
          path: parts.slice(0, i + 1).join("/"),
          children: [],
        };
        current.push(dir);
        current = dir.children;
      }
    }
  }
  return root;
}

function FileTreeItem({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isDir = node.children.length > 0;
  const isSelected = node.path === selectedFile;

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            setOpen(!open);
          } else {
            onSelect(node.path);
          }
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
          isSelected
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "text-gray-700 dark:text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            <ChevronRight
              className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <Folder className="w-3.5 h-3.5 text-amber-500" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileCode className="w-3.5 h-3.5 text-blue-500" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- main page ---------- */

export function ScaffoldPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<ScaffoldJob[]>([]);
  const [loading, setLoading] = useState(true);

  // New scaffold modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState("");
  const [components, setComponents] = useState<CanvasComponent[]>([]);
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string>>(
    new Set(),
  );
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [creating, setCreating] = useState(false);

  // Preview modal
  const [previewJob, setPreviewJob] = useState<ScaffoldJob | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Approve/reject loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<ScaffoldJob[]>(
        `/projects/${projectId}/scaffold`,
      );
      setJobs(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load scaffold jobs";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Load canvases when modal opens
  const openNewModal = async () => {
    setNewModalOpen(true);
    try {
      const data = await api.get<Canvas[]>(`/projects/${projectId}/canvases`);
      setCanvases(data);
    } catch {
      toast("Failed to load canvases", "error");
    }
  };

  // Load components when canvas changes
  useEffect(() => {
    if (!selectedCanvasId || !projectId) {
      setComponents([]);
      setSelectedComponentIds(new Set());
      return;
    }

    let cancelled = false;
    setLoadingComponents(true);

    (async () => {
      try {
        const detail = await api.get<CanvasDetail>(
          `/projects/${projectId}/canvases/${selectedCanvasId}`,
        );
        if (!cancelled) {
          setComponents(detail.components);
          setSelectedComponentIds(new Set());
        }
      } catch {
        if (!cancelled) toast("Failed to load components", "error");
      } finally {
        if (!cancelled) setLoadingComponents(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCanvasId, projectId, toast]);

  const toggleComponent = (id: string) => {
    setSelectedComponentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllComponents = () => {
    if (selectedComponentIds.size === components.length) {
      setSelectedComponentIds(new Set());
    } else {
      setSelectedComponentIds(new Set(components.map((c) => c.id)));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCanvasId) {
      toast("Select a canvas first.", "error");
      return;
    }
    if (selectedComponentIds.size === 0) {
      toast("Select at least one component.", "error");
      return;
    }

    setCreating(true);
    try {
      const job = await api.post<ScaffoldJob>(
        `/projects/${projectId}/scaffold`,
        {
          canvas_id: selectedCanvasId,
          component_ids: Array.from(selectedComponentIds),
        },
      );
      toast("Scaffold job created!", "success");
      setJobs((prev) => [job, ...prev]);
      closeNewModal();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create scaffold job";
      toast(msg, "error");
    } finally {
      setCreating(false);
    }
  };

  const closeNewModal = () => {
    setNewModalOpen(false);
    setSelectedCanvasId("");
    setComponents([]);
    setSelectedComponentIds(new Set());
  };

  const handleApprove = async (jobId: string, approved: boolean) => {
    setActionLoading(jobId);
    try {
      const updated = await api.post<ScaffoldJob>(
        `/projects/${projectId}/scaffold/${jobId}/approve`,
        { approved },
      );
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      toast(approved ? "Scaffold approved!" : "Scaffold rejected.", "success");
      if (previewJob?.id === jobId) {
        setPreviewJob(updated);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast(msg, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const openPreview = (job: ScaffoldJob) => {
    setPreviewJob(job);
    if (job.generated_files) {
      const paths = Object.keys(job.generated_files);
      setSelectedFile(paths.length > 0 ? paths[0] : null);
    } else {
      setSelectedFile(null);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Code Scaffold"
        description="Generate code from canvas components using AI."
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
            <Button onClick={openNewModal}>
              <Plus className="w-4 h-4" />
              New Scaffold
            </Button>
          </div>
        }
      />

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Hammer className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            No scaffold jobs yet
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-4">
            Select components from a canvas and generate code.
          </p>
          <Button onClick={openNewModal} size="sm">
            <Plus className="w-4 h-4" />
            New Scaffold
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <Card key={job.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[job.status]}`}
                  >
                    {statusIcons[job.status]}
                    {job.status}
                  </span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {relativeTime(job.created_at)}
                </span>
              </div>

              <div className="mt-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {job.component_ids.length}{" "}
                  {job.component_ids.length === 1 ? "component" : "components"}
                </p>
                {job.error_message && (
                  <p className="text-xs text-red-500 mt-1 line-clamp-2">
                    {job.error_message}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.04]">
                {job.status === "review" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openPreview(job)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      loading={actionLoading === job.id}
                      onClick={() => handleApprove(job.id, true)}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={actionLoading === job.id}
                      onClick={() => handleApprove(job.id, false)}
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </Button>
                  </>
                )}
                {job.status === "approved" && job.generated_files && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openPreview(job)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Files
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Scaffold Modal */}
      <Modal
        open={newModalOpen}
        onClose={closeNewModal}
        title="New Scaffold Job"
        className="max-w-xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Canvas select */}
          <div>
            <label
              htmlFor="scaffoldCanvas"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Canvas <span className="text-red-500">*</span>
            </label>
            <select
              id="scaffoldCanvas"
              value={selectedCanvasId}
              onChange={(e) => setSelectedCanvasId(e.target.value)}
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

          {/* Components checklist */}
          {selectedCanvasId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Components <span className="text-red-500">*</span>
                </label>
                {components.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllComponents}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {selectedComponentIds.size === components.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                )}
              </div>
              {loadingComponents ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : components.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  No components found in this canvas.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                  {components.map((comp) => (
                    <label
                      key={comp.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedComponentIds.has(comp.id)}
                        onChange={() => toggleComponent(comp.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {comp.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {comp.component_type}
                          {comp.tech_stack ? ` / ${comp.tech_stack}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeNewModal}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={creating}
              disabled={!selectedCanvasId || selectedComponentIds.size === 0}
            >
              <Hammer className="w-4 h-4" />
              Generate Code
            </Button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={!!previewJob}
        onClose={() => {
          setPreviewJob(null);
          setSelectedFile(null);
        }}
        title={`Scaffold Preview${previewJob?.status === "review" ? " (Review)" : ""}`}
        className="max-w-5xl"
      >
        {previewJob?.generated_files ? (
          <div className="flex gap-4 h-[60vh]">
            {/* File tree sidebar */}
            <div className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 pr-3 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                Files
              </p>
              {buildFileTree(previewJob.generated_files).map((node) => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                />
              ))}
            </div>

            {/* Code pane */}
            <div className="flex-1 overflow-auto">
              {selectedFile && previewJob.generated_files[selectedFile] ? (
                <div>
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <FileCode className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                      {selectedFile}
                    </span>
                  </div>
                  <pre className="text-xs leading-relaxed font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 overflow-auto whitespace-pre-wrap">
                    {previewJob.generated_files[selectedFile]}
                  </pre>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
                  Select a file to view its contents
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No generated files available.
          </p>
        )}

        {/* Review actions */}
        {previewJob?.status === "review" && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="danger"
              loading={actionLoading === previewJob.id}
              onClick={() => handleApprove(previewJob.id, false)}
            >
              <X className="w-4 h-4" />
              Reject
            </Button>
            <Button
              loading={actionLoading === previewJob.id}
              onClick={() => handleApprove(previewJob.id, true)}
            >
              <Check className="w-4 h-4" />
              Approve
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
