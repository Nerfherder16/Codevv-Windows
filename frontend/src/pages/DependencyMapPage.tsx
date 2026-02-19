import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { GitBranch, AlertTriangle, Zap, X } from "lucide-react";
import * as d3 from "d3";
import { api } from "../lib/api";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";

const TYPE_COLORS: Record<string, string> = {
  service: "#38bdf8",
  database: "#8b5cf6",
  queue: "#f59e0b",
  api: "#34d399",
  frontend: "#f472b6",
  default: "#626480",
};

export function DependencyMapPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);

  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<DependencyNode | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [cycles, setCycles] = useState<string[][]>([]);

  const fetchGraph = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<DependencyGraph>(
        `/projects/${projectId}/dependencies`,
      );
      setGraph(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load dependencies";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  const fetchCycles = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<string[][]>(
        `/projects/${projectId}/dependencies/cycles`,
      );
      setCycles(data);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    fetchGraph();
    fetchCycles();
  }, [fetchGraph, fetchCycles]);

  const handleNodeClick = async (node: DependencyNode) => {
    setSelectedNode(node);
    try {
      const data = await api.get<{ impact_count: number }>(
        `/projects/${projectId}/dependencies/${node.id}/impact`,
      );
      setImpact(data.impact_count);
    } catch {
      setImpact(null);
    }
  };

  // D3 force-directed graph
  useEffect(() => {
    if (!graph || !svgRef.current || graph.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => g.attr("transform", event.transform)),
    );

    const simulation = d3
      .forceSimulation(graph.nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(graph.edges)
          .id((d: unknown) => (d as DependencyNode).id)
          .distance(120),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Edges
    const link = g
      .append("g")
      .selectAll("line")
      .data(graph.edges)
      .join("line")
      .attr("stroke", "rgba(255,255,255,0.08)")
      .attr("stroke-width", 1.5);

    // Nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(graph.nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_event, d) => handleNodeClick(d as DependencyNode));

    node
      .append("circle")
      .attr("r", 20)
      .attr(
        "fill",
        (d: unknown) =>
          TYPE_COLORS[(d as DependencyNode).component_type] ||
          TYPE_COLORS.default,
      )
      .attr("fill-opacity", 0.2)
      .attr(
        "stroke",
        (d: unknown) =>
          TYPE_COLORS[(d as DependencyNode).component_type] ||
          TYPE_COLORS.default,
      )
      .attr("stroke-width", 1.5);

    node
      .append("text")
      .text((d: unknown) => (d as DependencyNode).name)
      .attr("text-anchor", "middle")
      .attr("dy", 32)
      .attr("fill", "#8f91ab")
      .attr("font-size", 11);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: unknown) => (d as { source: { x: number } }).source.x)
        .attr("y1", (d: unknown) => (d as { source: { y: number } }).source.y)
        .attr("x2", (d: unknown) => (d as { target: { x: number } }).target.x)
        .attr("y2", (d: unknown) => (d as { target: { y: number } }).target.y);

      node.attr(
        "transform",
        (d: unknown) =>
          `translate(${(d as { x: number }).x},${(d as { y: number }).y})`,
      );
    });

    return () => {
      simulation.stop();
    };
  }, [graph, projectId]);

  if (loading) return <PageLoading />;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dependency Map"
        description={
          graph
            ? `${graph.stats.node_count} nodes, ${graph.stats.edge_count} edges`
            : "Visualize component dependencies."
        }
      />

      {/* Cycle warnings */}
      {cycles.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-rose-400">
              {cycles.length} circular{" "}
              {cycles.length === 1 ? "dependency" : "dependencies"} detected
            </p>
            <p className="text-xs text-rose-400/70 mt-0.5">
              Circular dependencies can cause build and runtime issues.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 relative min-h-[500px]">
        {!graph || graph.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
              <GitBranch className="w-7 h-7 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
              No dependencies found
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
              Add components to your canvas and define relations in the
              Knowledge Graph to see the dependency map.
            </p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-gray-950"
          />
        )}

        {/* Selected node panel */}
        {selectedNode && (
          <Card className="absolute top-4 right-4 w-72 p-4">
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {selectedNode.name}
              </h4>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg hover:bg-white/[0.05] text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Type</span>
                <span
                  className="font-medium"
                  style={{
                    color:
                      TYPE_COLORS[selectedNode.component_type] ||
                      TYPE_COLORS.default,
                  }}
                >
                  {selectedNode.component_type}
                </span>
              </div>
              {impact !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    Impact radius
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    {impact} {impact === 1 ? "dependency" : "dependencies"}
                  </span>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
