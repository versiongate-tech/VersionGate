import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { Layout } from "@/components/Layout";
import { SetupGuard } from "@/components/SetupGuard";
import { Overview } from "@/pages/Overview";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { DeployLog } from "@/pages/DeployLog";
import { Server } from "@/pages/Server";
import { Settings } from "@/pages/Settings";
import { Setup } from "@/pages/Setup";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route element={<SetupGuard />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/deploy/:jobId" element={<DeployLog />} />
            <Route path="/server" element={<Server />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
