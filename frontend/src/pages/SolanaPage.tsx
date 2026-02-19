import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Coins,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import type { SolanaWatchlistItem, SolanaTransaction } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function SolanaPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [watchlist, setWatchlist] = useState<SolanaWatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SolanaWatchlistItem | null>(
    null,
  );
  const [transactions, setTransactions] = useState<SolanaTransaction[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);

  // Add modal
  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("devnet");
  const [adding, setAdding] = useState(false);

  const fetchWatchlist = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<SolanaWatchlistItem[]>(
        `/projects/${projectId}/solana/watchlist`,
      );
      setWatchlist(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load watchlist";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !address.trim()) {
      toast("Label and address are required.", "error");
      return;
    }
    setAdding(true);
    try {
      const item = await api.post<SolanaWatchlistItem>(
        `/projects/${projectId}/solana/watchlist`,
        { label: label.trim(), address: address.trim(), network },
      );
      setWatchlist((prev) => [item, ...prev]);
      setModalOpen(false);
      setLabel("");
      setAddress("");
      toast("Address added!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add address";
      toast(msg, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await api.delete(`/projects/${projectId}/solana/watchlist/${id}`);
      setWatchlist((prev) => prev.filter((w) => w.id !== id));
      if (selectedItem?.id === id) setSelectedItem(null);
      toast("Address removed", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove";
      toast(msg, "error");
    }
  };

  const refreshBalance = async (item: SolanaWatchlistItem) => {
    setRefreshing(item.id);
    try {
      const data = await api.get<{ sol: number }>(
        `/projects/${projectId}/solana/watchlist/${item.id}/balance`,
      );
      setWatchlist((prev) =>
        prev.map((w) => (w.id === item.id ? { ...w, balance: data.sol } : w)),
      );
    } catch {
      toast("Failed to refresh balance", "error");
    } finally {
      setRefreshing(null);
    }
  };

  const viewTransactions = async (item: SolanaWatchlistItem) => {
    setSelectedItem(item);
    setLoadingTxs(true);
    try {
      const data = await api.get<SolanaTransaction[]>(
        `/projects/${projectId}/solana/watchlist/${item.id}/transactions`,
      );
      setTransactions(data);
    } catch {
      toast("Failed to load transactions", "error");
    } finally {
      setLoadingTxs(false);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast("Address copied!", "success");
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Blockchain"
        description="Monitor Solana devnet wallets and transactions."
        action={
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            Add Address
          </Button>
        }
      />

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
            <Coins className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
            No addresses watched
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mb-6">
            Add Solana wallet addresses to monitor balances and transactions.
          </p>
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="w-3.5 h-3.5" />
            Add Address
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {watchlist.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {item.label}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {truncateAddress(item.address)}
                      </code>
                      <button
                        onClick={() => copyAddress(item.address)}
                        className="text-gray-400 hover:text-cyan-400 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 ml-1">
                        {item.network}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.balance !== undefined && (
                    <p className="text-lg font-light text-gray-900 dark:text-gray-100 tabular-nums">
                      {item.balance.toFixed(4)}{" "}
                      <span className="text-xs text-gray-400">SOL</span>
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => refreshBalance(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                      title="Refresh balance"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          refreshing === item.id ? "animate-spin" : ""
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => viewTransactions(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                      title="View transactions"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Transactions panel */}
      {selectedItem && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-3">
            Transactions — {selectedItem.label}
          </h3>
          {loadingTxs ? (
            <PageLoading />
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No recent transactions found.
            </p>
          ) : (
            <div className="space-y-1.5">
              {transactions.map((tx) => (
                <div
                  key={tx.signature}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] text-sm"
                >
                  <div className="flex items-center gap-2">
                    {tx.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <code className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {tx.signature.slice(0, 16)}...
                    </code>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    Fee: {tx.fee} lamports
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Address Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Wallet Address"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Treasury, Dev Wallet"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Solana address..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Network
            </label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="devnet">Devnet</option>
              <option value="testnet">Testnet</option>
              <option value="mainnet-beta">Mainnet Beta</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={adding}>
              Add Address
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
