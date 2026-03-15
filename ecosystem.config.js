// PM2 Ecosystem Configuration for Multi-Agent UI_K

module.exports = {
  apps: [
    {
      name: 'uik-server',
      script: 'server/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-k-vault',
      script: 'agents/vault/index.js',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
