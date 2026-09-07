module.exports = {
  apps: [
    {
      name: "whatsapp-saas-api",
      cwd: __dirname,
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
        PORT: 31827,
      },
    },
    {
      name: "whatsapp-saas-worker",
      cwd: __dirname,
      script: "src/webhookWorker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
