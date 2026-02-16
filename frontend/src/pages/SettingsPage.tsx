import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Users,
  UserPlus,
  Trash2,
  Moon,
  Sun,
  AlertTriangle,
  Save,
  Sparkles,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  ProjectDetail,
  ProjectMember,
  ProjectRole,
  AIModel,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { useTheme } from "../contexts/ThemeContext";
import { useAIChat } from "../contexts/AIChatContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";

const ROLES: ProjectRole[] = ["owner", "editor", "viewer"];

const roleColors: Record<ProjectRole, string> = {
  owner: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  editor: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  viewer: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

export function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Project edit form
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Add member modal
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<ProjectRole>("editor");
  const [addingMember, setAddingMember] = useState(false);

  // Archive confirmation
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");

  // AI settings
  const { currentModel, setModel, sessionId, clearMessages } = useAIChat();
  const [models, setModels] = useState<AIModel[]>([]);
  const [recallStatus, setRecallStatus] = useState<
    "healthy" | "unavailable" | "checking"
  >("checking");
  const [claudeAuth, setClaudeAuth] = useState<{
    authenticated: boolean;
    method?: string;
  } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<ProjectDetail>(`/projects/${projectId}`);
      setProject(data);
      setEditName(data.name);
      setEditDesc(data.description || "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load project";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Fetch AI models and Recall health
  useEffect(() => {
    if (!projectId) return;
    api
      .get<AIModel[]>(`/projects/${projectId}/ai/models`)
      .then(setModels)
      .catch(() => {});
    // Check Recall health via the backend
    fetch("/health")
      .then((r) => r.json())
      .then(() => setRecallStatus("healthy"))
      .catch(() => setRecallStatus("unavailable"));
    // Actually check Recall directly is better — use the knowledge endpoint as proxy
    api
      .get(`/projects/${projectId}/knowledge/recall-graph`)
      .then(() => setRecallStatus("healthy"))
      .catch(() => setRecallStatus("unavailable"));
    // Check Claude auth status
    api
      .get<{ authenticated: boolean; method?: string }>(`/auth/claude-status`)
      .then(setClaudeAuth)
      .catch(() => setClaudeAuth({ authenticated: false }));
  }, [projectId]);

  const handleMigrateKnowledge = async () => {
    if (!projectId) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const result = await api.post<{
        migrated_entities: number;
        migrated_relations: number;
        total_entities: number;
        total_relations: number;
      }>(`/projects/${projectId}/knowledge/migrate`);
      setMigrationResult(
        `Migrated ${result.migrated_entities}/${result.total_entities} entities and ${result.migrated_relations}/${result.total_relations} relations`,
      );
      toast("Knowledge migration complete!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Migration failed";
      toast(msg, "error");
      setMigrationResult(`Error: ${msg}`);
    } finally {
      setMigrating(false);
    }
  };

  const handleClearSession = async () => {
    if (!projectId) return;
    try {
      await api.delete(`/projects/${projectId}/ai/session`);
      clearMessages();
      toast("AI session cleared.", "success");
    } catch {
      // session may not exist
      clearMessages();
    }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast("Project name is required.", "error");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}`, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      toast("Project settings saved!", "success");
      // Update local state
      setProject((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              description: editDesc.trim() || null,
            }
          : null,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save settings";
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim()) {
      toast("Email is required.", "error");
      return;
    }

    setAddingMember(true);
    try {
      const member = await api.post<ProjectMember>(
        `/projects/${projectId}/members`,
        {
          email: memberEmail.trim(),
          role: memberRole,
        },
      );
      setProject((prev) =>
        prev ? { ...prev, members: [...prev.members, member] } : null,
      );
      setAddMemberOpen(false);
      setMemberEmail("");
      setMemberRole("editor");
      toast(`${member.display_name} added as ${member.role}!`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add member";
      toast(msg, "error");
    } finally {
      setAddingMember(false);
    }
  };

  const handleArchive = async () => {
    if (archiveConfirmText !== project?.name) {
      toast("Type the project name to confirm.", "error");
      return;
    }

    setArchiving(true);
    try {
      await api.patch(`/projects/${projectId}`, { archived: true });
      toast("Project archived.", "success");
      navigate("/projects");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to archive project";
      toast(msg, "error");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Settings className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description={`Manage settings for ${project.name}`}
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

      {/* Project Settings */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Project Details
        </h2>
        <Card>
          <form onSubmit={handleSaveProject} className="space-y-4">
            <div>
              <label
                htmlFor="projectName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="projectName"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label
                htmlFor="projectDesc"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description
              </label>
              <textarea
                id="projectDesc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                placeholder="A brief description of the project..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      </section>

      {/* Members */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Members
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({project.members.length})
            </span>
          </h2>
          <Button size="sm" onClick={() => setAddMemberOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Add Member
          </Button>
        </div>

        <div className="space-y-2">
          {project.members.map((member) => (
            <Card key={member.id} className="flex items-center gap-3">
              {/* Avatar */}
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold shrink-0">
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
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColors[member.role]}`}
              >
                {member.role}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          {theme === "dark" ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
          Appearance
        </h2>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Theme
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Currently using <span className="font-medium">{theme}</span>{" "}
                mode
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-gray-200 dark:bg-blue-600"
            >
              <span
                className={`inline-flex items-center justify-center h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  theme === "dark" ? "translate-x-7" : "translate-x-1"
                }`}
              >
                {theme === "dark" ? (
                  <Moon className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
              </span>
            </button>
          </div>
        </Card>
      </section>

      {/* AI Settings */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          AI Assistant
        </h2>

        <div className="space-y-4">
          {/* Claude connection status */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Claude Connection
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {claudeAuth?.authenticated
                    ? claudeAuth.method === "api_key"
                      ? "Authenticated via API key"
                      : `OAuth (${(claudeAuth as any).subscription || "connected"})`
                    : "Not connected — log in with your Claude account"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {claudeAuth === null ? (
                  <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
                ) : claudeAuth.authenticated ? (
                  <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Connected
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const data = await api.post<{ auth_url: string }>(
                          "/auth/claude-login",
                          {},
                        );
                        window.open(
                          data.auth_url,
                          "_blank",
                          "width=600,height=700",
                        );
                      } catch (e) {
                        toast("Failed to start login flow", "error");
                      }
                    }}
                  >
                    Log in to Claude
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Model selector */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  AI Model
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Select which Claude model to use for AI chat
                </p>
              </div>
              <select
                value={currentModel}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {/* Recall status */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Recall Memory
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Knowledge graph storage on CasaOS
                </p>
              </div>
              <div className="flex items-center gap-2">
                {recallStatus === "checking" ? (
                  <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
                ) : recallStatus === "healthy" ? (
                  <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                    <XCircle className="w-4 h-4" />
                    Unavailable
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Knowledge migration */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Knowledge Migration
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Migrate local SQLite knowledge entities to Recall
                </p>
                {migrationResult && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {migrationResult}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleMigrateKnowledge}
                loading={migrating}
                disabled={recallStatus !== "healthy"}
              >
                Migrate to Recall
              </Button>
            </div>
          </Card>

          {/* Session info */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  AI Session
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {sessionId
                    ? `Active session: ${sessionId.slice(0, 12)}...`
                    : "No active session"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSession}
                disabled={!sessionId}
              >
                Clear Session
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </h2>
        <Card className="border-red-200 dark:border-red-900/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Archive Project
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Archive this project and hide it from the project list. This
                action can be reversed by an administrator.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setArchiveModalOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archive
            </Button>
          </div>
        </Card>
      </section>

      {/* Add Member Modal */}
      <Modal
        open={addMemberOpen}
        onClose={() => {
          setAddMemberOpen(false);
          setMemberEmail("");
          setMemberRole("editor");
        }}
        title="Add Member"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label
              htmlFor="memberEmail"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="memberEmail"
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="user@example.com"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label
              htmlFor="memberRole"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Role
            </label>
            <select
              id="memberRole"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as ProjectRole)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              <span className="font-medium">Owner:</span> full access |{" "}
              <span className="font-medium">Editor:</span> read/write |{" "}
              <span className="font-medium">Viewer:</span> read only
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddMemberOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={addingMember}>
              <UserPlus className="w-4 h-4" />
              Add Member
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation Modal */}
      <Modal
        open={archiveModalOpen}
        onClose={() => {
          setArchiveModalOpen(false);
          setArchiveConfirmText("");
        }}
        title="Archive Project"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                This will archive the project
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">
                The project will be hidden from all members. Data will be
                preserved but inaccessible through the normal interface.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type <span className="font-mono font-bold">{project.name}</span>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={archiveConfirmText}
              onChange={(e) => setArchiveConfirmText(e.target.value)}
              placeholder={project.name}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setArchiveModalOpen(false);
                setArchiveConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={archiving}
              disabled={archiveConfirmText !== project.name}
              onClick={handleArchive}
            >
              <Trash2 className="w-4 h-4" />
              Archive Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
