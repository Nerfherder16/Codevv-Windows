import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Sparkles,
  Lightbulb,
  Send,
} from "lucide-react";
import { api } from "../lib/api";
import type { IdeaDetail, IdeaComment, IdeaStatus } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { relativeTime, formatDate } from "../lib/utils";

const statusColors: Record<IdeaStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  proposed: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  approved:
    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  implemented:
    "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
};

const STATUS_OPTIONS: IdeaStatus[] = [
  "draft",
  "proposed",
  "approved",
  "rejected",
  "implemented",
];

function feasibilityColor(score: number): string {
  if (score >= 0.7)
    return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300";
  if (score >= 0.4)
    return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
}

function feasibilityLabel(score: number): string {
  if (score >= 0.7) return "High";
  if (score >= 0.4) return "Medium";
  return "Low";
}

export function IdeaDetailPage() {
  const { projectId, ideaId } = useParams<{
    projectId: string;
    ideaId: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  // Comment form
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Status editing
  const [editingStatus, setEditingStatus] = useState(false);

  const fetchIdea = useCallback(async () => {
    if (!projectId || !ideaId) return;

    try {
      const data = await api.get<IdeaDetail>(
        `/projects/${projectId}/ideas/${ideaId}`,
      );
      setIdea(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load idea";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, ideaId, toast]);

  useEffect(() => {
    fetchIdea();
  }, [fetchIdea]);

  const handleVote = async (value: 1 | -1) => {
    if (voting) return;

    setVoting(true);
    try {
      await api.post(`/projects/${projectId}/ideas/${ideaId}/vote`, {
        value,
      });
      setIdea((prev) =>
        prev ? { ...prev, vote_count: prev.vote_count + value } : prev,
      );
      toast(value === 1 ? "Upvoted!" : "Downvoted.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to vote";
      toast(message, "error");
    } finally {
      setVoting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!commentText.trim()) {
      toast("Comment cannot be empty.", "error");
      return;
    }

    setSubmittingComment(true);
    try {
      const comment = await api.post<IdeaComment>(
        `/projects/${projectId}/ideas/${ideaId}/comments`,
        { content: commentText.trim() },
      );
      setIdea((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, comment],
              comment_count: prev.comment_count + 1,
            }
          : prev,
      );
      setCommentText("");
      toast("Comment added!", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add comment";
      toast(message, "error");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleStatusChange = async (newStatus: IdeaStatus) => {
    try {
      await api.patch(`/projects/${projectId}/ideas/${ideaId}`, {
        status: newStatus,
      });
      setIdea((prev) => (prev ? { ...prev, status: newStatus } : prev));
      setEditingStatus(false);
      toast(`Status updated to ${newStatus}.`, "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status";
      toast(message, "error");
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (!idea) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Lightbulb className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
          Idea not found
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate(`/projects/${projectId}/ideas`)}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ideas
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={idea.title}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/ideas`)}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Ideas
          </Button>
        }
      />

      {/* Status and metadata */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Status badge / dropdown */}
          <div className="relative">
            <button
              onClick={() => setEditingStatus(!editingStatus)}
              className={`text-xs font-medium px-3 py-1 rounded-full cursor-pointer transition-opacity hover:opacity-80 ${statusColors[idea.status]}`}
              title="Click to change status"
            >
              {idea.status}
            </button>
            {editingStatus && (
              <div className="absolute top-full left-0 mt-1 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      s === idea.status
                        ? "font-semibold text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {idea.category && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {idea.category}
            </span>
          )}

          <span className="text-xs text-gray-400 dark:text-gray-500">
            Created {formatDate(idea.created_at)}
          </span>

          <span className="text-xs text-gray-400 dark:text-gray-500">
            Updated {relativeTime(idea.updated_at)}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {idea.description}
        </p>

        {/* Vote buttons */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote(1)}
              disabled={voting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50"
            >
              <ThumbsUp className="w-4 h-4" />
              Upvote
            </button>
            <button
              onClick={() => handleVote(-1)}
              disabled={voting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
            >
              <ThumbsDown className="w-4 h-4" />
              Downvote
            </button>
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {idea.vote_count} {idea.vote_count === 1 ? "vote" : "votes"}
          </span>
        </div>
      </Card>

      {/* Feasibility Score */}
      {idea.feasibility_score !== null && (
        <Card className="mb-6">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Feasibility Score
                </h3>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${feasibilityColor(idea.feasibility_score)}`}
                >
                  {Math.round(idea.feasibility_score * 100)}% -{" "}
                  {feasibilityLabel(idea.feasibility_score)}
                </span>
              </div>

              {/* Score bar */}
              <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-2 mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    idea.feasibility_score >= 0.7
                      ? "bg-green-500"
                      : idea.feasibility_score >= 0.4
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${idea.feasibility_score * 100}%` }}
                />
              </div>

              {idea.feasibility_reason && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {idea.feasibility_reason}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Comments section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Comments ({idea.comments.length})
          </h2>
        </div>

        {/* Comment list */}
        {idea.comments.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            No comments yet. Be the first to share your thoughts.
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            {idea.comments.map((comment) => (
              <Card key={comment.id} className="py-3">
                <div className="flex items-start gap-3">
                  {/* User avatar placeholder */}
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold shrink-0">
                    {comment.user_id.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {comment.user_id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {relativeTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add comment form */}
        <form onSubmit={handleAddComment} className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <Button type="submit" loading={submittingComment} size="md">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
