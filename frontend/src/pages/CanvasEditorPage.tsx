import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
// tldraw removed for desktop build — using placeholder canvas
import {
  ArrowLeft,
  Plus,
  Layers,
  Server,
  Database,
  HardDrive,
  Globe,
  Monitor,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { CanvasDetail, CanvasComponent } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { PageLoading } from "../components/common/LoadingSpinner";

const COMPONENT_TYPES = [
  "service",
  "database",
  "queue",
  "cache",
  "frontend",
  "gateway",
] as const;

type ComponentType = (typeof COMPONENT_TYPES)[number];

const typeIcons: Record<ComponentType, React.ReactNode> = {
  service: <Server className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  queue: <HardDrive className="w-4 h-4" />,
  cache: <HardDrive className="w-4 h-4" />,
  frontend: <Monitor className="w-4 h-4" />,
  gateway: <ShieldCheck className="w-4 h-4" />,
};

const typeColors: Record<ComponentType, string> = {
  service: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  database:
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  queue: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  cache:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  frontend: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  gateway:
    "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
};

export function CanvasEditorPage() {
  const { projectId, canvasId } = useParams<{
    projectId: string;
    canvasId: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [canvas, setCanvas] = useState<CanvasDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  // Add-component form state
  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState<ComponentType>("service");
  const [compTechStack, setCompTechStack] = useState("");
  const [compDescription, setCompDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchCanvas = useCallback(async () => {
    if (!projectId || !canvasId) return;

    try {
      const data = await api.get<CanvasDetail>(
        `/projects/${projectId}/canvases/${canvasId}`,
      );
      setCanvas(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load canvas";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, canvasId, toast]);

  useEffect(() => {
    fetchCanvas();
  }, [fetchCanvas]);

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!compName.trim()) {
      toast("Component name is required.", "error");
      return;
    }

    setAdding(true);
    try {
      const component = await api.post<CanvasComponent>(
        `/projects/${projectId}/canvases/${canvasId}/components`,
        {
          name: compName.trim(),
          component_type: compType,
          tech_stack: compTechStack.trim() || null,
          description: compDescription.trim() || null,
        },
      );

      setCanvas((prev) =>
        prev
          ? {
              ...prev,
              components: [...prev.components, component],
              component_count: prev.component_count + 1,
            }
          : prev,
      );

      toast("Component added!", "success");
      setCompName("");
      setCompTechStack("");
      setCompDescription("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add component";
      toast(message, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteComponent = async (componentId: string) => {
    try {
      await api.delete(
        `/projects/${projectId}/canvases/${canvasId}/components/${componentId}`,
      );
      setCanvas((prev) =>
        prev
          ? {
              ...prev,
              components: prev.components.filter((c) => c.id !== componentId),
              component_count: Math.max(0, prev.component_count - 1),
            }
          : prev,
      );
      toast("Component removed.", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete component";
      toast(message, "error");
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (!canvas) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Layers className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
          Canvas not found
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate(`/projects/${projectId}/canvases`)}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Canvases
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/canvases`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {canvas.name}
          </h1>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {canvas.component_count}{" "}
            {canvas.component_count === 1 ? "component" : "components"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
          Components
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <Layers className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Architecture Canvas</p>
            <p className="text-sm mt-1">Add components using the side panel</p>
          </div>
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden shrink-0">
            {/* Add component form */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Add Component
              </h2>
              <form onSubmit={handleAddComponent} className="space-y-3">
                <div>
                  <label
                    htmlFor="compName"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="compName"
                    type="text"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="e.g. User Service"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="compType"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Type
                  </label>
                  <select
                    id="compType"
                    value={compType}
                    onChange={(e) =>
                      setCompType(e.target.value as ComponentType)
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    {COMPONENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="compTech"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Tech Stack
                  </label>
                  <input
                    id="compTech"
                    type="text"
                    value={compTechStack}
                    onChange={(e) => setCompTechStack(e.target.value)}
                    placeholder="e.g. FastAPI, PostgreSQL"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="compDesc"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="compDesc"
                    value={compDescription}
                    onChange={(e) => setCompDescription(e.target.value)}
                    placeholder="What does this component do?"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  size="sm"
                  loading={adding}
                  className="w-full"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Component
                </Button>
              </form>
            </div>

            {/* Components list */}
            <div className="flex-1 overflow-y-auto p-4">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Components ({canvas.components.length})
              </h2>

              {canvas.components.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  No components yet. Add one above.
                </p>
              ) : (
                <div className="space-y-2">
                  {canvas.components.map((comp) => {
                    const ct = comp.component_type as ComponentType;
                    return (
                      <div
                        key={comp.id}
                        className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${typeColors[ct] || typeColors.service}`}
                            >
                              {typeIcons[ct] || <Globe className="w-4 h-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {comp.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {comp.component_type}
                                {comp.tech_stack && ` - ${comp.tech_stack}`}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteComponent(comp.id)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0"
                            title="Remove component"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {comp.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                            {comp.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
