import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { BookOpen, Search, Pin, PinOff, Tag, FileText } from "lucide-react";
import { api } from "../lib/api";
import type { RecallMemory } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";

export function RulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [rules, setRules] = useState<RecallMemory[]>([]);
  const [searchResults, setSearchResults] = useState<RecallMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const fetchRules = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<RecallMemory[]>(
        `/projects/${projectId}/rules`,
      );
      setRules(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load rules";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      const data = await api.post<RecallMemory[]>(
        `/projects/${projectId}/rules/search`,
        { query: query.trim() },
      );
      setSearchResults(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      toast(msg, "error");
    } finally {
      setSearching(false);
    }
  };

  const handlePin = async (memoryId: string) => {
    try {
      await api.post(`/projects/${projectId}/rules/pin`, {
        memory_id: memoryId,
      });
      toast("Rule pinned!", "success");
      fetchRules();
      setSearchResults((prev) => prev.filter((r) => r.id !== memoryId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to pin rule";
      toast(msg, "error");
    }
  };

  const handleUnpin = async (memoryId: string) => {
    try {
      await api.delete(`/projects/${projectId}/rules/${memoryId}/pin`);
      toast("Rule unpinned", "success");
      setRules((prev) => prev.filter((r) => r.id !== memoryId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unpin rule";
      toast(msg, "error");
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Business Rules"
        description="Pinned Recall memories that define project constraints and guidelines."
      />

      {/* Pinned Rules */}
      <section className="mb-10">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-4">
          Pinned Rules ({rules.length})
        </h3>

        {rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
              No rules pinned yet
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
              Search Recall memories below and pin the ones that define your
              project's business rules.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <Card key={rule.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                      {rule.content}
                    </p>
                    {rule.tags && rule.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {rule.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnpin(rule.id)}
                    className="p-1.5 rounded-lg text-cyan-500 hover:bg-cyan-500/10 transition-colors shrink-0"
                    title="Unpin rule"
                  >
                    <PinOff className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Search */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-4">
          Search Recall
        </h3>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for memories to pin as rules..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <Button type="submit" loading={searching} size="sm">
            Search
          </Button>
        </form>

        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map((memory) => (
              <div
                key={memory.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]"
              >
                <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                  {memory.content}
                </p>
                <button
                  onClick={() => handlePin(memory.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-500 hover:bg-cyan-500/10 transition-colors shrink-0"
                  title="Pin as rule"
                >
                  <Pin className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
