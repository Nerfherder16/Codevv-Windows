<p align="center">
  <img src="CodevvLogo.png" alt="Codevv" width="600" />
</p>

<p align="center">
  <strong>A collaborative software design hub where minds gather and create.</strong>
</p>

---

## Stack

- **Backend:** FastAPI + SQLite (async via aiosqlite)
- **Frontend:** React 19 + TypeScript + Tailwind v4
- **AI:** Claude (OAuth PKCE or API key) with streaming chat and project-aware tools
- **Knowledge:** Recall integration for semantic memory per project
- **Video:** LiveKit for real-time video rooms
- **Workspaces:** code-server integration
- **Packaging:** Single-binary desktop app via PyInstaller

## Getting Started

\`\`\`bash
# Backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run build   # builds into app/static/
\`\`\`

## License

Private
