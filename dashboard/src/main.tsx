import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { Layout } from "@/components/Layout";
import { Overview } from "@/pages/Overview";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { DeployLog } from "@/pages/DeployLog";
import { SystemHealth } from "@/pages/SystemHealth";
import { Projects } from "@/pages/Projects";
import { Settings } from "@/pages/Settings";
import { Setup } from "@/pages/Setup";
import { Activity } from "@/pages/Activity";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/deploy/:jobId" element={<DeployLog />} />
          <Route path="/system" element={<SystemHealth />} />
          <Route path="/server" element={<Navigate to="/system" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
