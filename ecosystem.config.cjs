/** PM2 must start from the repo root so `.env` resolves (see `src/utils/paths.ts`). */
const cwd = __dirname;

/** PM2 often inherits a minimal PATH; Docker is usually under /usr/bin. */
const pathEnv = ["/usr/local/bin", "/usr/bin", "/bin", process.env.PATH].filter(Boolean).join(":");

module.exports = {
  apps: [
    {
      name: "versiongate-api",
      cwd,
      script: "src/server.ts",
      interpreter: "bun",
      watch: false,
      env: { NODE_ENV: "production", PATH: pathEnv },
    },
    {
      name: "versiongate-worker",
      cwd,
      script: "src/worker/index.ts",
      interpreter: "bun",
      watch: false,
      /** Fork avoids cluster-mode quirks with Prisma + Bun; single worker is enough. */
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PATH: pathEnv },
    },
  ],
};
