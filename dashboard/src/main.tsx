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
import { Integrations } from "@/pages/Integrations";
import { Setup } from "@/pages/Setup";
import { Activity } from "@/pages/Activity";
import { Login } from "@/pages/Login";
import { Settings } from "@/pages/Settings";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/deploy/:jobId" element={<DeployLog />} />
          <Route path="/system" element={<SystemHealth />} />
          <Route path="/server" element={<Navigate to="/system" replace />} />
          <Route path="/dashboard/integrations" element={<Integrations />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
