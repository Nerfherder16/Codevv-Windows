// Auth
export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// Projects
export type ProjectRole = "owner" | "editor" | "viewer";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface ProjectMember {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: ProjectRole;
  joined_at: string;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
}

// Canvases
export interface Canvas {
  id: string;
  project_id: string;
  name: string;
  yjs_doc_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  component_count: number;
}

export interface CanvasComponent {
  id: string;
  canvas_id: string;
  shape_id: string;
  name: string;
  component_type: string;
  tech_stack: string | null;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface CanvasDetail extends Canvas {
  tldraw_snapshot: Record<string, unknown> | null;
  components: CanvasComponent[];
}

// Ideas
export type IdeaStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "rejected"
  | "implemented";

export interface Idea {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  category: string | null;
  feasibility_score: number | null;
  feasibility_reason: string | null;
  vote_count: number;
  comment_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface IdeaDetail extends Idea {
  comments: IdeaComment[];
}

// Scaffold
export type ScaffoldStatus =
  | "pending"
  | "generating"
  | "review"
  | "approved"
  | "rejected"
  | "failed";

export interface ScaffoldJob {
  id: string;
  project_id: string;
  canvas_id: string;
  component_ids: string[];
  status: ScaffoldStatus;
  spec_json: Record<string, unknown> | null;
  generated_files: Record<string, string> | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

// Knowledge Graph
export interface KnowledgeEntity {
  id: string;
  project_id: string;
  name: string;
  entity_type: string;
  description: string | null;
  path: string | null;
  metadata_json: Record<string, unknown> | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

export interface KnowledgeRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface GraphNode {
  id: string;
  name: string;
  entity_type: string;
  depth: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation_type: string;
  weight: number | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Video
export interface VideoRoom {
  id: string;
  project_id: string;
  canvas_id: string | null;
  name: string;
  livekit_room_name: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface RoomToken {
  token: string;
  room_name: string;
  url: string;
}

// Conversations
export interface Conversation {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  model: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  tool_uses_json: string | null;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

// AI Chat
export interface ChatContext {
  page?: string;
  component_id?: string;
  idea_id?: string;
  canvas_id?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUses?: ToolUseEvent[];
  timestamp: number;
  streaming?: boolean;
}

export interface ToolUseEvent {
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface DoneEvent {
  session_id: string | null;
  model: string;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
}

// MCP
export type MCPServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed";

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  status: MCPServerStatus;
  error: string | null;
  tool_count: number;
  tools: string[];
  enabled: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// Deploy
export type DeployStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  config_json: Record<string, unknown> | null;
  compose_yaml: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeployJob {
  id: string;
  environment_id: string;
  status: DeployStatus;
  logs: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}
