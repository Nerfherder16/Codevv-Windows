import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  Users,
  Sun,
  Moon,
  LogOut,
  ArrowRight,
  Clock,
  Layers,
} from "lucide-react";
import { api } from "../lib/api";
import type { Project } from "../types";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { PageLoading } from "../components/common/LoadingSpinner";
import { relativeTime } from "../lib/utils";

export function ProjectListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get<Project[]>("/projects");
      setProjects(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load projects";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast("Project name is required.", "error");
      return;
    }

    setCreating(true);
    try {
      const project = await api.post<Project>("/projects", {
        name: name.trim(),
        description: description.trim() || null,
      });
      toast("Project created!", "success");
      setModalOpen(false);
      setName("");
      setDescription("");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create project";
      toast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setName("");
    setDescription("");
  };

  if (loading) {
    return <PageLoading />;
  }

  const totalMembers = projects.reduce((sum, p) => sum + p.member_count, 0);
  const recentProject =
    projects.length > 0
      ? projects.reduce((latest, p) =>
          new Date(p.updated_at) > new Date(latest.updated_at) ? p : latest,
        )
      : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header bar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-200/80 dark:border-white/[0.04] bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-28 flex items-center justify-between">
          {/* Logo */}
          <img
            src="/codevvtransparentlogo.webp"
            alt="Codevv"
            className="h-56 -my-14"
          />

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggle}
              className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>

            {user && (
              <>
                <div className="w-px h-6 bg-gray-200 dark:bg-white/[0.06] mx-1" />
                <div className="flex items-center gap-2.5 text-sm ml-1">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-xs font-bold shadow-lg shadow-amber-500/20">
                    {user.display_name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <span className="hidden sm:inline text-gray-600 dark:text-gray-400 font-medium">
                    {user.display_name}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-red-400 transition-all duration-200"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-10 animate-in">
          <h1 className="text-4xl font-light tracking-tight text-gray-900 dark:text-gray-100">
            {user ? (
              <>
                Welcome back,{" "}
                <span className="font-semibold dark:gradient-text">
                  {user.display_name?.split(" ")[0] || "there"}
                </span>
              </>
            ) : (
              "Your Projects"
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-500 mt-2 text-base">
            Design, build, and ship — all in one place.
          </p>
        </div>

        {/* Stats row */}
        {projects.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-10 animate-in">
            <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-light text-gray-900 dark:text-gray-100">
                    {projects.length}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Projects
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-2xl font-light text-gray-900 dark:text-gray-100">
                    {totalMembers}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Members
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {recentProject?.name || "—"}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Last active
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section header + CTA */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
            All Projects
          </h2>
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            New Project
          </Button>
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-in">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-6">
              <FolderOpen className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-200 mb-2">
              No projects yet
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm max-w-sm mb-8">
              Create your first project to start designing architecture,
              generating code, and deploying — all with AI assistance.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Your First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group relative text-left rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 transition-all duration-300 hover:border-amber-400/40 dark:hover:border-amber-400/20 hover:shadow-lg dark:hover:shadow-amber-500/[0.04] glow-card"
              >
                {/* Project name */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate pr-2">
                    {project.name}
                  </h3>
                  <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0 mt-0.5" />
                </div>

                {/* Description */}
                {project.description ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-sm text-gray-300 dark:text-gray-600 italic mb-4">
                    No description
                  </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/[0.04]">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Users className="w-3.5 h-3.5" />
                    {project.member_count}{" "}
                    {project.member_count === 1 ? "member" : "members"}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {relativeTime(project.updated_at)}
                  </span>
                </div>
              </button>
            ))}

            {/* New project card */}
            <button
              onClick={() => setModalOpen(true)}
              className="group rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.06] p-5 flex flex-col items-center justify-center gap-3 min-h-[160px] transition-all duration-300 hover:border-amber-400/40 dark:hover:border-amber-400/20 hover:bg-amber-500/[0.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center group-hover:bg-amber-500/10 transition-colors duration-200">
                <Plus className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-amber-500 transition-colors duration-200" />
              </div>
              <span className="text-sm font-medium text-gray-400 dark:text-gray-500 group-hover:text-amber-500 transition-colors duration-200">
                New Project
              </span>
            </button>
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="max-w-6xl mx-auto px-6 py-8 border-t border-gray-200/50 dark:border-white/[0.03]">
        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-600">
          <div className="flex items-center gap-2">
            <img src="/codevvtrans.png" alt="" className="w-4 h-4 opacity-50" />
            <span>Codevv</span>
          </div>
          <span>AI-assisted software design</span>
        </div>
      </footer>

      {/* ── New Project Modal ──────────────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title="New Project">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="projectName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Project"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you building?"
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
