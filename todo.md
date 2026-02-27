# Codevv v2 — Build Status

> Full implementation plan is in `buildv2.md`. This file tracks what's done and what's next.
> Last updated: February 27, 2026.

---

## ✅ Completed

### Phase 0 — Organization Layer
- [x] Organization model + OrgMembership (migration applied inline)
- [x] Org routes: create, invite, accept, members
- [x] Invite flow: token-based invites, email matching, auto-activate
- [x] Claude auth mode on org (oauth_per_user / api_key / none)
- [x] Org switcher on dashboard (personal workspace vs business org)
- [x] Project list filtered by current org

### Phase 1 — Real-Time & Team Awareness
- [x] WebSocket event bus (`/ws/events`) — Redis pub/sub + SSE broadcast
- [x] Activity model + feed — logs all project actions
- [x] Project overview redesign — activity feed, my tasks, compliance status
- [x] Sidebar badges (unread counts via event stream)
- [x] EventStreamProvider in main.tsx — app-wide live updates

### Phase 2 — Tasks & Collaboration
- [x] Task model + routes (CRUD, assign, filter, complete)
- [x] Comment model — polymorphic on any entity
- [x] Reference model — cross-entity links
- [x] Shared conversations — team-visible flag, Mine/Team tabs in chat panel

### Phase 3 — Foundation & Types
- [x] Persona field on ProjectMember
- [x] Types refactor — `types/index.ts` split into 23 domain files (barrel re-export preserved)
- [x] File storage layer — ProjectFile model + file_storage.py service
- [x] Documents route retrofitted to use file storage
- [x] Business Rules uplift — structured BusinessRule model in Postgres, versioning, enforcement levels

### Phase 4 — Claude Intelligence
- [x] Write tools: add_canvas_component, update_idea_status, update_compliance_check, create_task, list_tasks, create_document
- [x] Federated search: `_tool_search_everything` + `/projects/{id}/search` route + `SearchModal` (Cmd+K)
- [x] Page-aware system prompt (current route injected via AIChatPanel → context.page)
- [x] Business rules injected into system prompt
- [x] Full-page chat at `/projects/:id/chat` (claude.ai-style layout)

### Phase 5 — Sessions & Canvas Collaboration
- [x] Session model + routes (create, join, end, join codes)
- [x] tldraw + Yjs sync (TLSocketRoom in yjs-server, /connect/:roomId WebSocket)
- [x] Canvas sessions — scoped Yjs rooms
- [x] QR code + join code share modal
- [x] Unauthenticated present mode (viewer tokens)

### Phase 6 — Device Management & Recall Pairing
- [x] RecallPairing model + migration
- [x] Pairing service — register with Recall on startup
- [x] recall.py — pairing token headers, retry with backoff, circuit breaker, Redis read cache
- [x] Startup pairing via lifespan hook
- [x] Embedding cache — Redis-backed 24h TTL for Ollama embeddings

### Phase 7 — Content & Knowledge Uplift
- [x] Knowledge Graph editing — double-click edit, right-click context menu, Add Edge mode, Extract from Conversation
- [x] Documents redesign — two-pane browser/preview, drag-drop upload, MIME-based preview, three-dot menu
- [x] Recall service resilience — circuit breaker (3 failures / 30s recovery), retry with backoff
- [x] Reactive compliance — auto re-evaluate `auto_evaluate=True` checks on canvas component create/delete
- [x] PWA — vite-plugin-pwa, standalone manifest, NetworkFirst API cache, Apple PWA meta tags

### Sections 14, 22, 25 (cross-phase)
- [x] **Section 14** — Global Search: SearchModal.tsx, TopBar Cmd+K, api.search, backend search route
- [x] **Section 22** — Frontend Types Refactor: 23 domain files + barrel index.ts
- [x] **Section 25** — Docker Compose: `filedata:/data/files` volume for persistent file storage

---

## 🔲 Phase 8 — Multi-Platform

> PWA is done (item 59). Remaining:

- [ ] **60. Capacitor iOS + Android** — native shell wrapping the web app
  - Push notifications (FCM / APNs)
  - QR scanner (native camera API)
  - Biometric auth (Face ID / fingerprint)
  - Deep links (`codevv://project/...`)
  - Capacitor config, `capacitor.config.ts`, iOS/Android project init

- [ ] **61. Tauri desktop** — native macOS / Windows / Linux shell
  - System tray icon with quick actions
  - Deep links via custom protocol
  - Native keyboard shortcuts (separate from browser Cmd+K)
  - Native window management (minimize to tray, focus on notification)
  - Auto-updater

- [ ] **62. Responsive polish**
  - Safe area insets (`env(safe-area-inset-*)`) for notched phones
  - Pull-to-refresh on list pages
  - Swipe gestures (sidebar open/close, card dismiss)
  - Mobile canvas — touch-optimized toolbar, pinch-zoom, Apple Pencil support
  - Bottom tab bar on mobile (replaces icon sidebar)
  - Hamburger-free navigation throughout

- [ ] **63. Android TV / Projector build**
  - Present mode optimized for TV (Leanback navigation)
  - D-pad + remote control support
  - Full-bleed canvas display, no chrome
  - Capacitor Android TV build target

---

## 🔲 Phase 9 — Future Integrations

- [ ] **64. Scribe** — meeting transcription
  - LiveKit audio stream → SpeechBrain speaker diarization → Faster-whisper STT
  - Per-user transcript attribution
  - Auto-save transcript to Documents + Recall memory
  - Live caption overlay in video room

- [ ] **65. Array mic support**
  - Vocal fingerprint enrollment per user
  - Per-microphone audio isolation
  - Diarization accuracy improvement for conference room setups

- [ ] **66. Figma integration**
  - Design token sync (Figma Variables → `tokens.json`)
  - Frame import — Figma frames exported as canvas components
  - Code Connect mapping (Figma component ↔ React component)
  - `/ui-init` + `/ui-compose` workflow integration

- [ ] **67. Vercel / Supabase deploy adapters**
  - Deploy feature extended with Vercel and Supabase targets
  - Auto-configure environment variables from Codevv secrets

- [ ] **68. GitLab integration**
  - Push code from Codevv Workspace terminal
  - PR / MR creation from within Codevv
  - GitLab CI status in Pipeline view

- [ ] **69. Decision Log**
  - Append-only structured debate/decision capture
  - Linked to ideas, tasks, canvas components
  - Searchable via global search + Recall

- [ ] **70. Conflict Radar**
  - File activity heatmap across team members
  - Highlights concurrent edits, surface merge risk

- [ ] **71. Native Google TV app**
  - Dedicated projector app (not Capacitor Android TV)
  - Cast protocol for pushing sessions from mobile
  - Standby screen with org branding
  - Voice commands via Google Assistant

---

## 📋 Backlog / Deferred

### Full-Page Chat Plan (approved, partially implemented)
The `vivid-waddling-wren` plan at `~/.claude/plans/` describes a claude.ai-style full-page chat at `/projects/:id/chat`. Core layout and routing is implemented. Remaining refinements:
- Conversation sidebar time grouping (Today / Yesterday / Previous 7 days)
- Rename / delete conversation from sidebar hover state
- Suggestion chips on empty state
- react-markdown + remark-gfm upgrade for code block rendering in chat page
- Model selector pill in chat input area

### Section 23 — Implementation Priority (reference only)
The phased build order is documented in `buildv2.md §23`. All Phase 0–7 items are complete.

### Section 24 — Database Migrations (reference only)
All migrations have been applied inline (via `ALTER TABLE IF NOT EXISTS` in model startup hooks). No Alembic migration files exist — all DDL is idempotent inline SQL in model init.

---

## Notes

- **Server**: CasaOS 192.168.50.19 — Docker Compose stack in `/DATA/AppData/codevv/`
- **Deployment workflow**: Write patch script → SCP to server → SSH execute → git commit on server
- **Frontend**: Vite dev server with volume-mounted `src/` for hot reload (no rebuild needed)
- **Backend**: FastAPI with `--reload` inside Docker, auto-reloads on file change
- **Branch**: `master` (direct commits, no PR workflow for this project)
