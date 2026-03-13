module.exports = {
  apps: [
    {
      name: "versiongate-engine",
      script: "src/server.ts",
      interpreter: "bun",
      cwd: "/opt/VersionGate",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "/var/log/versiongate/out.log",
      error_file: "/var/log/versiongate/error.log",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
