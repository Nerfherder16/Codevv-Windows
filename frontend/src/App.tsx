import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ProjectListPage } from "./pages/ProjectListPage";
import { ProjectOverviewPage } from "./pages/ProjectOverviewPage";
import { CanvasPage } from "./pages/CanvasPage";
import { CanvasEditorPage } from "./pages/CanvasEditorPage";
import { IdeasPage } from "./pages/IdeasPage";
import { IdeaDetailPage } from "./pages/IdeaDetailPage";
import { ScaffoldPage } from "./pages/ScaffoldPage";
import { KnowledgeGraphPage } from "./pages/KnowledgeGraphPage";
import { VideoRoomsPage } from "./pages/VideoRoomsPage";
import { DeployPage } from "./pages/DeployPage";
import { WorkspacesPage } from "./pages/WorkspacesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RulesPage } from "./pages/RulesPage";
import { DependencyMapPage } from "./pages/DependencyMapPage";
import { PipelinePage } from "./pages/PipelinePage";
import { SolanaPage } from "./pages/SolanaPage";
import { AuditPage } from "./pages/AuditPage";
import { CompliancePage } from "./pages/CompliancePage";

export default function App() {
  return (
    <ProtectedRoute>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<AppShell />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="canvas" element={<CanvasPage />} />
          <Route path="canvas/:canvasId" element={<CanvasEditorPage />} />
          <Route path="canvases/:canvasId" element={<CanvasEditorPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="ideas/:ideaId" element={<IdeaDetailPage />} />
          <Route path="scaffold" element={<ScaffoldPage />} />
          <Route path="knowledge" element={<KnowledgeGraphPage />} />
          <Route path="rooms" element={<VideoRoomsPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="deploy" element={<DeployPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="dependencies" element={<DependencyMapPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="solana" element={<SolanaPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="compliance" element={<CompliancePage />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  );
}
