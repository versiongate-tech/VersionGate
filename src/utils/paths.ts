import { fileURLToPath } from "url";
import { join } from "path";

export const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
export const envFilePath = join(projectRoot, ".env");
export const dashboardOutDir = join(projectRoot, "dashboard", "out");
