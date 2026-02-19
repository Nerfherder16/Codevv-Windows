import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  ClipboardList,
  Plus,
  FileDown,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Archive,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { AuditReport, AuditSection } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { relativeTime } from "../lib/utils";

const STATUS_BADGES: Record<string, { color: string; label: string }> = {
  generating: {
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    label: "Generating",
  },
  ready: {
    color:
      "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
    label: "Ready",
  },
  archived: {
    color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    label: "Archived",
  },
};

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">
        {score}%
      </span>
    </div>
  );
}

export function AuditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [reports, setReports] = useState<AuditReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<string, AuditSection[]>>({});

  const fetchReports = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<AuditReport[]>(`/projects/${projectId}/audit`);
      setReports(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load reports";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const report = await api.post<AuditReport>(
        `/projects/${projectId}/audit`,
        {
          title: `Audit Report — ${new Date().toLocaleDateString()}`,
          sections: [
            "architecture",
            "code_generation",
            "deployment",
            "ideas",
            "knowledge",
          ],
        },
      );
      setReports((prev) => [report, ...prev]);
      toast("Report generated!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate report";
      toast(msg, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleExpand = async (reportId: string) => {
    if (expandedId === reportId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reportId);
    if (!sections[reportId]) {
      try {
        const detail = await api.get<AuditReport>(
          `/projects/${projectId}/audit/${reportId}`,
        );
        if (detail.report_json?.sections) {
          setSections((prev) => ({
            ...prev,
            [reportId]: detail.report_json.sections,
          }));
        }
      } catch {
        /* ignore */
      }
    }
  };

  const handleDelete = async (reportId: string) => {
    try {
      await api.delete(`/projects/${projectId}/audit/${reportId}`);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      toast("Report deleted", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete report";
      toast(msg, "error");
    }
  };

  const exportMarkdown = (report: AuditReport) => {
    const reportSections = sections[report.id] || [];
    let md = `# ${report.title}\n\nGenerated: ${new Date(report.created_at).toLocaleString()}\n\n`;
    for (const section of reportSections) {
      md += `## ${section.name} (${section.score}/100)\n\n`;
      if (section.notes) md += `${section.notes}\n\n`;
      for (const item of section.items || []) {
        md += `- ${item}\n`;
      }
      md += "\n";
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Audit Prep"
        description="Generate audit reports by aggregating project data."
        action={
          <Button onClick={handleGenerate} loading={generating} size="sm">
            <Plus className="w-3.5 h-3.5" />
            Generate Report
          </Button>
        }
      />

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
            <ClipboardList className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
            No audit reports yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mb-6">
            Generate a report to see architecture coverage, code generation
            stats, deployment health, and more.
          </p>
          <Button onClick={handleGenerate} loading={generating} size="sm">
            <Plus className="w-3.5 h-3.5" />
            Generate Report
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const badge = STATUS_BADGES[report.status] || STATUS_BADGES.ready;
            const isExpanded = expandedId === report.id;
            const reportSections = sections[report.id] || [];

            return (
              <Card key={report.id} className="p-0 overflow-hidden">
                <button
                  onClick={() => handleExpand(report.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    {report.status === "generating" ? (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : report.status === "ready" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Archive className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {report.title}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {relativeTime(report.created_at)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/[0.04]">
                    {reportSections.length > 0 ? (
                      <div className="mt-3 space-y-4">
                        {reportSections.map((section) => (
                          <div key={section.name}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                                {section.name.replace(/_/g, " ")}
                              </span>
                            </div>
                            <ScoreBar score={section.score} />
                            {section.notes && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                {section.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
                        Loading report details...
                      </p>
                    )}
                    <div className="flex justify-end gap-2 mt-4">
                      {reportSections.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => exportMarkdown(report)}
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          Export Markdown
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(report.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
