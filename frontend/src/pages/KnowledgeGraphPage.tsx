import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Search,
  Network,
  GitBranch,
  Trash2,
  Filter,
  Sparkles,
  Database,
  Cloud,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  KnowledgeEntity,
  KnowledgeRelation,
  GraphData,
  GraphNode,
  GraphEdge,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { useAIChat } from "../contexts/AIChatContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";

const ENTITY_TYPES = [
  "concept",
  "technology",
  "decision",
  "component",
] as const;
const RELATION_TYPES = [
  "depends_on",
  "uses",
  "implements",
  "relates_to",
] as const;

const entityTypeColors: Record<string, string> = {
  concept: "#8b5cf6", // violet
  technology: "#3b82f6", // blue
  decision: "#f59e0b", // amber
  component: "#10b981", // emerald
};

const entityTypeBadge: Record<string, string> = {
  concept:
    "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  technology:
    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  decision:
    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  component:
    "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
};

/* ---------- Force Graph Component ---------- */

interface ForceNode {
  id: string;
  name: string;
  entity_type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ForceEdge {
  source: string;
  target: string;
  relation_type: string;
}

function ForceGraph({
  nodes: rawNodes,
  edges,
  width,
  height,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}) {
  const nodesRef = useRef<ForceNode[]>([]);
  const [renderTick, setRenderTick] = useState(0);
  const frameRef = useRef<number>(0);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Initialize nodes with random positions
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = rawNodes.map((n) => {
      const prev = existing.get(n.id);
      if (prev) return { ...prev, name: n.name, entity_type: n.entity_type };
      return {
        id: n.id,
        name: n.name,
        entity_type: n.entity_type,
        x: width / 2 + (Math.random() - 0.5) * 200,
        y: height / 2 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
      };
    });
    setRenderTick((t) => t + 1);
  }, [rawNodes, width, height]);

  // Force simulation loop
  useEffect(() => {
    let running = true;
    let alpha = 1;

    function tick() {
      if (!running) return;

      const nodes = nodesRef.current;
      const damping = 0.9;
      alpha *= 0.995;

      if (alpha < 0.001) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (200 * alpha) / (dist * dist);
          dx *= force;
          dy *= force;

          if (a.id !== dragNode) {
            a.vx -= dx;
            a.vy -= dy;
          }
          if (b.id !== dragNode) {
            b.vx += dx;
            b.vy += dy;
          }
        }
      }

      // Attraction along edges
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.02 * alpha;

        if (a.id !== dragNode) {
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }
        if (b.id !== dragNode) {
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        }
      }

      // Center gravity
      const cx = width / 2;
      const cy = height / 2;
      for (const n of nodes) {
        if (n.id === dragNode) continue;
        n.vx += (cx - n.x) * 0.002 * alpha;
        n.vy += (cy - n.y) * 0.002 * alpha;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
        // Clamp to bounds
        n.x = Math.max(30, Math.min(width - 30, n.x));
        n.y = Math.max(30, Math.min(height - 30, n.y));
      }

      setRenderTick((t) => t + 1);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [edges, width, height, dragNode]);

  const nodeMap = useMemo(() => {
    void renderTick; // dependency
    return new Map(nodesRef.current.map((n) => [n.id, n]));
  }, [renderTick]);

  const handleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragNode(id);
  };

  useEffect(() => {
    if (!dragNode) return;

    const handleMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const node = nodesRef.current.find((n) => n.id === dragNode);
      if (node) {
        node.x = e.clientX - rect.left;
        node.y = e.clientY - rect.top;
        node.vx = 0;
        node.vy = 0;
        setRenderTick((t) => t + 1);
      }
    };

    const handleUp = () => setDragNode(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragNode]);

  if (nodesRef.current.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        <div className="text-center">
          <Network className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Select a start node and traverse to see the graph</p>
        </div>
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-gray-50 dark:bg-gray-800/30 rounded-lg"
    >
      {/* Edges */}
      {edges.map((e, i) => {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) return null;
        return (
          <g key={`edge-${i}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 6}
              textAnchor="middle"
              fontSize={9}
              fill="#94a3b8"
            >
              {e.relation_type}
            </text>
          </g>
        );
      })}
      {/* Nodes */}
      {nodesRef.current.map((n) => (
        <g
          key={n.id}
          onMouseDown={handleMouseDown(n.id)}
          style={{ cursor: dragNode === n.id ? "grabbing" : "grab" }}
        >
          <circle
            cx={n.x}
            cy={n.y}
            r={18}
            fill={entityTypeColors[n.entity_type] || "#6b7280"}
            fillOpacity={0.8}
            stroke={entityTypeColors[n.entity_type] || "#6b7280"}
            strokeWidth={2}
          />
          <text
            x={n.x}
            y={n.y + 30}
            textAnchor="middle"
            fontSize={11}
            fontWeight={500}
            fill="currentColor"
            className="text-gray-700 dark:text-gray-300"
          >
            {n.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- Main Page ---------- */

export function KnowledgeGraphPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { open: openChat } = useAIChat();

  const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
  const [relations, setRelations] = useState<KnowledgeRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");

  // Data source: "local" (SQLite) or "recall"
  const [dataSource, setDataSource] = useState<"local" | "recall">("local");
  const [migrating, setMigrating] = useState(false);

  // Add entity form
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<string>(ENTITY_TYPES[0]);
  const [addDesc, setAddDesc] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Relation modal
  const [relationModalOpen, setRelationModalOpen] = useState(false);
  const [relSourceId, setRelSourceId] = useState("");
  const [relTargetId, setRelTargetId] = useState("");
  const [relType, setRelType] = useState<string>(RELATION_TYPES[0]);
  const [relLoading, setRelLoading] = useState(false);

  // Graph state
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [startNodeId, setStartNodeId] = useState("");
  const [graphLoading, setGraphLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeEntity[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);

  // Graph container sizing
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 600, height: 500 });

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGraphSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fetchEntities = useCallback(async () => {
    if (!projectId) return;
    try {
      const params = typeFilter ? `?entity_type=${typeFilter}` : "";
      const data = await api.get<KnowledgeEntity[]>(
        `/projects/${projectId}/knowledge/entities${params}`,
      );
      setEntities(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load entities";
      toast(msg, "error");
    }
  }, [projectId, typeFilter, toast]);

  const fetchRelations = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<KnowledgeRelation[]>(
        `/projects/${projectId}/knowledge/relations`,
      );
      setRelations(data);
    } catch {
      // silent - relations are secondary
    }
  }, [projectId]);

  const fetchRecallGraph = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<GraphData>(
        `/projects/${projectId}/knowledge/recall-graph`,
      );
      setGraphData(data);
      // Map Recall nodes to entity-like list for the sidebar
      const recallEntities: KnowledgeEntity[] = data.nodes.map((n) => ({
        id: n.id,
        project_id: projectId,
        name: n.name,
        entity_type: n.entity_type,
        description: null,
        path: null,
        metadata_json: null,
        source_type: "recall",
        source_id: null,
        created_at: new Date().toISOString(),
      }));
      setEntities(recallEntities);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load Recall graph";
      toast(msg, "error");
    }
  }, [projectId, toast]);

  const handleMigrate = async () => {
    if (!projectId) return;
    setMigrating(true);
    try {
      const result = await api.post<{
        migrated_entities: number;
        migrated_relations: number;
      }>(`/projects/${projectId}/knowledge/migrate`);
      toast(
        `Migrated ${result.migrated_entities} entities and ${result.migrated_relations} relations to Recall.`,
        "success",
      );
      setDataSource("recall");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Migration failed";
      toast(msg, "error");
    } finally {
      setMigrating(false);
    }
  };

  useEffect(() => {
    if (dataSource === "recall") {
      setLoading(true);
      fetchRecallGraph().finally(() => setLoading(false));
    } else {
      setLoading(true);
      Promise.all([fetchEntities(), fetchRelations()]).finally(() =>
        setLoading(false),
      );
    }
  }, [dataSource, fetchEntities, fetchRelations, fetchRecallGraph]);

  const handleAddEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      toast("Entity name is required.", "error");
      return;
    }

    setAddLoading(true);
    try {
      const entity = await api.post<KnowledgeEntity>(
        `/projects/${projectId}/knowledge/entities`,
        {
          name: addName.trim(),
          entity_type: addType,
          description: addDesc.trim() || null,
        },
      );
      setEntities((prev) => [entity, ...prev]);
      setAddName("");
      setAddDesc("");
      toast("Entity created!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create entity";
      toast(msg, "error");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteEntity = async (id: string) => {
    try {
      await api.delete(`/projects/${projectId}/knowledge/entities/${id}`);
      setEntities((prev) => prev.filter((e) => e.id !== id));
      toast("Entity deleted.", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete entity";
      toast(msg, "error");
    }
  };

  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSourceId || !relTargetId) {
      toast("Select source and target entities.", "error");
      return;
    }
    if (relSourceId === relTargetId) {
      toast("Source and target must be different.", "error");
      return;
    }

    setRelLoading(true);
    try {
      const rel = await api.post<KnowledgeRelation>(
        `/projects/${projectId}/knowledge/relations`,
        {
          source_id: relSourceId,
          target_id: relTargetId,
          relation_type: relType,
        },
      );
      setRelations((prev) => [rel, ...prev]);
      setRelationModalOpen(false);
      setRelSourceId("");
      setRelTargetId("");
      toast("Relation created!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create relation";
      toast(msg, "error");
    } finally {
      setRelLoading(false);
    }
  };

  const handleTraverse = async () => {
    if (!startNodeId) {
      toast("Select a start node.", "error");
      return;
    }
    setGraphLoading(true);
    try {
      const data = await api.post<GraphData>(
        `/projects/${projectId}/knowledge/traverse`,
        { start_id: startNodeId, max_depth: 3 },
      );
      setGraphData(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Traversal failed";
      toast(msg, "error");
    } finally {
      setGraphLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      if (dataSource === "recall") {
        const results = await api.post<Record<string, unknown>[]>(
          `/projects/${projectId}/knowledge/recall-search`,
          { query: searchQuery.trim() },
        );
        // Map Recall results to KnowledgeEntity shape
        const mapped: KnowledgeEntity[] = results.map((r) => ({
          id: (r.id as string) || crypto.randomUUID(),
          project_id: projectId!,
          name: ((r.content as string) || "").split(":")[0].trim().slice(0, 60),
          entity_type: ((r.tags as string[]) || [])[0] || "concept",
          description: (r.content as string) || null,
          path: null,
          metadata_json: null,
          source_type: "recall",
          source_id: null,
          created_at: (r.created_at as string) || new Date().toISOString(),
        }));
        setSearchResults(mapped);
      } else {
        const results = await api.post<KnowledgeEntity[]>(
          `/projects/${projectId}/knowledge/search`,
          { query: searchQuery.trim() },
        );
        setSearchResults(results);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      toast(msg, "error");
    } finally {
      setSearching(false);
    }
  };

  const displayedEntities = searchResults ?? entities;

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Knowledge Graph"
        description="Map entities, relationships, and project knowledge."
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
            {/* Data source toggle */}
            <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setDataSource("local")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  dataSource === "local"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <Database className="w-3 h-3" />
                Local
              </button>
              <button
                onClick={() => setDataSource("recall")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  dataSource === "recall"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <Cloud className="w-3 h-3" />
                Recall
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMigrate}
              loading={migrating}
              title="Migrate local knowledge to Recall"
            >
              Migrate
            </Button>
            <Button
              size="sm"
              onClick={() => setRelationModalOpen(true)}
              disabled={dataSource === "recall"}
            >
              <GitBranch className="w-4 h-4" />
              Add Relation
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left panel: entities */}
        <div className="w-80 shrink-0 flex flex-col gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                placeholder="Semantic search..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <Button size="sm" type="submit" loading={searching}>
              <Search className="w-3.5 h-3.5" />
            </Button>
          </form>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setSearchResults(null);
              }}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Entity list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {displayedEntities.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                {searchResults ? "No search results" : "No entities yet"}
              </p>
            ) : (
              displayedEntities.map((entity) => (
                <Card key={entity.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {entity.name}
                        </p>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${entityTypeBadge[entity.entity_type] || "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
                        >
                          {entity.entity_type}
                        </span>
                      </div>
                      {entity.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {entity.description}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {relativeTime(entity.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() =>
                          openChat({
                            page: "knowledge",
                            component_id: entity.id,
                          })
                        }
                        className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-500"
                        title="Ask AI about this entity"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEntity(entity.id)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Add entity form */}
          <Card className="p-3 shrink-0">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Add Entity
            </p>
            <form onSubmit={handleAddEntity} className="space-y-2">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Entity name"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <Button
                type="submit"
                size="sm"
                loading={addLoading}
                className="w-full"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </form>
          </Card>
        </div>

        {/* Right panel: graph */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Graph controls */}
          {dataSource === "local" && (
            <div className="flex items-center gap-2 mb-3">
              <select
                value={startNodeId}
                onChange={(e) => setStartNodeId(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select start node...</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.entity_type})
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleTraverse}
                loading={graphLoading}
                disabled={!startNodeId}
              >
                <Network className="w-3.5 h-3.5" />
                Traverse
              </Button>
            </div>
          )}
          {dataSource === "recall" && (
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
              <Cloud className="w-4 h-4" />
              <span>Showing knowledge from Recall — graph auto-loaded</span>
            </div>
          )}

          {/* Graph visualization */}
          <div
            ref={graphContainerRef}
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            <ForceGraph
              nodes={graphData.nodes}
              edges={graphData.edges}
              width={graphSize.width}
              height={graphSize.height}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2">
            {ENTITY_TYPES.map((t) => (
              <div
                key={t}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entityTypeColors[t] }}
                />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Relation Modal */}
      <Modal
        open={relationModalOpen}
        onClose={() => {
          setRelationModalOpen(false);
          setRelSourceId("");
          setRelTargetId("");
        }}
        title="Add Relation"
      >
        <form onSubmit={handleAddRelation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source Entity <span className="text-red-500">*</span>
            </label>
            <select
              value={relSourceId}
              onChange={(e) => setRelSourceId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Select source...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Relation Type <span className="text-red-500">*</span>
            </label>
            <select
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {RELATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target Entity <span className="text-red-500">*</span>
            </label>
            <select
              value={relTargetId}
              onChange={(e) => setRelTargetId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Select target...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRelationModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={relLoading}
              disabled={!relSourceId || !relTargetId}
            >
              <GitBranch className="w-4 h-4" />
              Create Relation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
