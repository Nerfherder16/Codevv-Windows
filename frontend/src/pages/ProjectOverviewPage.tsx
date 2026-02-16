import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, Pencil, Lightbulb, FolderOpen } from "lucide-react";
import { api } from "../lib/api";
import type { ProjectDetail, Canvas, Idea } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Button } from "../components/common/Button";
import { relativeTime } from "../lib/utils";

interface QuickLinkProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}

interface QuickLinkColor {
  bg: string;
  icon: string;
  count: string;
}

const LINK_COLORS: Record<string, QuickLinkColor & { stat: string }> = {
  emerald: {
    bg: "bg-emerald-50 stat-emerald",
    icon: "text-emerald-600 dark:text-emerald-400",
    count: "text-emerald-700 dark:text-emerald-300",
    stat: "stat-emerald",
  },
  amber: {
    bg: "bg-amber-50 stat-amber",
    icon: "text-amber-600 dark:text-amber-400",
    count: "text-amber-700 dark:text-amber-300",
    stat: "stat-amber",
  },
  violet: {
    bg: "bg-violet-50 stat-violet",
    icon: "text-violet-600 dark:text-violet-400",
    count: "text-violet-700 dark:text-violet-300",
    stat: "stat-violet",
  },
};

function QuickLink({
  icon,
  label,
  count,
  onClick,
  color = "emerald",
}: QuickLinkProps & { color?: string }) {
  const c = LINK_COLORS[color] || LINK_COLORS.emerald;
  return (
    <Card
      hover
      glow
      onClick={onClick}
      className={`flex items-center gap-4 ${c.bg}`}
    >
      <div
        className={`flex items-center justify-center w-12 h-12 rounded-xl ${c.icon}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-2xl font-bold ${c.count}`}>{count}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </Card>
  );
}

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!projectId) return;

    try {
      const [proj, canv, ide] = await Promise.all([
        api.get<ProjectDetail>(`/projects/${projectId}`),
        api.get<Canvas[]>(`/projects/${projectId}/canvases`).catch(() => []),
        api.get<Idea[]>(`/projects/${projectId}/ideas`).catch(() => []),
      ]);
      setProject(proj);
      setCanvases(canv);
      setIdeas(ide);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load project";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <PageLoading />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FolderOpen className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
          Project not found
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/projects")}
        >
          Back to Projects
        </Button>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    owner:
      "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    editor: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    viewer: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  };

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.description || undefined}
        action={
          <Button variant="secondary" onClick={() => navigate("/projects")}>
            All Projects
          </Button>
        }
      />

      {/* Quick links grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <QuickLink
          icon={<Pencil className="w-6 h-6" />}
          label="Canvases"
          count={canvases.length}
          color="emerald"
          onClick={() => navigate(`/projects/${projectId}/canvases`)}
        />
        <QuickLink
          icon={<Lightbulb className="w-6 h-6" />}
          label="Ideas"
          count={ideas.length}
          color="amber"
          onClick={() => navigate(`/projects/${projectId}/ideas`)}
        />
        <QuickLink
          icon={<Users className="w-6 h-6" />}
          label="Members"
          count={project.members.length}
          color="violet"
          onClick={() => {
            document
              .getElementById("members-section")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </div>

      {/* Members section */}
      <section id="members-section" className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Members
        </h2>
        {project.members.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No members yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {project.members.map((member) => (
              <Card key={member.id} className="flex items-center gap-3">
                {/* Avatar placeholder */}
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-500 text-sm font-semibold shrink-0">
                  {member.display_name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {member.display_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {member.email}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColors[member.role] || roleColors.viewer}`}
                >
                  {member.role}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent canvases */}
      {canvases.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Canvases
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/canvases`)}
            >
              View all
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {canvases.slice(0, 6).map((canvas) => (
              <Card
                key={canvas.id}
                hover
                onClick={() =>
                  navigate(`/projects/${projectId}/canvases/${canvas.id}`)
                }
              >
                <div className="flex items-start gap-3">
                  <Pencil className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {canvas.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {canvas.component_count}{" "}
                      {canvas.component_count === 1
                        ? "component"
                        : "components"}{" "}
                      &middot; {relativeTime(canvas.updated_at)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Recent ideas */}
      {ideas.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Ideas
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/ideas`)}
            >
              View all
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ideas.slice(0, 6).map((idea) => {
              const statusColors: Record<string, string> = {
                draft:
                  "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
                proposed:
                  "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
                approved:
                  "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
                rejected:
                  "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
                implemented:
                  "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
              };

              return (
                <Card
                  key={idea.id}
                  hover
                  onClick={() =>
                    navigate(`/projects/${projectId}/ideas/${idea.id}`)
                  }
                >
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {idea.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[idea.status] || statusColors.draft}`}
                        >
                          {idea.status}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {relativeTime(idea.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
