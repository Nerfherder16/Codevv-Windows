import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  Lightbulb,
  Search,
  ThumbsUp,
  MessageSquare,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { api } from "../lib/api";
import type { Idea, IdeaStatus } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";

const STATUS_TABS: { label: string; value: IdeaStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Proposed", value: "proposed" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Implemented", value: "implemented" },
];

const statusColors: Record<IdeaStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  proposed: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  approved:
    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  implemented:
    "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
};

function feasibilityColor(score: number): string {
  if (score >= 0.7)
    return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300";
  if (score >= 0.4)
    return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
}

export function IdeasPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<IdeaStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await api.get<Idea[]>(`/projects/${projectId}/ideas`);
      setIdeas(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load ideas";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const filteredIdeas = useMemo(() => {
    let result = ideas;

    if (activeTab !== "all") {
      result = result.filter((idea) => idea.status === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (idea) =>
          idea.title.toLowerCase().includes(q) ||
          idea.description.toLowerCase().includes(q) ||
          (idea.category && idea.category.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [ideas, activeTab, searchQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast("Idea title is required.", "error");
      return;
    }
    if (!description.trim()) {
      toast("Description is required.", "error");
      return;
    }

    setCreating(true);
    try {
      const idea = await api.post<Idea>(`/projects/${projectId}/ideas`, {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || null,
      });
      toast("Idea created!", "success");
      setModalOpen(false);
      setTitle("");
      setDescription("");
      setCategory("");
      setIdeas((prev) => [idea, ...prev]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create idea";
      toast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setTitle("");
    setDescription("");
    setCategory("");
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Ideas"
        description="Capture, discuss, and prioritize ideas for the project."
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
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              New Idea
            </Button>
          </div>
        }
      />

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ideas..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.value
                  ? "bg-amber-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ideas list */}
      {filteredIdeas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Lightbulb className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            {ideas.length === 0 ? "No ideas yet" : "No matching ideas"}
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-4">
            {ideas.length === 0
              ? "Share your first idea to get the discussion going."
              : "Try adjusting your search or filter."}
          </p>
          {ideas.length === 0 && (
            <Button onClick={() => setModalOpen(true)} size="sm">
              <Plus className="w-4 h-4" />
              Share an Idea
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIdeas.map((idea) => (
            <Card
              key={idea.id}
              hover
              onClick={() => {
                if (expandedId === idea.id) {
                  setExpandedId(null);
                } else {
                  setExpandedId(idea.id);
                }
              }}
              className="flex flex-col"
            >
              <div className="flex items-start gap-3">
                <Lightbulb className="w-4 h-4 mt-1 text-amber-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {idea.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {idea.description}
                  </p>
                </div>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[idea.status]}`}
                >
                  {idea.status}
                </span>

                {idea.feasibility_score !== null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${feasibilityColor(idea.feasibility_score)}`}
                  >
                    <Sparkles className="w-3 h-3" />
                    {Math.round(idea.feasibility_score * 100)}%
                  </span>
                )}

                {idea.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {idea.category}
                  </span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <ThumbsUp className="w-3.5 h-3.5" />
                    {idea.vote_count}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {idea.comment_count}
                  </span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {relativeTime(idea.updated_at)}
                </span>
              </div>

              {/* Expanded detail */}
              {expandedId === idea.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.04]">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {idea.description}
                  </p>
                  {idea.feasibility_reason && (
                    <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Feasibility Analysis
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {idea.feasibility_reason}
                      </p>
                    </div>
                  )}
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projects/${projectId}/ideas/${idea.id}`);
                      }}
                    >
                      View Full Detail
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* New Idea Modal */}
      <Modal open={modalOpen} onClose={closeModal} title="New Idea">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="ideaTitle"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="ideaTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your idea?"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="ideaDesc"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="ideaDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the idea in detail..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
            />
          </div>

          <div>
            <label
              htmlFor="ideaCategory"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Category
            </label>
            <input
              id="ideaCategory"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. UX, Performance, Feature"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Submit Idea
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
