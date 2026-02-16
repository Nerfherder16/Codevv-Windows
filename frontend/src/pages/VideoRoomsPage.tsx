import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Video,
  Phone,
  PhoneOff,
  Trash2,
  Circle,
} from "lucide-react";
import { api } from "../lib/api";
import type { VideoRoom, RoomToken } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";

/* ---------- LiveKit not available in desktop mode ---------- */

const LiveKitRoom = null;
const VideoConference = null;

function VideoRoomView({
  token,
  serverUrl,
  onLeave,
}: {
  token: string;
  serverUrl: string;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Video Room
        </h3>
        <Button variant="danger" size="sm" onClick={onLeave}>
          <PhoneOff className="w-4 h-4" />
          Leave
        </Button>
      </div>
      <div className="flex-1 rounded-lg bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Video className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Connected to Room</p>
          <p className="text-sm mt-1">
            Video rooms require a LiveKit server. Room metadata saved locally.
          </p>
          <p className="text-xs mt-3 font-mono bg-gray-800 rounded px-3 py-1.5 inline-block">
            Server: {serverUrl}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export function VideoRoomsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<VideoRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // Create room modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);

  // Joined room state
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<RoomToken | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  // Deleting
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<VideoRoom[]>(`/projects/${projectId}/rooms`);
      setRooms(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load rooms";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      toast("Room name is required.", "error");
      return;
    }

    setCreating(true);
    try {
      const room = await api.post<VideoRoom>(`/projects/${projectId}/rooms`, {
        name: roomName.trim(),
      });
      setRooms((prev) => [room, ...prev]);
      setCreateModalOpen(false);
      setRoomName("");
      toast("Room created!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create room";
      toast(msg, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (roomId: string) => {
    setJoining(roomId);
    try {
      const token = await api.post<RoomToken>(
        `/projects/${projectId}/rooms/${roomId}/token`,
      );
      setRoomToken(token);
      setJoinedRoomId(roomId);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to get room token";
      toast(msg, "error");
    } finally {
      setJoining(null);
    }
  };

  const handleLeave = () => {
    setJoinedRoomId(null);
    setRoomToken(null);
  };

  const handleDelete = async (roomId: string) => {
    setDeleting(roomId);
    try {
      await api.delete(`/projects/${projectId}/rooms/${roomId}`);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      if (joinedRoomId === roomId) {
        handleLeave();
      }
      toast("Room closed.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to close room";
      toast(msg, "error");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  // If currently in a room, show the video view
  if (joinedRoomId && roomToken) {
    return (
      <div>
        <VideoRoomView
          token={roomToken.token}
          serverUrl={roomToken.url}
          onLeave={handleLeave}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Video Rooms"
        description="Real-time video collaboration rooms for your team."
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
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Room
            </Button>
          </div>
        }
      />

      {/* Room list */}
      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Video className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            No rooms yet
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-4">
            Create a video room to start collaborating with your team.
          </p>
          <Button onClick={() => setCreateModalOpen(true)} size="sm">
            <Plus className="w-4 h-4" />
            Create Room
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <Card key={room.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 shrink-0">
                  <Video className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {room.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        room.is_active
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      <Circle
                        className={`w-2 h-2 ${room.is_active ? "fill-green-500" : "fill-gray-400"}`}
                      />
                      {room.is_active ? "Active" : "Closed"}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {relativeTime(room.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                {room.is_active && (
                  <Button
                    size="sm"
                    loading={joining === room.id}
                    onClick={() => handleJoin(room.id)}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Join
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  loading={deleting === room.id}
                  onClick={() => handleDelete(room.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Close
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Room Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setRoomName("");
        }}
        title="Create Video Room"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="roomName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Room Name <span className="text-red-500">*</span>
            </label>
            <input
              id="roomName"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Sprint Planning"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateModalOpen(false);
                setRoomName("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              <Video className="w-4 h-4" />
              Create Room
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
