# Codevv Implementation Plan

> Collaborative software design platform — architectural decisions and implementation roadmap.
> Generated from planning session, February 2026.

---

## 1. Organization Layer

### Problem
Current structure is `User → ProjectMember → Project`. No concept of a business or team that owns multiple projects. Adding Scott requires adding him to each project individually. No shared billing context for Claude Teams. No onboarding flow for non-technical users.

### Solution
An `Organization` model sits between Users and Projects. Orgs own projects. Users belong to orgs via memberships. Claude integration config lives at the org level.

### Models

**`backend/app/models/organization.py`**
```python
class OrgRole(str, enum.Enum):
    owner = "owner"       # Full control, billing, can delete org
    admin = "admin"       # Manage members, projects, settings
    member = "member"     # Access projects, use features

class OrgMemberStatus(str, enum.Enum):
    invited = "invited"   # Invite sent, not yet accepted
    active = "active"     # Full access
    suspended = "suspended"

class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Claude integration
    claude_auth_mode: Mapped[str] = mapped_column(
        String(20), default="oauth_per_user"
    )  # "oauth_per_user" | "api_key" | "none"
    claude_subscription_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "teams", "pro", etc. — expected subscription for members
    anthropic_api_key_encrypted: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Only used if claude_auth_mode == "api_key"
    
    # Settings
    auto_add_to_projects: Mapped[bool] = mapped_column(default=True)
    default_persona: Mapped[str] = mapped_column(String(20), default="creator")
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    members: Mapped[list["OrgMembership"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class OrgMembership(Base):
    __tablename__ = "org_memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # null when user hasn't registered yet
    
    role: Mapped[OrgRole] = mapped_column(SAEnum(OrgRole), default=OrgRole.member)
    default_persona: Mapped[str] = mapped_column(String(20), default="creator")
    status: Mapped[OrgMemberStatus] = mapped_column(SAEnum(OrgMemberStatus), default=OrgMemberStatus.invited)
    
    # Invite tracking
    invite_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invite_token: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
```

**Update `backend/app/models/project.py`** — add org_id:
```python
class Project(Base):
    # ... existing fields ...
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    
    organization: Mapped["Organization"] = relationship(back_populates="projects")
```

**Update `backend/app/models/user.py`** — add personal org tracking:
```python
class User(Base):
    # ... existing fields ...
    personal_org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # Auto-created "personal workspace" org
```

### Claude Teams Integration

**How the two auth systems relate:**

```
Codevv Auth (who are you in Codevv?)     Claude Auth (who are you at Anthropic?)
├── Email/password registration           ├── OAuth PKCE to claude.ai
├── JWT token                             ├── Access token + refresh token
├── Controls: projects, roles, persona    ├── Controls: model access, rate limits, billing
└── Managed by Codevv                     └── Managed by Anthropic
```

These are independent systems. Codevv doesn't manage Claude seats — Tim adds/removes seats at claude.ai. Codevv verifies that connected users are on the expected plan.

**Auth mode behaviors:**

| Mode | How it works | Use case |
|------|-------------|----------|
| `oauth_per_user` | Each member connects their own Anthropic account via OAuth PKCE. Usage tracks to their seat. Codevv verifies `subscription_type` matches org expectation. | Claude Teams subscription (your setup) |
| `api_key` | Org stores a shared API key. All requests use it. No per-user attribution at Anthropic. | Solo developer, small team with one API key |
| `none` | AI features disabled. Chat panel hidden. | Teams not using Claude |

**Subscription validation in `claude_auth.py`:**

After OAuth callback, check if user's subscription matches org expectation:
```python
async def validate_subscription(user_id: uuid.UUID, org: Organization, db: AsyncSession) -> dict:
    """Check if user's Claude subscription matches org expectation."""
    cred = await get_credential(user_id, db)
    if not cred:
        return {"valid": False, "reason": "not_connected"}
    
    if org.claude_subscription_type and cred.subscription_type != org.claude_subscription_type:
        return {
            "valid": False,
            "reason": "subscription_mismatch",
            "expected": org.claude_subscription_type,
            "actual": cred.subscription_type,
        }
    
    return {"valid": True, "subscription": cred.subscription_type}
```

This doesn't block usage — it surfaces a warning. "This org uses Claude Teams. Your account appears to be on a different plan. Contact your org admin."

### Routes

**`backend/app/api/routes/orgs.py`**
```
POST   /orgs                              → create organization
GET    /orgs/me                            → list user's organizations
GET    /orgs/{org_id}                      → org detail
PATCH  /orgs/{org_id}                      → update org settings
DELETE /orgs/{org_id}                      → delete org (owner only)

POST   /orgs/{org_id}/invite              → invite member by email
GET    /orgs/{org_id}/members              → list members
PATCH  /orgs/{org_id}/members/{member_id}  → update role/persona
DELETE /orgs/{org_id}/members/{member_id}  → remove member

POST   /orgs/invites/{token}/accept        → accept invite (public, authenticated)
GET    /orgs/invites/{token}               → get invite details (public, for signup page)
```

### Recall Domain Convention
With orgs, domains become: `{org_slug}:{project_slug}`

Example: org "acme" with project "adbp" → domain `acme:adbp`

Recall doesn't know about orgs. It just sees domain strings and user ID tags. The namespacing is purely a Codevv convention.

---

## 2. Onboarding Flow

### First-Time User (Tim creates everything)

```
Step 1: Register
├── Tim goes to Codevv, creates account (email + password)
├── Codevv auto-creates a "Personal Workspace" org (personal_org_id on User)
└── Tim lands on empty dashboard

Step 2: Create Organization
├── Tim clicks "Create Organization" 
├── Names it ("Tim's Company"), picks slug ("tims-company")
├── Org created with Tim as owner
├── Claude integration prompt:
│   ├── "How does your team use Claude?"
│   ├── Option A: "We have Claude Teams" → oauth_per_user, subscription_type = "teams"
│   ├── Option B: "I have an API key" → api_key, enters key
│   └── Option C: "Skip for now" → none
└── Tim is prompted to connect his Claude account (if oauth_per_user)

Step 3: Connect Claude
├── Tim clicks "Connect to Claude"
├── OAuth PKCE flow → redirects to claude.ai
├── Tim logs in with his Anthropic Teams account
├── Callback stores tokens in ClaudeCredential
├── Codevv reads subscription_type from token response
├── Confirms: "Connected — Claude Teams subscription detected"
└── Org's claude_subscription_type set to "teams"

Step 4: Create First Project
├── Tim creates a project under the org
├── Project gets org_id = tims-company
├── Recall domain = "tims-company:adbp"
├── Tim auto-added as owner with persona = "developer"
└── Tim lands in project dashboard, fully functional

Step 5: Invite Team
├── Tim goes to Org Settings → Members
├── Invites Scott: email, role = member, persona = developer
├── Invites Creator 1: email, role = member, persona = creator
├── Invites Creator 2: email, role = member, persona = creator
├── Invites Accountant: email, role = member, persona = finance
└── Each gets an invite (email or link with token)
```

### Invited User — Already Has Account (Scott)

```
Step 1: Scott receives invite
├── Email with link: https://codevv.example.com/invite/{token}
└── Or Tim shares the link directly

Step 2: Scott clicks link
├── Codevv checks invite token → valid, finds OrgMembership(status=invited)
├── Scott is logged in already → "Tim invited you to join Tim's Company"
├── Scott clicks "Accept"
├── OrgMembership.status = active, user_id = scott's id, joined_at = now
└── If org.auto_add_to_projects: Scott added to all org projects with default_persona

Step 3: Claude connection
├── Scott opens a project, clicks chat
├── "Connect your Claude account to use AI features"
├── OAuth PKCE → Scott logs in with his Anthropic account (which Tim added as a Teams seat)
├── Callback stores tokens, checks subscription_type
├── Matches org expectation ("teams") → all good
└── Scott is fully onboarded
```

### Invited User — No Account Yet (Creator)

```
Step 1: Creator receives invite
├── Email with link: https://codevv.example.com/invite/{token}
└── Creator has never used Codevv

Step 2: Creator clicks link
├── Codevv checks invite token → valid, user not logged in
├── Redirect to signup page with invite context
├── Shows: "Tim invited you to join Tim's Company on Codevv"
├── Creator creates account (email must match invite_email, or any email if invite is open)
├── Account created → OrgMembership auto-activates (user_id linked, status = active)
├── Personal workspace org also auto-created
└── If org.auto_add_to_projects: Creator added to all org projects with persona = "creator"

Step 3: Claude connection  
├── Creator opens a project
├── Banner: "Connect your Claude account to collaborate with AI"
├── Simple language, no technical jargon
├── OAuth flow → Creator logs into claude.ai
├── Subscription verified → done
└── Creator sees the chat panel in expanded mode (their persona default)
```

### What Each User Sees After Onboarding

**Dashboard (Project List Page):**
```
┌─────────────────────────────────────────────┐
│  Organization Switcher: [Tim's Company ▼]   │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ ADBP         │  │ Side Project │        │
│  │ 5 members    │  │ 2 members    │        │
│  │ 142 memories │  │ 8 memories   │        │
│  └──────────────┘  └──────────────┘        │
│                                              │
│  [+ New Project]                             │
│                                              │
│  Switch to: Personal Workspace               │
└─────────────────────────────────────────────┘
```

If Scott also has personal projects, the org switcher lets him toggle between "Tim's Company" and "Scott's Workspace" without logging out.

### Frontend Pages Needed

**New pages:**
- `OrgSetupPage.tsx` — first-time org creation wizard
- `OrgSettingsPage.tsx` — members, Claude integration, devices, settings
- `InviteAcceptPage.tsx` — public page for invite links
- `OnboardingPage.tsx` — post-signup guided setup
- `DevicePairPage.tsx` — public page for device pairing (`/devices/pair`)
- `SessionJoinPage.tsx` — public page for join codes (`/session/join/:code`)

**Modified pages:**
- `ProjectListPage.tsx` — add org switcher, show org context
- `CanvasEditorPage.tsx` — Yjs sync, view mode routing (draw/present/collaborate)
- `SettingsPage.tsx` — link to org settings for admins

---

## 3. Persona System

### Problem
Current `ProjectRole` (owner/editor/viewer) controls permissions but not experience. All 5 team members see the same sidebar, same pages, same chat panel. Non-technical users (creators, accountant) see developer-facing affordances that don't serve them.

### Solution
Add a `persona` field to `ProjectMember`. Default persona comes from `OrgMembership.default_persona` when auto-adding to projects. Personas control what the user sees first and how the AI assistant presents itself. Roles continue to control what users can do.

### Model Changes

**`backend/app/models/project.py`**
```python
class ProjectPersona(str, enum.Enum):
    developer = "developer"
    creator = "creator"
    operations = "operations"
    finance = "finance"
```

Add to `ProjectMember`:
```python
persona: Mapped[ProjectPersona] = mapped_column(
    SAEnum(ProjectPersona), default=ProjectPersona.creator
)
```

When a user is auto-added to a project via `org.auto_add_to_projects`, their persona is set from `OrgMembership.default_persona`.

**`frontend/src/types/index.ts`**
```typescript
export type ProjectPersona = "developer" | "creator" | "operations" | "finance";

// Add to ProjectMember:
persona: ProjectPersona;
```

### Sidebar Restructure

Current nav groups (Core, Build, Platform, Operations) reorganize into workflow phases:

| Phase | Pages | Primary Personas |
|-------|-------|-----------------|
| **Think** | Ideas, Knowledge Graph, Documents, Business Rules | creator, finance, developer |
| **Design** | Canvas, Dependency Map | creator, developer |
| **Collaborate** | Video Rooms, Sessions (new), Documents | all |
| **Build** | Scaffold, Pipeline, Workspace, Deploy | developer |
| **Validate** | Audit, Compliance, Solana | finance, operations, developer |

**Implementation in `Sidebar.tsx`:**
- Fetch current user's persona from project membership
- Reorder `NAV_GROUPS` based on persona (e.g., creator sees Think → Design → Collaborate first, developer sees Build → Think → Design)
- All groups remain accessible — just reordered and collapsed/expanded by default based on persona
- Settings always at bottom

### Persona-Aware AI Chat

When building the system prompt in `claude_service.py`, include the user's persona:

```python
# In _build_system_prompt, add:
if persona == "creator":
    base += "\n\nThe current user is a creator/strategist. Explain technical concepts simply. Focus on business impact, decisions, and strategy rather than code details. When using tools, describe what you're doing in plain language."
elif persona == "finance":
    base += "\n\nThe current user handles finance and accounting. Focus on costs, compliance, ROI, and financial feasibility. Reference business rules and audit findings when relevant."
```

---

## 4. Chat Panel Modes

### Problem
Current chat panel is a fixed 400px slide-in. No way to expand, go fullscreen, minimize, or attach files. Non-tech users need a more familiar interface.

### Solution
Three display modes: **docked**, **expanded**, **fullscreen**. Mode persists in context.

### Context Changes

**`frontend/src/contexts/AIChatContext.tsx`**
```typescript
type PanelMode = "closed" | "docked" | "expanded" | "fullscreen";

// Add to context:
panelMode: PanelMode;
setPanelMode: (mode: PanelMode) => void;
```

### Layout Changes

**`frontend/src/components/layout/AppShell.tsx`**
```tsx
export function AppShell() {
  const { panelMode } = useAIChat();
  
  return (
    <div className="flex min-h-screen bg-cream dark:bg-black">
      <div className="hidden sm:flex">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-3 sm:p-6 overflow-auto pb-20 sm:pb-6">
          {panelMode === "fullscreen" ? <AIChatFullscreen /> : <Outlet />}
        </main>
      </div>
      <MobileBottomNav />
      {panelMode === "docked" && <AIChatPanel />}
      {panelMode === "expanded" && <AIChatExpanded />}
    </div>
  );
}
```

### Mode Specifications

| Mode | Width | Behavior |
|------|-------|----------|
| **Docked** | 400px (resizable) | Side panel, current behavior. Dev default. |
| **Expanded** | ~70% viewport | Chat takes majority of screen. Page visible but pushed aside. |
| **Fullscreen** | 100% content area | Replaces page content. Sidebar stays. Conversation list on left like Claude.ai. Non-tech default. |

### Panel Header Controls
- Minimize button → docked
- Expand/collapse toggle → expanded ↔ fullscreen
- Close button → closed
- Drag handle on left edge for docked mode resizing

### Persona-Based Defaults
- `developer` persona → opens in docked mode
- `creator` / `finance` / `operations` → opens in expanded mode
- Any persona can switch between modes freely

### Non-Tech Chat Adaptations

**Tool use display:**
Replace `ToolUseIndicator` with friendly labels for non-developer personas:

```typescript
const TOOL_LABELS: Record<string, string> = {
  get_project_summary: "Reviewing project overview...",
  get_canvas_components: "Checking architecture...",
  list_canvases: "Looking at canvases...",
  get_ideas: "Browsing ideas...",
  search_ideas: "Searching ideas...",
  create_idea: "Creating a new idea...",
  get_scaffold_job: "Checking code generation...",
  get_deploy_config: "Reviewing deployment config...",
  get_knowledge_context: "Searching project knowledge...",
  push_to_recall: "Saving to project memory...",
};
```

For developers: show current `ToolUseIndicator` with expandable JSON.
For non-developers: show a single line with the friendly label and a spinner.

**Empty state starter prompts (persona-aware):**

Creator:
- "What decisions have we made this week?"
- "Summarize our last session"
- "What are the open ideas?"
- "Run a feasibility check on our current approach"

Finance:
- "What's the project budget impact?"
- "Show me the latest audit report"
- "What compliance checks are failing?"
- "Summarize business rules"

Developer:
- "What should I work on next?"
- "Show me the architecture"
- "What's the deploy status?"
- "Check for dependency issues"

**Model selector:** Hidden for non-developer personas. System picks the model.

---

## 5. File Storage Layer

### Problem
No persistent file storage. Documents route extracts text to Recall but discards original bytes. Chat has no attachment support.

### Solution
Local disk storage behind a `File` model. Files organized by project. Content indexed to Recall. Original bytes always retrievable.

### Storage Structure
```
/data/files/{project_id}/{file_uuid}.{ext}
```

Mounted as a Docker volume in `docker-compose.yml`:
```yaml
backend:
  volumes:
    - filedata:/data/files

volumes:
  filedata:
```

### Model

**`backend/app/models/file.py`**
```python
class File(Base):
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    conversation_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation_messages.id"), nullable=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    
    # Recall integration
    recall_memory_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

### Service

**`backend/app/services/file_storage.py`**
```python
async def store_file(
    project_id: uuid.UUID,
    file: UploadFile,
    user_id: uuid.UUID,
    db: AsyncSession,
    conversation_message_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
) -> File:
    """Store file to disk, create DB record, index content to Recall."""
    # 1. Read and validate
    # 2. Write to /data/files/{project_id}/{file_uuid}.{ext}
    # 3. Create File record in Postgres
    # 4. Extract content (text, docx, PDF, image description via Claude)
    # 5. Index to Recall with file metadata tags
    # 6. Return File record

async def get_file(file_id: uuid.UUID, db: AsyncSession) -> File | None:
    """Get file metadata."""

async def get_file_bytes(file: File) -> bytes:
    """Read file bytes from disk."""

async def list_files(
    project_id: uuid.UUID,
    db: AsyncSession,
    conversation_message_id: uuid.UUID | None = None,
) -> list[File]:
    """List files, optionally filtered by conversation message."""
```

### Chat Attachment Flow

1. Frontend sends multipart POST to `/projects/{project_id}/ai/chat` with message text + files
2. Backend stores each file via `file_storage.store_file()`
3. Files included in Claude API call as content blocks:
   - Images → `type: "image"` with base64
   - PDFs → `type: "document"` with base64
   - Text/docx → extracted text appended to user message
4. File IDs linked to the conversation message record
5. When loading conversation history, file metadata included per message
6. Frontend renders attachment chips (files) or thumbnails (images) inline in message bubbles

### Route

**`backend/app/api/routes/files.py`**
```
POST   /projects/{project_id}/files/upload     → store file
GET    /projects/{project_id}/files             → list files
GET    /projects/{project_id}/files/{file_id}   → file metadata
GET    /projects/{project_id}/files/{file_id}/download → file bytes
DELETE /projects/{project_id}/files/{file_id}   → delete file
```

### Retrofit Documents Route
Update `documents.py` to use `file_storage.store_file()` instead of discarding bytes. Documents page gains download capability.

---

## 6. Session System

### Problem
No concept of temporary collaborative spaces. Can't share a whiteboard with specific users without sharing with everyone. No scribe for meetings. Video rooms are project-wide, not scoped to participants.

### Solution
A unified `Session` model that represents any temporary collaborative activity — whiteboard sharing, code pairing, video calls, thinking sessions.

### Models

**`backend/app/models/session.py`**
```python
class SessionType(str, enum.Enum):
    canvas = "canvas"         # Whiteboard sharing
    workspace = "workspace"   # Code pairing
    video = "video"           # Video call
    thinking = "thinking"     # Group discussion (audio/scribe)

class SessionStatus(str, enum.Enum):
    active = "active"
    ended = "ended"

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    session_type: Mapped[SessionType] = mapped_column(SAEnum(SessionType), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(SAEnum(SessionStatus), default=SessionStatus.active)
    
    # Optional linked resources
    canvas_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("canvases.id"), nullable=True)
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    livekit_room_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    # Yjs room for canvas sessions (separate from base canvas doc)
    yjs_room: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    host_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Device linking
    join_code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    
    # Scribe
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list["SessionMember"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class SessionMemberRole(str, enum.Enum):
    host = "host"
    participant = "participant"
    viewer = "viewer"

class SessionMember(Base):
    __tablename__ = "session_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role: Mapped[SessionMemberRole] = mapped_column(SAEnum(SessionMemberRole), default=SessionMemberRole.participant)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session: Mapped["Session"] = relationship(back_populates="members")
```

### Routes

**`backend/app/api/routes/sessions.py`**
```
POST   /projects/{project_id}/sessions                    → create session (generates join_code)
GET    /projects/{project_id}/sessions                    → list active sessions
GET    /projects/{project_id}/sessions/{session_id}       → session detail
POST   /projects/{project_id}/sessions/{session_id}/join  → join session (authenticated)
POST   /projects/{project_id}/sessions/{session_id}/end   → end session
POST   /projects/{project_id}/sessions/{session_id}/video → attach video (spin up LiveKit room)

GET    /sessions/join/{code}                               → resolve join code, return session info (public)
POST   /sessions/join/{code}                               → join by code (authenticated for draw/collaborate, optional for present)
GET    /sessions/join/{code}/qr                            → return QR code image for join URL
```

### Canvas Session Flow
1. Dev 1 opens canvas, clicks "Start Session"
2. Picks participants (Dev 2 only, or Dev 2 + Creator 1, etc.)
3. Backend creates `Session` with `session_type=canvas`, creates `SessionMember` records
4. Yjs room created as `canvas:{canvas_id}:session:{session_id}` — syncs from base canvas doc
5. Invited users get WebSocket notification (or polling)
6. They join → land in same canvas with live cursors, scoped to session participants
7. Session ends → changes merge back to base canvas doc, session summary auto-generated and pushed to Recall

### Whiteboard Projector Mode
See **Section 7: Device Linking & Canvas Collaboration** for the full iPad/projector/multi-device flow.

### Code Pairing Session Flow
1. Dev 1 clicks "Share Workspace" in the Workspace page
2. Backend creates `Session` with `session_type=workspace`, linked to Dev 1's workspace
3. Dev 2 gets invited, clicks to join
4. Dev 2 gets a proxied read-only view of Dev 1's code-server (via `ws_proxy.py` with session auth)
5. Optional: attach video for voice communication

### When Session Ends — Recall Integration
```python
async def end_session(session_id: uuid.UUID, db: AsyncSession):
    # 1. Mark session as ended
    # 2. If canvas session: merge Yjs changes back to base doc
    # 3. If transcript exists: summarize via Claude
    # 4. Push to Recall:
    #    - Session summary
    #    - Participants
    #    - Decisions made (extracted from transcript/chat)
    #    - Duration, type, linked resources
    #    Domain: {org_slug}:{project_slug}, tags: [session, type:{session_type}]
```

---

## 7. Device Linking & Canvas Collaboration

### Problem
The tldraw canvas is currently single-player. Each user loads shapes from the API into an isolated editor. No real-time sync between devices. Can't use an iPad as a drawing surface or cast to a projector.

### Solution
Wire tldraw to Yjs for real-time collaboration. Add device roles (controller/presenter/participant) via URL mode params. Support linking external devices via QR codes and join codes. Plan for a future native Android TV/Google TV projector app.

### Foundation: tldraw + Yjs Sync

**Current state:** `CanvasEditorPage.tsx` mounts `<Tldraw>` with no sync. Shapes are generated from API data via `populateTldrawShapes()`.

**Target state:** tldraw backed by a shared Yjs document via `useSync`. Every device connected to the same session sees the same canvas in real-time.

**`frontend/src/pages/CanvasEditorPage.tsx`** (key changes):
```tsx
import { useSync } from "@tldraw/sync";

// Determine mode from URL params
const searchParams = new URLSearchParams(location.search);
const sessionId = searchParams.get("session");
const mode = searchParams.get("mode") || "collaborate"; // "draw" | "present" | "collaborate"
const viewerToken = searchParams.get("token"); // for unauthenticated present mode

// Connect to Yjs document via y-websocket server
const yjsRoomId = sessionId
  ? `canvas:${canvasId}:session:${sessionId}`
  : `canvas:${canvasId}`;

const store = useSync({
  uri: `${settings.yjsWsUrl}/${yjsRoomId}`,
  assets: assetStore, // for image uploads on the canvas
});

<Tldraw
  store={store}
  hideUi={mode === "present"}
  onMount={(editor) => {
    editorRef.current = editor;

    if (mode === "present") {
      editor.updateInstanceState({ isReadonly: true });
      // Start viewport following (see below)
    }

    if (mode === "draw") {
      editor.setCurrentTool("draw");
      // Broadcast role via Yjs awareness
      store.awareness.setLocalState({
        ...store.awareness.getLocalState(),
        role: "controller",
      });
    }

    // Populate initial shapes only if fresh session with no existing Yjs data
    if (isNewSession && canvas?.components.length) {
      const existing = editor.getCurrentPageShapes();
      if (existing.length === 0) {
        populateTldrawShapes(editor, canvas.components, relevantEdges);
      }
    }
  }}
/>
```

### Three Device Roles

| Role | URL Mode | Auth Required | UI | Touch Optimized | Use Case |
|------|----------|---------------|-----|----------------|----------|
| **Controller** | `?mode=draw` | Yes | Simplified drawing toolbar, big touch targets | Yes | iPad at the whiteboard with Apple Pencil |
| **Presenter** | `?mode=present` | No (viewer token) | No UI, no cursor, high contrast, viewport follows controller | N/A | Smart projector, TV, second monitor |
| **Participant** | `?mode=collaborate` | Yes | Full tldraw desktop experience | No | Laptops in the room |

All three connect to the same Yjs document. Every stroke, shape, and cursor position syncs in real-time through the existing y-websocket server.

### Device Linking — Two Methods

#### Option A: QR Code

When a canvas session is created, the frontend shows a modal with a QR code:

```tsx
import { QRCodeSVG } from "qrcode.react";

function SessionShareModal({ session }: { session: Session }) {
  const baseUrl = window.location.origin;
  const drawUrl = `${baseUrl}/session/join/${session.join_code}?mode=draw`;
  const presentUrl = `${baseUrl}/session/join/${session.join_code}?mode=present`;

  return (
    <div className="space-y-6">
      {/* Draw mode — for iPad */}
      <div>
        <h3>Connect Drawing Device</h3>
        <p className="text-sm text-gray-400">Scan with iPad or tablet to draw</p>
        <QRCodeSVG value={drawUrl} size={200} />
        <code className="text-sm">{session.join_code}</code>
      </div>

      {/* Present mode — for projector */}
      <div>
        <h3>Connect Projector / Display</h3>
        <p className="text-sm text-gray-400">Scan or open on display device — no login needed</p>
        <QRCodeSVG value={presentUrl} size={200} />
      </div>
    </div>
  );
}
```

The user scans the QR code with their iPad camera → opens Safari → lands in the canvas in draw mode. For the projector, same flow — open the present URL on the projector's browser.

#### Option B: Direct URL / Join Code

For devices where QR scanning isn't convenient:

- **Join code:** Short human-readable code like `CANVAS-7F3K`. User types `codevv.example.com/join` on any device, enters the code, selects their role.
- **Direct link:** Copy-paste the full URL, share via AirDrop, Slack, etc.
- **From within Codevv:** Logged-in user goes to an active session from their session list and picks "Open as Controller" or "Open as Presenter."

**Join code generation:**
```python
import secrets
import string

def generate_join_code() -> str:
    chars = string.ascii_uppercase + string.digits
    code = ''.join(secrets.choice(chars) for _ in range(4))
    return f"CANVAS-{code}"
```

**Join code resolution route:**
```python
@router.get("/sessions/join/{code}")
async def resolve_join_code(
    code: str,
    mode: str = "collaborate",
    user: User | None = Depends(get_optional_user),
):
    session = await get_session_by_join_code(code, db)
    if not session or session.status != SessionStatus.active:
        raise HTTPException(404, "Session not found or ended")

    if mode == "present":
        # No auth required — generate a time-limited viewer token for Yjs WebSocket
        viewer_token = create_viewer_token(session.id, ttl=7200)  # 2 hours
        return {
            "session_id": str(session.id),
            "canvas_id": str(session.canvas_id),
            "yjs_room": session.yjs_room,
            "mode": "present",
            "viewer_token": viewer_token,
            "redirect": f"/projects/{session.project_id}/canvas/{session.canvas_id}?session={session.id}&mode=present&token={viewer_token}",
        }

    # draw and collaborate modes require authentication
    if not user:
        raise HTTPException(401, "Login required to join as participant or controller")

    # Add user as session member if not already
    await ensure_session_member(session.id, user.id, db)

    return {
        "session_id": str(session.id),
        "canvas_id": str(session.canvas_id),
        "yjs_room": session.yjs_room,
        "mode": mode,
        "redirect": f"/projects/{session.project_id}/canvas/{session.canvas_id}?session={session.id}&mode={mode}",
    }
```

### Presenter Mode — Viewport Following

The projector needs to follow whatever the controller is looking at. tldraw's Yjs integration includes an awareness protocol that broadcasts each user's cursor and camera.

**Controller broadcasts camera position:**
```tsx
// In draw mode, broadcast camera on every viewport change
useEffect(() => {
  if (mode !== "draw" || !editor) return;

  const handleViewportChange = () => {
    const camera = editor.getCamera();
    store.awareness.setLocalState({
      ...store.awareness.getLocalState(),
      role: "controller",
      camera: { x: camera.x, y: camera.y, z: camera.z },
    });
  };

  // tldraw emits camera changes
  const cleanup = editor.sideEffects.registerAfterChangeHandler("camera", handleViewportChange);
  return cleanup;
}, [mode, editor]);
```

**Presenter follows controller:**
```tsx
useEffect(() => {
  if (mode !== "present" || !editor) return;

  const handleAwarenessChange = () => {
    const states = store.awareness.getStates();
    for (const [clientId, state] of states) {
      if (state.role === "controller" && state.camera) {
        editor.setCamera(state.camera, { animation: { duration: 150 } });
        break;
      }
    }
  };

  store.awareness.on("change", handleAwarenessChange);
  return () => store.awareness.off("change", handleAwarenessChange);
}, [mode, editor]);
```

**Fallback if no controller:** If no device has `role: "controller"`, the presenter auto-zooms to fit all content every 5 seconds. This handles the case where everyone is in collaborate mode and nobody is explicitly controlling the view.

### Presenter Mode — Display Optimizations

```tsx
// CanvasEditorPage.tsx — present mode wrapper
if (mode === "present") {
  return (
    <div className="fixed inset-0 bg-[#0a0e14]">
      {/* No header, no sidebar, no chrome */}
      <Tldraw
        store={store}
        hideUi={true}
        onMount={(editor) => {
          editor.updateInstanceState({ isReadonly: true });
          // Hide grid
          editor.updateInstanceState({ isGridMode: false });
          // Hide cursor for this device
          document.body.style.cursor = "none";
        }}
      />
      {/* Minimal live indicator */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs text-white/70 font-mono">Live</span>
      </div>
    </div>
  );
}
```

CSS overrides for present mode:
```css
/* High contrast for projection */
[data-mode="present"] .tl-background {
  background: #0a0e14;
}

[data-mode="present"] .tl-shape-text {
  font-size: 1.2em; /* Slightly larger text for readability at distance */
}

/* Hide all cursors on presenter */
[data-mode="present"] .tl-collaborator-cursor {
  display: none;
}
```

### Controller Mode — Touch Optimization

```tsx
// Draw mode layout — simplified toolbar, maximized canvas surface
if (mode === "draw") {
  return (
    <div className="fixed inset-0 bg-[#0a0e14] touch-draw-mode">
      <Tldraw
        store={store}
        onMount={(editor) => {
          editor.setCurrentTool("draw");
          // Set up awareness broadcasting (see above)
        }}
      />
      {/* Session info bar — minimal, stays out of the way */}
      <div className="absolute top-2 right-2 bg-black/60 rounded-full px-3 py-1.5">
        <span className="text-xs text-white/70 font-mono">{sessionJoinCode}</span>
      </div>
    </div>
  );
}
```

Touch CSS:
```css
/* Applied when mode=draw — bigger targets for fingers and Apple Pencil */
.touch-draw-mode .tl-toolbar {
  transform: scale(1.25);
  transform-origin: bottom center;
  padding-bottom: env(safe-area-inset-bottom); /* respect iPad home indicator */
}

.touch-draw-mode .tl-toolbar-button {
  min-width: 48px;
  min-height: 48px;
}

.touch-draw-mode .tl-color-swatch {
  width: 36px;
  height: 36px;
}

/* Prevent accidental zoom on double-tap */
.touch-draw-mode {
  touch-action: none;
}
```

Apple Pencil support is native — tldraw handles pointer events correctly and distinguishes between finger (pan/zoom) and pencil (draw) automatically.

### Linked Devices Model

For persistent device pairing (connecting the projector to the org account so it auto-joins future sessions), add an `OrgDevice` model:

**`backend/app/models/organization.py`** (add to existing file):
```python
class DeviceType(str, enum.Enum):
    projector = "projector"     # Google TV projector, smart TV
    tablet = "tablet"           # iPad, Android tablet
    display = "display"         # Secondary monitor, digital signage
    kiosk = "kiosk"             # Standing kiosk / touch display

class OrgDevice(Base):
    __tablename__ = "org_devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    
    name: Mapped[str] = mapped_column(String(200), nullable=False)  # "Office Projector", "Whiteboard iPad"
    device_type: Mapped[DeviceType] = mapped_column(SAEnum(DeviceType), nullable=False)
    default_mode: Mapped[str] = mapped_column(String(20), default="present")  # "present" | "draw" | "collaborate"
    
    # Authentication
    device_token: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)  # long-lived token
    
    # Status
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, disabled, revoked
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Auto-join settings
    auto_join_sessions: Mapped[bool] = mapped_column(default=False)  # Auto-connect to new canvas sessions
    auto_join_project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # If set, only auto-join sessions in this project
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

**Device pairing flow for the Google projector:**

```
Step 1: Register device in Codevv
├── Tim goes to Org Settings → Devices → "Add Device"
├── Names it "Office Projector", type = projector
├── Codevv generates a long-lived device_token and a pairing code
└── Shows QR code + pairing code on screen

Step 2: Pair the projector
├── On the projector's browser, go to codevv.example.com/devices/pair
├── Enter the pairing code (or scan QR from projector if it has a camera)
├── Projector stores the device_token in local storage
├── Projector shows "Connected to Tim's Company" confirmation
└── Device status goes to "active", last_seen updates

Step 3: Ongoing use
├── When Tim starts a canvas session:
│   ├── If projector has auto_join_sessions = true:
│   │   └── Projector gets a push notification (or polls) and auto-opens the session in present mode
│   ├── If not auto-join:
│   │   └── Tim clicks "Cast to Office Projector" from the session share modal
│   │   └── Backend sends a WebSocket event to the projector device
│   │   └── Projector auto-opens the canvas in present mode
│   └── Either way: projector authenticates with device_token, no human login needed
└── Session ends → projector returns to standby screen (org logo, clock, "ready for next session")
```

**Device management routes:**
```
POST   /orgs/{org_id}/devices                 → register device, get pairing code
GET    /orgs/{org_id}/devices                 → list devices
PATCH  /orgs/{org_id}/devices/{device_id}     → update settings (name, auto-join, etc.)
DELETE /orgs/{org_id}/devices/{device_id}     → revoke device

POST   /devices/pair                           → pair device using pairing code (public)
GET    /devices/me                             → get device info (authenticated via device_token)
GET    /devices/me/sessions                    → list active sessions this device should join
```

### Future: Native Google TV / Android TV App

The web-based present mode works immediately on the projector's built-in browser. A dedicated Android TV app adds:

- **Persistent background service** — always connected, instant session loading (no opening a browser)
- **Cast protocol integration** — cast from Codevv mobile/desktop directly to the projector via Chromecast protocol
- **Standby screen** — org branding, clock, upcoming meetings, "ready for session" status
- **Voice commands** — "Hey Google, show the ADBP architecture" → opens the relevant canvas session
- **Hardware-accelerated rendering** — smoother tldraw rendering than the browser
- **Auto-discovery** — projector appears in Codevv's device list automatically via mDNS/SSDP on the local network

**Tech stack for the app:**
- Kotlin + Jetpack Compose for TV (or React Native TV if you want code sharing with mobile)
- WebView for tldraw rendering (tldraw is web-based, wrapping it is simpler than porting)
- WebSocket connection to y-websocket server for Yjs sync
- REST API calls to Codevv backend for session discovery and device auth
- Firebase Cloud Messaging for push notifications when sessions start

The native app is Phase 5+ — the web-based present mode is the MVP and works today on any device with a browser.

### Complete Device Experience

```
Tim's laptop (session host, collaborate mode):
┌──────────────────────────────────────────────────────┐
│ ← ADBP Architecture  [📱 QR Code] [🔗 Copy Link]    │
│                       [📺 Cast to Office Projector]   │
│  ┌──────────────────────────────┐  ┌──────────────┐  │
│  │                              │  │ Components   │  │
│  │   tldraw canvas              │  │              │  │
│  │   sees iPad cursor (teal)    │  │ + Add        │  │
│  │   sees Scott cursor (coral)  │  │              │  │
│  │                              │  │ • Service    │  │
│  └──────────────────────────────┘  └──────────────┘  │
│  3 devices connected · CANVAS-7F3K · Live             │
└──────────────────────────────────────────────────────┘

iPad (draw mode — Apple Pencil):
┌───────────────────────────────────┐
│                        CANVAS-7F3K│
│                                   │
│                                   │
│     tldraw canvas                 │
│     full drawing surface          │
│     Apple Pencil = draw           │
│     finger = pan/zoom             │
│                                   │
│                                   │
│  [✏️  🔲  ⭕  ↗️  T  📝  🗑️  🎨] │
└───────────────────────────────────┘

Google Projector (present mode — no UI):
┌──────────────────────────────────────────────────────────┐
│                                                            │
│                                                            │
│                                                            │
│            tldraw canvas (read-only mirror)                 │
│            follows iPad viewport                            │
│            high contrast on dark background                  │
│            no cursors, no toolbars                           │
│                                                            │
│                                                            │
│                                                   🔴 Live  │
└──────────────────────────────────────────────────────────┘

Projector standby (no active session):
┌──────────────────────────────────────────────────────────┐
│                                                            │
│                                                            │
│                    [Org Logo]                               │
│                  Tim's Company                              │
│                                                            │
│                    10:42 AM                                 │
│              Ready for next session                         │
│                                                            │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Recall Pairing (Codevv Side)

### Problem
Recall URL is hardcoded to `192.168.50.19:8200`. Codevv and Recall are tightly coupled. Need clean pairing so they can be deployed independently.

### Solution
Registration flow at startup. Codevv registers with Recall, gets a pairing token, stores it in Postgres.

### Model

**`backend/app/models/recall_pairing.py`**
```python
class RecallPairing(Base):
    __tablename__ = "recall_pairings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recall_url: Mapped[str] = mapped_column(String(500), nullable=False)
    instance_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    pairing_token: Mapped[str] = mapped_column(String(500), nullable=False)
    client_name: Mapped[str] = mapped_column(String(100), default="codevv")
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
```

### Startup Flow

**In `main.py` lifespan:**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", app=settings.app_name, env=settings.environment)
    await init_db()
    
    # Recall pairing
    if settings.recall_url:
        from app.services.recall_pairing import ensure_paired
        paired = await ensure_paired(settings.recall_url)
        if paired:
            logger.info("recall.paired", url=settings.recall_url)
        else:
            logger.warning("recall.unavailable", url=settings.recall_url)
    
    yield
    logger.info("shutdown")
```

### Update `recall.py`
All Recall HTTP calls include the pairing token:
```python
async def _recall_post(path: str, json: dict | None = None) -> dict:
    token = await get_pairing_token()
    headers = {"X-Client-Token": token} if token else {}
    async with httpx.AsyncClient(base_url=settings.recall_url, timeout=10.0) as client:
        resp = await client.post(path, json=json or {}, headers=headers)
        resp.raise_for_status()
        return resp.json()
```

### Degraded Mode
If Recall is unreachable at startup or goes down mid-operation:
- Knowledge Graph page shows "Memory system offline" banner
- Business Rules page shows cached rules (from Postgres fallback)
- Claude chat works but without Recall context enrichment
- File uploads still store to disk but skip Recall indexing (queue for later)
- Session end summaries queue for Recall push when connection restores

---

## 9. Notification & Real-Time Events

### Problem
No real-time communication between users. When Scott creates an idea, nobody knows. When a compliance check fails, nobody gets pinged. When someone starts a canvas session, no notification. Users must manually refresh pages. For 5 people collaborating daily, the platform feels like 5 separate apps.

### Solution
WebSocket event bus per authenticated user, backed by Redis pub/sub. Backend publishes events, frontend subscribes and renders toasts, badges, and live updates.

### Architecture

```
Backend service/route → Redis pub/sub → WebSocket gateway → Connected clients
```

**`backend/app/api/routes/events.py`** — WebSocket endpoint:
```python
@router.websocket("/ws/events")
async def event_stream(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    user = await authenticate_websocket(websocket, db)
    if not user:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    pubsub = redis.pubsub()
    
    # Subscribe to user's personal channel + all their org/project channels
    channels = [f"user:{user.id}"]
    orgs = await get_user_org_ids(user.id, db)
    for org_id in orgs:
        channels.append(f"org:{org_id}")
    projects = await get_user_project_ids(user.id, db)
    for project_id in projects:
        channels.append(f"project:{project_id}")
    
    await pubsub.subscribe(*channels)
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(*channels)
```

**`backend/app/services/events.py`** — event publisher:
```python
async def publish_event(
    channel: str,
    event_type: str,
    payload: dict,
    actor_id: uuid.UUID | None = None,
):
    """Publish an event to Redis pub/sub."""
    event = {
        "type": event_type,
        "payload": payload,
        "actor_id": str(actor_id) if actor_id else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await redis.publish(channel, json.dumps(event))


# Convenience helpers
async def project_event(project_id: uuid.UUID, event_type: str, payload: dict, actor_id: uuid.UUID):
    await publish_event(f"project:{project_id}", event_type, payload, actor_id)

async def org_event(org_id: uuid.UUID, event_type: str, payload: dict, actor_id: uuid.UUID):
    await publish_event(f"org:{org_id}", event_type, payload, actor_id)
```

### Event Types

| Event | Channel | Triggered By |
|-------|---------|-------------|
| `idea.created` | project:{id} | Ideas route |
| `idea.status_changed` | project:{id} | Ideas route or Claude tool |
| `canvas.component_added` | project:{id} | Canvases route or Claude tool |
| `document.uploaded` | project:{id} | Documents/files route |
| `session.started` | project:{id} | Sessions route |
| `session.ended` | project:{id} | Sessions route |
| `compliance.check_updated` | project:{id} | Compliance route |
| `task.assigned` | user:{assignee_id} + project:{id} | Tasks route |
| `task.completed` | project:{id} | Tasks route |
| `comment.created` | project:{id} | Comments route |
| `member.joined` | org:{id} | Org invite accept |
| `conversation.shared` | project:{id} | Conversations route |
| `recall.memory_created` | project:{id} | Recall webhook handler |
| `device.connected` | org:{id} | Device pairing |

### Frontend Integration

**`frontend/src/hooks/useEventStream.ts`**:
```typescript
export function useEventStream() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/events`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const event: AppEvent = JSON.parse(e.data);
      setEvents(prev => [event, ...prev].slice(0, 100));

      // Show toast for important events
      if (TOAST_EVENTS.includes(event.type)) {
        showToast(formatEventMessage(event));
      }
    };

    return () => ws.close();
  }, []);

  return { events };
}
```

**Sidebar badges:** Unread event count per nav group (e.g., "3" badge on Ideas when 3 new ideas since last visit).

**Page-level live updates:** Each page subscribes to relevant event types and refreshes data when received. E.g., Ideas page listens for `idea.created` and `idea.status_changed`, prepends new items without full reload.

---

## 10. Activity Feed

### Problem
No way to see what the team has been doing. Project overview shows counts but no timeline. Non-technical team members have no ambient awareness of project progress. "What happened today?" requires a meeting.

### Solution
An activity log model that captures all significant project actions. Rendered as a timeline on the project overview and available as a dedicated feed page.

### Model

**`backend/app/models/activity.py`**
```python
class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # "created", "updated", "deleted", "completed", "shared"
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "idea", "canvas_component", "document", "task", "session", etc.
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_name: Mapped[str | None] = mapped_column(String(300), nullable=True)  # human-readable name
    
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # extra context (old status → new status, etc.)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
```

### Service

**`backend/app/services/activity.py`**
```python
async def log_activity(
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: str,
    entity_name: str | None = None,
    details: dict | None = None,
    db: AsyncSession,
):
    """Log an activity and publish real-time event."""
    activity = Activity(
        project_id=project_id, actor_id=actor_id, action=action,
        entity_type=entity_type, entity_id=entity_id,
        entity_name=entity_name, details=details,
    )
    db.add(activity)
    await db.flush()

    # Also publish as real-time event
    await project_event(project_id, f"{entity_type}.{action}", {
        "entity_id": entity_id,
        "entity_name": entity_name,
        "actor_id": str(actor_id),
        **(details or {}),
    }, actor_id)
```

Called from every route that modifies data:
```python
# In ideas route after creating an idea:
await log_activity(project_id, user.id, "created", "idea", str(idea.id), idea.title, db=db)

# In compliance route after updating a check:
await log_activity(project_id, user.id, "updated", "compliance_check", str(check.id), check.name, 
    details={"old_status": "pending", "new_status": "passed"}, db=db)
```

### Route

**`backend/app/api/routes/activity.py`**
```
GET /projects/{project_id}/activity                     → paginated activity feed
GET /projects/{project_id}/activity?entity_type=idea    → filtered by entity type
GET /projects/{project_id}/activity?actor_id=uuid       → filtered by user
GET /projects/{project_id}/activity/summary              → daily summary (counts by action type)
```

### Project Overview Integration

The project overview page becomes the team's daily home:

```
┌──────────────────────────────────────────────────────────────┐
│  ADBP · Tim's Company                                        │
│                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│  │ 12 Ideas     │ │ 3 Active     │ │ 8/12         │          │
│  │ 4 need review│ │ Sessions     │ │ Compliance ✓ │          │
│  └──────────────┘ └──────────────┘ └──────────────┘          │
│                                                                │
│  ┌─ Who's Active ─────────────────────────────────────────┐  │
│  │ 🟢 Tim · Workspace  🟢 Scott · Architecture Canvas    │  │
│  │ 🟡 Creator 1 · Offline 2h  ⚪ Accountant · Offline 1d│  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Activity ─────────────────────────────────────────────┐  │
│  │ 10:42 AM  Scott added "Payment Gateway" to Architecture│  │
│  │ 10:38 AM  Tim completed task "Wire Yjs to tldraw"      │  │
│  │ 10:15 AM  Claude saved 3 decisions to project memory    │  │
│  │  9:50 AM  Accountant marked "SOC2 audit" as passed      │  │
│  │  9:30 AM  Creator 1 uploaded "Brand Guidelines v2.pdf"  │  │
│  │  Yesterday                                               │  │
│  │  5:12 PM  Tim shared conversation "Solana Credit Flow"  │  │
│  │  4:30 PM  Session ended: Architecture Review (45 min)   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ My Tasks ─────────────────────────────────────────────┐  │
│  │ □ Wire Yjs to tldraw · due tomorrow · from Tim         │  │
│  │ □ Review brand guidelines · no due date · from Creator1│  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 11. Task System

### Problem
No way to track work items, assign tasks to team members, or see what's blocking progress. The team uses external tools (or nothing) for task management. Ideas track proposals but not actionable work items.

### Solution
A lightweight task system scoped to projects. Tasks can be assigned to users, linked to any entity, and have due dates and priority. Not a full project management tool — just enough to track "who needs to do what by when."

### Model

**`backend/app/models/task.py`**
```python
class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    blocked = "blocked"
    done = "done"

class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.todo)
    priority: Mapped[TaskPriority] = mapped_column(SAEnum(TaskPriority), default=TaskPriority.medium)
    
    # Assignment
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Scheduling
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Linking — what entity does this task relate to?
    linked_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "idea", "canvas_component", "compliance_check", "session", etc.
    linked_entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Source — where did this task come from?
    source_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "manual", "claude", "session_summary", "compliance"
    source_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
```

### Routes

**`backend/app/api/routes/tasks.py`**
```
POST   /projects/{project_id}/tasks                    → create task
GET    /projects/{project_id}/tasks                    → list tasks (filterable by status, assignee, priority, due date)
GET    /projects/{project_id}/tasks/{task_id}          → task detail
PATCH  /projects/{project_id}/tasks/{task_id}          → update task (status, assignee, priority, etc.)
DELETE /projects/{project_id}/tasks/{task_id}          → delete task

GET    /tasks/me                                        → all tasks assigned to current user across all projects
GET    /tasks/me?status=todo&status=in_progress        → my open tasks
```

### Assignment Flow

Tim creates a task: "Review brand guidelines" → assigns to Scott → Scott gets a real-time notification (`task.assigned` event) → task appears in Scott's "My Tasks" on the overview page and in the `/tasks/me` global view.

When Scott marks it done → Tim gets a `task.completed` event → activity feed shows "Scott completed 'Review brand guidelines'."

### Claude Integration

Claude gets two new tools:

```python
{
    "name": "create_task",
    "description": "Create a task and optionally assign it to a team member. Use when action items emerge from conversation, when the user says 'remind me to...' or 'we need to...', or after a session summary identifies next steps.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "description": {"type": "string"},
            "assignee_email": {"type": "string", "description": "Email of the person to assign to. Optional."},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
            "due_date": {"type": "string", "description": "ISO date string. Optional."},
            "linked_entity_type": {"type": "string"},
            "linked_entity_id": {"type": "string"},
        },
        "required": ["title"],
    },
},
{
    "name": "list_tasks",
    "description": "Get tasks in the project, optionally filtered by assignee or status.",
    "input_schema": {
        "type": "object",
        "properties": {
            "status": {"type": "string", "enum": ["todo", "in_progress", "blocked", "done"]},
            "assigned_to_me": {"type": "boolean"},
        },
    },
}
```

Session summaries auto-generate tasks:
```python
# After session ends and summary is generated:
for action_item in extracted_action_items:
    await create_task(
        project_id=session.project_id,
        title=action_item["title"],
        assigned_to=resolve_user(action_item.get("assignee")),
        source_type="session_summary",
        source_id=str(session.id),
    )
```

### Frontend

**Tasks page** (`/projects/:id/tasks`):
- Kanban board view (todo | in progress | blocked | done) with drag-and-drop
- List view with sortable columns
- Filter by assignee, priority, due date, linked entity
- Quick-create inline (just title + enter, details later)

**"My Tasks" widget** on project overview and on the global dashboard (across all projects).

**Quick-assign modal**: when creating a task, show team members with their avatars and personas. Click to assign. Same pattern as session invite.

---

## 12. Claude Tool Expansion & Context Awareness

### Problem
Claude has 10 tools: 8 reads, 1 create idea, 1 push to Recall. It's mostly an observer. Non-tech users want to say "add a payment gateway to the architecture" and have Claude do it. The system prompt uses a fixed Recall query regardless of what page the user is on.

### Solution
Expand to ~20 tools with write capabilities. Make the system prompt page-aware and persona-aware.

### New Tools

| Tool | Type | Purpose |
|------|------|---------|
| `add_canvas_component` | write | Add a component to a canvas |
| `update_idea_status` | write | Move idea through workflow (draft → proposed → approved) |
| `update_compliance_check` | write | Mark a check as passed/failed/pending |
| `create_task` | write | Create and assign a task |
| `list_tasks` | read | Get project tasks with filters |
| `create_document` | write | Create a text document from conversation content |
| `search_everything` | read | Federated search across all entity types |
| `get_activity` | read | Recent project activity |
| `get_compliance_status` | read | Current compliance readiness overview |
| `get_business_rules` | read | Fetch active business rules |

### Page-Aware System Prompt

Pass the current route to the chat endpoint. Tailor Recall query and guidance based on where the user is:

**`frontend/src/components/ai/AIChatPanel.tsx`** change:
```typescript
// Include current route in chat request
const payload = {
  message: input,
  conversation_id: conversationId,
  model: currentModel,
  context: {
    page: location.pathname,  // "/projects/123/compliance"
    persona: currentMember.persona,
  },
};
```

**`backend/app/services/claude_service.py`** system prompt enhancement:
```python
async def _build_system_prompt(
    project_name: str,
    project_slug: str,
    project_id: uuid.UUID,
    page: str | None = None,
    persona: str | None = None,
) -> str:
    base = "..."  # existing base prompt

    # Page-specific context
    if page:
        if "/compliance" in page:
            recall_query = f"project {project_name} compliance requirements regulations"
            base += "\n\nThe user is on the Compliance page. Focus on launch readiness, regulatory requirements, and compliance checks. Use get_compliance_status to see current state."
        elif "/canvas" in page:
            recall_query = f"project {project_name} architecture components design"
            base += "\n\nThe user is on the Canvas (architecture) page. Focus on system design, component relationships, and technical decisions. Use list_canvases and get_canvas_components."
        elif "/ideas" in page:
            recall_query = f"project {project_name} ideas proposals features"
            base += "\n\nThe user is on the Ideas page. Help evaluate, refine, and prioritize ideas. Use get_ideas and search_ideas."
        elif "/rules" in page:
            recall_query = f"project {project_name} business rules constraints requirements"
            base += "\n\nThe user is on the Business Rules page. Focus on project constraints, architectural decisions, and compliance requirements."
        elif "/tasks" in page:
            recall_query = f"project {project_name} tasks action items priorities"
            base += "\n\nThe user is on the Tasks page. Help manage work items, priorities, and assignments."
        elif "/solana" in page:
            recall_query = f"project {project_name} solana blockchain credit flow transactions"
            base += "\n\nThe user is on the Solana page. Focus on blockchain integration, credit flow, and wallet management."
        else:
            recall_query = f"project {project_name} architecture decisions"
    else:
        recall_query = f"project {project_name} architecture decisions"

    # Persona-specific tone
    if persona == "creator":
        base += "\n\nThe user is a creator/strategist. Explain technical concepts simply. Focus on business impact and decisions. When using tools, describe what you're doing in plain language."
    elif persona == "finance":
        base += "\n\nThe user handles finance. Focus on costs, compliance, ROI, and financial feasibility."
    elif persona == "operations":
        base += "\n\nThe user handles operations. Focus on deployment, infrastructure, compliance, and process."

    # Enriched Recall context using page-aware query
    try:
        context = await get_recall_context(query=recall_query, max_tokens=1500)
        if context:
            base += f"\n\n## Project Knowledge (from Recall):\n{context}"
    except Exception:
        pass

    return base
```

### Dynamic Tool Filtering

Not all tools make sense for all personas. Filter the tool list based on persona:

```python
PERSONA_TOOLS = {
    "developer": None,  # all tools
    "creator": [
        "get_project_summary", "list_canvases", "get_canvas_components",
        "get_ideas", "search_ideas", "create_idea", "update_idea_status",
        "get_knowledge_context", "push_to_recall", "create_task", "list_tasks",
        "search_everything", "get_activity", "get_business_rules",
    ],
    "finance": [
        "get_project_summary", "get_ideas", "get_compliance_status",
        "get_business_rules", "get_knowledge_context", "push_to_recall",
        "create_task", "list_tasks", "search_everything", "get_activity",
        "update_compliance_check",
    ],
    "operations": [
        "get_project_summary", "get_deploy_config", "get_compliance_status",
        "get_business_rules", "get_knowledge_context", "push_to_recall",
        "create_task", "list_tasks", "search_everything", "get_activity",
        "update_compliance_check",
    ],
}
```

---

## 13. Shared Conversations

### Problem
Conversations are strictly per-user (`Conversation.user_id`). If Tim has a breakthrough conversation with Claude about the credit flow, Scott can't see it. Decisions made in AI conversations are invisible to the rest of the team.

### Solution
Add a `shared` flag to conversations. Shared conversations are readable by all project members. Original owner retains edit control.

### Model Change

**`backend/app/models/conversation.py`** — add fields:
```python
shared: Mapped[bool] = mapped_column(default=False)
shared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
shared_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
```

### Route Changes

**`backend/app/api/routes/conversations.py`**:
```
PATCH /projects/{project_id}/conversations/{id}/share    → toggle shared status
GET   /projects/{project_id}/conversations/shared        → list shared conversations from all users
```

The `list_conversations` endpoint continues to return the user's own conversations. A new `shared` endpoint returns conversations marked as shared by anyone in the project.

### Frontend

- "Share with team" button on conversation header → toggles shared flag
- Shared conversations appear in a "Team Conversations" tab in the chat panel's conversation list
- Shared conversations are read-only for non-owners (can read, can't add messages)
- Badge: "Shared by Tim" with timestamp

### Activity Integration

When a conversation is shared → activity log entry → real-time event → team sees "Tim shared conversation 'Solana Credit Flow Architecture'" in the feed.

---

## 14. Global Search

### Problem
Search is fragmented. Ideas have keyword search. Recall has semantic search. No way to search across canvases, documents, tasks, conversations, compliance checks, and knowledge in one query. Non-technical users don't know which page to go to when looking for something.

### Solution
A federated search endpoint that queries all entity types and returns ranked results. Accessible from a global search bar in the top nav.

### Route

**`backend/app/api/routes/search.py`**
```
GET /projects/{project_id}/search?q=credit+flow&types=all → federated search
```

### Service

**`backend/app/services/search.py`**
```python
async def federated_search(
    project_id: uuid.UUID,
    query: str,
    entity_types: list[str] | None = None,  # None = all
    limit: int = 20,
    db: AsyncSession,
) -> list[SearchResult]:
    """Search across all entity types, return ranked results."""
    results = []
    types = entity_types or ["idea", "canvas_component", "task", "document", "conversation", "knowledge", "compliance", "rule"]

    # Parallel search across entity types
    tasks = []
    if "idea" in types:
        tasks.append(search_ideas(project_id, query, db))
    if "canvas_component" in types:
        tasks.append(search_canvas_components(project_id, query, db))
    if "task" in types:
        tasks.append(search_tasks(project_id, query, db))
    if "document" in types or "knowledge" in types or "rule" in types:
        tasks.append(search_recall(query, f"codevv:{project_slug}"))
    if "conversation" in types:
        tasks.append(search_conversations(project_id, query, db))
    if "compliance" in types:
        tasks.append(search_compliance(project_id, query, db))

    all_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Merge, rank by relevance, deduplicate
    for result_set in all_results:
        if isinstance(result_set, Exception):
            continue
        results.extend(result_set)

    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]
```

### Search Result Schema

```python
class SearchResult(BaseModel):
    entity_type: str        # "idea", "task", "canvas_component", etc.
    entity_id: str
    title: str              # human-readable name
    snippet: str            # relevant text excerpt
    score: float            # relevance score
    url: str                # deep link to the entity in Codevv
    metadata: dict | None   # extra context (status, assignee, etc.)
```

### Frontend

**Global search bar in `TopBar.tsx`:**
- `Cmd+K` / `Ctrl+K` keyboard shortcut opens search modal
- Typeahead with debounce (300ms)
- Results grouped by entity type with icons
- Click result → navigate to that entity's page
- Recent searches persisted in localStorage

### Claude Tool

```python
{
    "name": "search_everything",
    "description": "Search across all project data — ideas, tasks, canvas components, documents, knowledge, compliance checks, and conversations. Use when the user asks 'find...' or 'where is...' or references something you need to locate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "entity_types": {
                "type": "array",
                "items": {"type": "string", "enum": ["idea", "task", "canvas_component", "document", "knowledge", "compliance", "conversation", "rule"]},
                "description": "Filter to specific types. Omit for all.",
            },
        },
        "required": ["query"],
    },
}
```

---

## 15. Comments & Cross-References

### Problem
Only ideas have comments. Can't discuss a canvas component, a document, a compliance check, or a task inline. Everything is siloed — can't link an idea to a canvas component it references, can't connect a task to the compliance check it addresses.

### Solution
A polymorphic `Comment` model and a `Reference` model that can attach to any entity.

### Models

**`backend/app/models/comment.py`**
```python
class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    
    # What is this comment on?
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "idea", "canvas_component", "task", "document", "compliance_check", "knowledge_entity"
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Optional @mention tracking
    mentioned_user_ids: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Reference(Base):
    __tablename__ = "references"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    
    relation: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "implements", "blocks", "relates_to", "depends_on"
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

### Routes

```
POST   /projects/{project_id}/comments                    → create comment (body includes entity_type + entity_id)
GET    /projects/{project_id}/comments?entity_type=task&entity_id=uuid → get comments for an entity
DELETE /projects/{project_id}/comments/{comment_id}        → delete comment

POST   /projects/{project_id}/references                   → create reference (source → target)
GET    /projects/{project_id}/references?entity_type=idea&entity_id=uuid → get all references for an entity
DELETE /projects/{project_id}/references/{reference_id}    → delete reference
```

### @Mentions

When a comment body includes `@scott`, the backend:
1. Resolves "scott" to a user ID via project membership
2. Stores the user ID in `mentioned_user_ids`
3. Publishes a `user:{scott_id}` event: "Tim mentioned you in a comment on 'Payment Gateway' task"

### Frontend Component

**`CommentThread.tsx`** — reusable component dropped into any entity detail view:
```tsx
<CommentThread entityType="task" entityId={task.id} projectId={projectId} />
```

Works on ideas (replaces existing idea comments), canvas components, tasks, compliance checks, documents, knowledge entities.

---

## 16. Business Rules Uplift

### Problem
Business rules are just pinned Recall memories. 51-line service. No structured schema. No enforcement levels. No versioning. No way for Claude to validate actions against rules. For a platform building a regulated financial product (ADBP), business rules need to be first-class.

### Solution
A `BusinessRule` model in Postgres with structured fields. Rules are still synced to Recall for semantic search, but the source of truth is Postgres.

### Model

**`backend/app/models/business_rule.py`**
```python
class RuleEnforcement(str, enum.Enum):
    mandatory = "mandatory"     # Must be followed, blocks non-compliance
    recommended = "recommended" # Should be followed, warns on violation
    advisory = "advisory"       # Nice to have, informational

class RuleScope(str, enum.Enum):
    architecture = "architecture"
    compliance = "compliance"
    security = "security"
    financial = "financial"
    operational = "operational"
    coding = "coding"

class BusinessRule(Base):
    __tablename__ = "business_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)  # Why this rule exists
    
    enforcement: Mapped[RuleEnforcement] = mapped_column(SAEnum(RuleEnforcement), default=RuleEnforcement.recommended)
    scope: Mapped[RuleScope] = mapped_column(SAEnum(RuleScope), nullable=False)
    
    # Versioning
    version: Mapped[int] = mapped_column(default=1)
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # previous version
    
    # Status
    active: Mapped[bool] = mapped_column(default=True)
    
    # Recall sync
    recall_memory_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
```

### Routes

```
POST   /projects/{project_id}/rules            → create rule (also syncs to Recall)
GET    /projects/{project_id}/rules             → list active rules (filterable by scope, enforcement)
GET    /projects/{project_id}/rules/{rule_id}   → rule detail with version history
PATCH  /projects/{project_id}/rules/{rule_id}   → update rule (creates new version, old becomes superseded)
DELETE /projects/{project_id}/rules/{rule_id}   → deactivate rule (soft delete)
```

### Claude Integration

Include active rules in the system prompt for relevant pages:
```python
# In _build_system_prompt, add:
rules = await get_active_rules(project_id, db)
if rules:
    rules_text = "\n".join(f"- [{r.enforcement.value.upper()}] {r.title}: {r.description}" for r in rules)
    base += f"\n\n## Active Business Rules:\n{rules_text}\nRespect these rules when making recommendations."
```

New tool: `get_business_rules` — returns all active rules with enforcement levels so Claude can reference them in answers.

---

## 17. Knowledge Graph Editing

### Problem
Knowledge Graph page is 1391 lines of visualization but read-only. Can't create entities, draw relations, or edit properties through the UI. Claude and code are the only ways to populate it.

### Solution
Make the Knowledge Graph an interactive editor. Click to create nodes, drag to create relations, inline edit properties.

### Frontend Changes to `KnowledgeGraphPage.tsx`

**Create entity:**
- Click empty space on the graph → "New Entity" modal appears
- Name, type (concept/technology/decision/requirement/architecture), description
- Backend creates `KnowledgeEntity` in Postgres + pushes to Recall
- Node appears on the graph immediately

**Create relation:**
- Click source node, drag to target node → "New Relation" modal
- Relation type: depends_on, implements, relates_to, conflicts_with, enables
- Backend creates `KnowledgeRelation` in Postgres
- Edge appears on the graph

**Inline edit:**
- Double-click a node → inline edit name, description, properties
- Changes save on blur/enter
- Synced to Recall

**Merge duplicates:**
- Select two nodes → "Merge" button
- Pick which one is the primary, other becomes an alias
- Relations from both are consolidated

**Bulk import from conversation:**
- "Extract entities" button → sends recent conversation to Claude
- Claude identifies entities and relations mentioned in discussion
- Shows preview: "Found 5 entities and 3 relations. Import?"
- One-click import

### Backend Changes

**Update `backend/app/api/routes/knowledge.py`:**
```
POST   /projects/{project_id}/knowledge/entities              → create entity
PATCH  /projects/{project_id}/knowledge/entities/{id}         → update entity
DELETE /projects/{project_id}/knowledge/entities/{id}         → delete entity
POST   /projects/{project_id}/knowledge/relations              → create relation
DELETE /projects/{project_id}/knowledge/relations/{id}        → delete relation
POST   /projects/{project_id}/knowledge/extract               → AI extract entities from text
```

---

## 18. Documents Redesign

### Problem
Documents page uploads files, extracts text, stores in Recall, discards original bytes. No preview, no organization, no versioning, no editing. More of a "upload and forget" feature.

### Solution
With the file storage layer (Section 5), original bytes are preserved. The Documents page needs a full UI redesign to become useful.

### Frontend Overhaul

**File browser layout:**
```
┌──────────────────────────────────────────────────────┐
│ Documents                          [📁 New Folder] [⬆️ Upload] │
│                                                        │
│ ┌─ Tags: [all] [briefs] [legal] [design] [technical] ┐│
│                                                        │
│  📄 Brand Guidelines v2.pdf          Creator1 · 2h ago │
│  📄 ADBP Credit Flow Spec.docx      Tim · yesterday   │
│  📄 SOC2 Compliance Template.pdf     Accountant · 3d   │
│  📄 Meeting Notes 2026-02-24.md      Claude · 4d       │
│  📄 Investor Pitch Deck.pptx         Creator2 · 1w     │
│                                                        │
│ ┌─ Preview ──────────────────────────────────────────┐ │
│ │                                                      │ │
│ │  [rendered preview of selected document]              │ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Key features:**
- **Drag-and-drop upload** — drop files anywhere on the page
- **File preview pane** — PDF viewer (pdf.js), image viewer, text/markdown with syntax highlighting, .docx rendered as HTML
- **Tag-based organization** — no rigid folder hierarchy, flexible tags. Users add tags during or after upload.
- **Version history** — upload a new version of an existing doc, old version preserved
- **Download original** — always available, not just extracted text
- **AI summary** — "Summarize this document" button, runs through Claude, stores summary as a Recall memory
- **Comment thread** — uses the polymorphic Comment system from Section 15

---

## 19. Recall Service Resilience

### Problem
`recall.py` is 95 lines with no error handling beyond bare `except`, no retry, no caching. If Recall is slow or down, any page touching Recall hangs or fails. Affects Knowledge Graph, Rules, Documents, and Claude chat context.

### Solution
Add retry with backoff, circuit breaker, response caching, and async write queue.

### Updated `recall.py`

```python
import asyncio
from functools import wraps

# Circuit breaker state
_circuit_open = False
_circuit_opened_at = 0
_failure_count = 0
_FAILURE_THRESHOLD = 3
_RECOVERY_TIMEOUT = 30  # seconds

async def _recall_request(method: str, path: str, **kwargs) -> dict:
    """Core request with retry, circuit breaker, and timeout."""
    global _circuit_open, _circuit_opened_at, _failure_count

    # Circuit breaker check
    if _circuit_open:
        if time.time() - _circuit_opened_at > _RECOVERY_TIMEOUT:
            _circuit_open = False  # Half-open: try one request
        else:
            raise RecallUnavailableError("Circuit breaker open")

    token = await get_pairing_token()
    headers = {"X-Client-Token": token} if token else {}

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(base_url=settings.recall_url, timeout=5.0) as client:
                resp = await getattr(client, method)(path, headers=headers, **kwargs)
                resp.raise_for_status()
                _failure_count = 0
                return resp.json()
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            _failure_count += 1
            if _failure_count >= _FAILURE_THRESHOLD:
                _circuit_open = True
                _circuit_opened_at = time.time()
                raise RecallUnavailableError("Recall unreachable") from e
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))  # 0.5s, 1s backoff
            else:
                raise


# Read cache (Redis, 60 second TTL)
async def search_recall_cached(query: str, domains: list[str] | None = None, limit: int = 20) -> list[dict]:
    """Cached version of search_recall for repeated queries."""
    cache_key = f"recall:search:{hashlib.md5(f'{query}:{domains}:{limit}'.encode()).hexdigest()}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    results = await search_recall(query, domains, limit)
    await redis.setex(cache_key, 60, json.dumps(results))
    return results


# Async write queue via ARQ
async def queue_recall_store(payload: dict):
    """Queue a Recall write for async processing. Non-blocking."""
    from app.workers.main import arq_pool
    await arq_pool.enqueue_job("store_to_recall", payload)
```

### ARQ Worker Task

**`backend/app/workers/recall_tasks.py`**:
```python
async def store_to_recall(ctx, payload: dict):
    """Async Recall store with retry."""
    try:
        await _recall_post("/memory/store", json=payload)
    except RecallUnavailableError:
        # Re-queue with backoff
        raise Retry(defer=30)  # retry in 30 seconds
```

---

## 20. Embedding Cache & Reactive Compliance

### Embedding Cache

**Problem:** `embedding.py` is 15 lines. Every call hits Ollama. Repeated texts = redundant GPU round-trips.

**Solution:** Redis cache keyed on content hash:

```python
async def get_embedding(text: str) -> list[float]:
    cache_key = f"embed:{hashlib.md5(text.encode()).hexdigest()}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/embed",
            json={"model": settings.ollama_embed_model, "input": text},
        )
        resp.raise_for_status()
        embedding = resp.json()["embeddings"][0]

    await redis.setex(cache_key, 86400, json.dumps(embedding))  # 24h TTL
    return embedding
```

### Reactive Compliance

**Problem:** Compliance checks are static. When architecture changes, compliance doesn't re-evaluate.

**Solution:** Event-driven re-evaluation. When certain events fire, compliance checks auto-re-run:

```python
# In the event handler for canvas.component_added, canvas.component_deleted, rule.created, etc.:
async def on_architecture_change(project_id: uuid.UUID):
    """Re-evaluate architecture-related compliance checks."""
    checks = await get_compliance_checks(project_id, scope="architecture", db=db)
    for check in checks:
        if check.auto_evaluate:
            result = await evaluate_compliance_check(check, db)
            if result.status != check.status:
                await log_activity(project_id, system_user_id, "auto_updated", "compliance_check", ...)
```

Not every check is auto-evaluable — some require human judgment. Add `auto_evaluate: bool` to compliance checks.

---

## 21. Multi-Platform Strategy

### Problem
Codevv is currently a web app only. The team uses iPads (for whiteboard drawing), phones (for on-the-go task checking), and desktops (for development). A web-only approach limits engagement — creators won't bookmark a URL, but they'll tap an app icon.

### Solution
A progressive multi-platform strategy that maximizes code reuse. Web first, then wrap for mobile and desktop.

### Platform Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Shared Core                              │
│  React 19 + Vite + TypeScript                              │
│  Components, hooks, contexts, API layer, types              │
│  ~90% of the codebase lives here                           │
└────────────────────────────────────────────────────────────┘
        │                    │                    │
   ┌────▼────┐        ┌─────▼─────┐       ┌─────▼─────┐
   │   Web   │        │  Mobile   │       │  Desktop  │
   │  Vite   │        │ Capacitor │       │   Tauri   │
   │  PWA    │        │ iOS/Andrd │       │ Win/Mac/  │
   │         │        │           │       │  Linux    │
   └─────────┘        └───────────┘       └───────────┘
                            │
                      ┌─────▼─────┐
                      │ TV / IoT  │
                      │ Capacitor │
                      │ or WebView│
                      └───────────┘
```

### Strategy 1: Progressive Web App (Immediate)

The cheapest win. Zero new dependencies, works today.

**`frontend/vite.config.ts`** — add PWA plugin:
```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Codevv',
        short_name: 'Codevv',
        description: 'Collaborative software design platform',
        theme_color: '#00AFB9',
        background_color: '#0a0e14',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
});
```

This gives you:
- "Install" prompt on mobile browsers → adds Codevv to home screen as a standalone app
- Offline capability for cached pages
- Push notifications via service worker (pairs with the event system)
- Same URL, zero app store friction

### Strategy 2: Capacitor for Mobile (iOS + Android)

Capacitor wraps your existing web app in a native shell. Same React codebase, native device APIs.

**Setup:**
```bash
npm install @capacitor/core @capacitor/cli
npx cap init Codevv com.codevv.app
npx cap add ios
npx cap add android
```

**What Capacitor gives you over PWA:**
- Native push notifications (APNs / FCM) — more reliable than web push
- Biometric auth (Face ID, fingerprint) for login
- Camera access for scanning QR codes (session join)
- Haptic feedback for interactions
- Share sheet integration ("Share to Codevv")
- App Store / Play Store distribution
- Background sync for task reminders

**Platform-specific adaptations (`frontend/src/lib/platform.ts`):**
```typescript
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "web" | "ios" | "android"

// Conditionally use native features
export async function scanQRCode(): Promise<string> {
  if (isNative) {
    const { BarcodeScanner } = await import('@capacitor-community/barcode-scanner');
    const result = await BarcodeScanner.startScan();
    return result.content;
  } else {
    // Fallback: show manual code entry
    return promptForCode();
  }
}

export async function sendPushNotification(token: string) {
  if (isNative) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    // Register with backend
  } else {
    // Web push via service worker
  }
}
```

**Mobile-specific layouts:**

The app already has responsive breakpoints and `MobileBottomNav`. Capacitor just wraps it. Key additions:
- Safe area insets for notch/home indicator: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`
- Pull-to-refresh on list pages
- Swipe gestures (swipe right to go back, swipe left on task to mark done)
- Simplified views for small screens — e.g., canvas in mobile opens in draw mode by default

### Strategy 3: Tauri for Desktop (Windows / Mac / Linux)

Tauri wraps the web app in a native desktop window using the system's WebView. ~10MB binary vs Electron's ~150MB.

**Setup:**
```bash
npm install @tauri-apps/cli @tauri-apps/api
npx tauri init
```

**What Tauri gives you over a browser tab:**
- System tray icon with notification badges
- Native window management (always-on-top for chat panel, picture-in-picture for video)
- Keyboard shortcuts that don't conflict with browser shortcuts
- File system access (drag files from desktop → Codevv)
- Auto-start on login
- Deep linking (click `codevv://project/123/task/456` in Slack → opens in desktop app)
- Offline-first with local SQLite cache

**Desktop-specific features (`frontend/src/lib/platform.ts`):**
```typescript
import { platform } from './platform';

// System tray with unread count
if (platform === 'desktop') {
  import('@tauri-apps/api/window').then(({ appWindow }) => {
    // Update badge count when events arrive
    eventStream.on('task.assigned', () => updateTrayBadge());
  });
}

// Deep link handling
import('@tauri-apps/api/event').then(({ listen }) => {
  listen('deep-link', (event) => {
    router.navigate(event.payload.path);
  });
});
```

### Strategy 4: Google TV / Android TV (Projector)

Two approaches:

**Approach A: Capacitor Android TV build** (lower effort)
Same Capacitor project, different build target. Uses the Leanback library for D-pad navigation. WebView renders the present-mode canvas.

**Approach B: Native Kotlin app** (better UX, future)
Dedicated app with Jetpack Compose for TV. WebView for tldraw rendering. Native standby screen, Cast protocol, voice commands. This is what we described in Section 7.

Start with Approach A (just a Capacitor build with TV manifest flags). Migrate to Approach B when the projector becomes a daily-use device.

### Build Pipeline

```
frontend/               ← shared React source
├── src/
├── dist/              ← vite build output (web)
├── ios/               ← capacitor iOS project
├── android/           ← capacitor Android project (phone + TV)
├── src-tauri/         ← tauri desktop project
└── capacitor.config.ts
```

**Single codebase, four targets:**
```bash
# Web (production)
npm run build

# iOS
npx cap sync ios && npx cap open ios   # opens Xcode

# Android (phone + TV)
npx cap sync android && npx cap open android  # opens Android Studio

# Desktop
npx tauri build  # produces .dmg, .msi, .AppImage
```

### Responsive Design Rules

The platform should work well at every breakpoint without separate codepaths:

| Breakpoint | Device | Layout Changes |
|-----------|--------|---------------|
| < 640px | Phone | Bottom nav, single column, chat fullscreen only, simplified canvas |
| 640-1024px | Tablet / iPad | Side nav collapsed, chat expanded default, touch-optimized canvas |
| 1024-1440px | Laptop | Full side nav, chat docked, standard desktop experience |
| > 1440px | Desktop / ultrawide | Side nav + docked chat + main content all visible simultaneously |

### Implementation Order

1. **PWA** (1-2 days) — vite-plugin-pwa, manifest, service worker. Instant mobile "app" with zero friction.
2. **Capacitor iOS + Android** (1 week) — wrap existing web app, add native push, QR scanner, biometric auth.
3. **Tauri desktop** (1 week) — wrap for desktop, system tray, deep links, keyboard shortcuts.
4. **Android TV** (later) — Capacitor TV build or native Kotlin app for projector.

---

## 22. Frontend Types Refactor

### Problem
`types/index.ts` is 479 lines with 50+ interfaces. Adding Org, Session, File, Persona, and chat mode types will make it unmanageable.

### Solution
Split by domain, re-export from index.

### New Structure
```
frontend/src/types/
  index.ts          → re-exports all
  auth.ts           → User, TokenResponse
  org.ts            → Organization, OrgMembership, OrgRole, OrgMemberStatus, OrgDevice, DeviceType (NEW)
  project.ts        → Project, ProjectMember, ProjectRole, ProjectPersona
  canvas.ts         → Canvas, CanvasComponent, CanvasDetail, CanvasViewMode (NEW)
  idea.ts           → Idea, IdeaComment, IdeaDetail, IdeaStatus
  knowledge.ts      → KnowledgeEntity, KnowledgeRelation, GraphNode, GraphEdge, GraphData
  scaffold.ts       → ScaffoldJob, ScaffoldStatus
  deploy.ts         → Environment, DeployJob, DeployStatus
  ai.ts             → Conversation, ChatMessage, ToolUseEvent, AIModel, DoneEvent, ChatContext, PanelMode
  session.ts        → Session, SessionMember, SessionType, SessionStatus, JoinCodeResponse (NEW)
  file.ts           → File (NEW)
  task.ts           → Task, TaskStatus, TaskPriority (NEW)
  activity.ts       → Activity, ActivityFeedItem (NEW)
  comment.ts        → Comment, Reference (NEW)
  rules.ts          → BusinessRule, RuleEnforcement, RuleScope, RecallMemory (UPDATED)
  search.ts         → SearchResult, SearchQuery (NEW)
  events.ts         → AppEvent, EventType (NEW)
  video.ts          → VideoRoom, RoomToken
  workspace.ts      → Workspace, TerminalSession
  solana.ts         → SolanaWatchlistItem, SolanaBalance, SolanaTransaction
  compliance.ts     → ComplianceCheck, ComplianceChecklist, LaunchReadiness
  audit.ts          → AuditReport, AuditSection
  dependencies.ts   → DependencyNode, DependencyEdge, DependencyGraph
  pipeline.ts       → AgentRun, AgentFinding, AgentRunDetail
  platform.ts       → PlatformType, NativeCapabilities (NEW)
```

---

## 23. Implementation Priority

### Phase 0 — Organization & Onboarding (do first, everything depends on this)
1. **Organization model + OrgMembership** — migration
2. **Add org_id to Project** — migration + update project CRUD
3. **Org routes** — create, invite, accept, members
4. **Invite flow** — token-based invites, email matching, auto-activate
5. **Org setup wizard** — frontend page for first-time org creation
6. **Claude auth mode on org** — `claude_auth_mode`, subscription validation
7. **Org switcher on dashboard** — personal workspace vs business org
8. **Update project list** — filter by current org

### Phase 1 — Real-Time & Team Awareness (biggest daily impact)
9. **Notification layer** — WebSocket event bus, Redis pub/sub, `events.py` service
10. **Activity model + feed** — log all project actions, render timeline on overview
11. **Project overview redesign** — activity feed, who's online, my tasks, compliance status
12. **Sidebar badges** — unread counts per section
13. **Page-level live updates** — subscribe to events, refresh data without full reload

### Phase 2 — Tasks & Collaboration Primitives
14. **Task model + routes** — create, assign, filter, complete
15. **Comment model** — polymorphic comments on any entity
16. **Reference model** — cross-links between entities
17. **@mentions** — resolve users in comment body, send notification
18. **Shared conversations** — team-visible flag, shared conversations tab in chat
19. **"My Tasks" view** — cross-project task list for each user

### Phase 3 — Foundation & Types
20. **Persona field on ProjectMember** — migration + API update + frontend type
21. **Types refactor** — split `types/index.ts` before adding new types
22. **File storage layer** — `File` model, `file_storage.py` service, disk storage volume
23. **Retrofit documents route** — use file storage, preserve original bytes
24. **Business rules uplift** — `BusinessRule` model in Postgres, structured schema, versioning

### Phase 4 — Claude Intelligence
25. **Claude write tools** — `add_canvas_component`, `update_idea_status`, `update_compliance_check`, `create_task`, `list_tasks`, `create_document`
26. **Federated search** — `search_everything` tool + global search route + `Cmd+K` UI
27. **Page-aware system prompt** — pass current route + persona, tailor Recall query
28. **Persona-based tool filtering** — show relevant tools per persona
29. **Business rules in system prompt** — inject active rules for Claude to reference
30. **Chat panel modes** — docked/expanded/fullscreen with mode switching
31. **Chat file attachments** — multipart upload, persistent storage, inline rendering
32. **Persona-aware chat** — friendly tool labels, starter prompts
33. **Chat input toolbar** — attach file, attach image, (mic placeholder)

### Phase 5 — Sessions & Canvas Collaboration
34. **Session model + routes** — create, join, end, list, join codes
35. **tldraw + Yjs sync** — wire `useSync` to y-websocket server, replace isolated editor
36. **Canvas sessions** — selective user sharing, scoped Yjs rooms
37. **View mode routing** — `?mode=draw|present|collaborate` param handling
38. **Presenter mode** — read-only, no UI, viewport following, high contrast
39. **Controller mode** — touch-optimized toolbar, Apple Pencil, camera broadcast
40. **QR code + join code** — session share modal with both linking methods
41. **Unauthenticated present mode** — viewer tokens for projector/TV
42. **Workspace sessions** — read-only code sharing between devs

### Phase 6 — Device Management & Recall Pairing
43. **OrgDevice model** — persistent device registration, device tokens
44. **Device pairing flow** — pairing codes, device management UI in org settings
45. **Cast to device** — "Cast to Office Projector" button in session share modal
46. **Auto-join** — devices auto-connect to new sessions when configured
47. **Projector standby screen** — org logo, clock, "ready for next session"
48. **RecallPairing model** — migration
49. **Pairing service** — register, health check, token management
50. **Update recall.py** — token headers on all requests, retry, circuit breaker, caching
51. **Startup pairing** — lifespan hook
52. **Degraded mode** — offline banners, queued operations

### Phase 7 — Content & Knowledge Uplift
53. **Knowledge Graph editing** — create nodes, draw relations, inline edit, merge duplicates
54. **Knowledge extraction from conversations** — AI extract entities + relations
55. **Documents redesign** — file browser, preview pane, tags, drag-and-drop, version history
56. **Recall service resilience** — retry with backoff, circuit breaker, Redis cache, ARQ write queue
57. **Embedding cache** — Redis-backed cache for Ollama embeddings
58. **Reactive compliance** — auto re-evaluate checks on architecture changes

### Phase 8 — Multi-Platform
59. **PWA** — vite-plugin-pwa, manifest, service worker, installable on mobile
60. **Capacitor iOS + Android** — native shell, push notifications, QR scanner, biometric auth
61. **Tauri desktop** — system tray, deep links, keyboard shortcuts, native window management
62. **Responsive polish** — safe area insets, pull-to-refresh, swipe gestures, mobile canvas
63. **Android TV / Capacitor build** — present mode on projector, Leanback navigation

### Phase 9 — Future Integrations
64. **Scribe** — meeting transcription with speaker diarization (LiveKit + SpeechBrain + Faster-whisper)
65. **Array mic support** — vocal fingerprint enrollment, per-user attribution
66. **Figma integration** — design token sync, frame import to Canvas
67. **Vercel / Supabase deploy adapters** — extend Deploy feature
68. **GitLab integration** — push, PR, merge from within Codevv
69. **Decision Log** — append-only structured debate/decision capture
70. **Conflict Radar** — file activity heatmap across team members
71. **Native Google TV app** — dedicated projector app with cast protocol, standby screen, voice commands

---

## 24. Database Migrations Needed

```
# Phase 0 — Organizations
alembic revision --autogenerate -m "create organizations table"
alembic revision --autogenerate -m "create org_memberships table"
alembic revision --autogenerate -m "add org_id to projects"
alembic revision --autogenerate -m "add personal_org_id to users"

# Phase 1 — Real-Time & Activity
alembic revision --autogenerate -m "create activities table"

# Phase 2 — Tasks & Collaboration
alembic revision --autogenerate -m "create tasks table"
alembic revision --autogenerate -m "create comments table"
alembic revision --autogenerate -m "create references table"
alembic revision --autogenerate -m "add shared fields to conversations"

# Phase 3 — Foundation
alembic revision --autogenerate -m "add persona to project_members"
alembic revision --autogenerate -m "create files table"
alembic revision --autogenerate -m "create business_rules table"

# Phase 4 — Claude Intelligence
alembic revision --autogenerate -m "add file_id to conversation_messages"

# Phase 5 — Sessions
alembic revision --autogenerate -m "create sessions and session_members tables"
alembic revision --autogenerate -m "add join_code to sessions"

# Phase 6 — Devices & Recall
alembic revision --autogenerate -m "create org_devices table"
alembic revision --autogenerate -m "create recall_pairings table"

# Phase 7 — Compliance
alembic revision --autogenerate -m "add auto_evaluate to compliance_checks"
```

---

## 25. Docker Compose Changes

```yaml
# Add to backend volumes:
backend:
  volumes:
    - ./backend/app:/app/app
    - /var/run/docker.sock:/var/run/docker.sock
    - filedata:/data/files    # NEW — persistent file storage

# Add to volumes:
volumes:
  pgdata:
  redisdata:
  filedata:    # NEW
```

---

## 26. Design Notes

- Dark-first UI unchanged: page `#0a0e14`, card glass blur, teal `#00AFB9`, coral `#F07167`
- Typography unchanged: Satoshi (display), Geist Mono (code)
- Chat fullscreen mode should feel like Claude.ai — conversation list on left, active chat on right
- Non-tech users never see raw JSON, tool IDs, or model identifiers
- Every significant platform action should eventually generate a Recall memory
- Onboarding should feel effortless for non-tech users — no jargon, guided steps, clear CTAs
- Org setup wizard should handle Claude connection as part of the flow, not as an afterthought
- Present mode uses the same dark palette as the app — `#0a0e14` background, high contrast shapes
- iPad draw mode should feel native — Apple Pencil draws, finger pans, no fighting the OS
- Projector standby screen is the org's first impression — keep it clean and branded
- QR codes use teal accent color for branding consistency
- "We remember where we came from so we know where we are going"
