/**
 * PM2 – StickerStreet (api + bot + webapp)
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --only stickerstreet-webapp
 */
const stableOpts = {
  max_restarts: 20,
  min_uptime: '10s',
  restart_delay: 4000,
  exp_backoff_restart_delay: 200,
  kill_timeout: 5000,
};

module.exports = {
  apps: [
    {
      ...stableOpts,
      name: 'stickerstreet-api',
      cwd: '/var/www/stickerstreet/api',
      script: 'bash',
      args: "-lc 'set -a; [ -f ./.env ] && . ./.env; set +a; exec python3 -m gunicorn app:app --bind 127.0.0.1:${PORT:-5000} --workers 2 --timeout 60 --graceful-timeout 30'",
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
    },
    {
      ...stableOpts,
      name: 'stickerstreet-bot',
      cwd: '/var/www/stickerstreet/bot',
      script: 'venv/bin/python',
      args: 'bot.py',
      interpreter: 'none',
      env: { /* .env chargé depuis bot/ */ },
    },
    {
      ...stableOpts,
      // Bot équipe « StickerStreet Admin » : sort avec le code 78 si ADMIN_BOT_TOKEN manque (pas de boucle de redémarrage)
      name: 'stickerstreet-admin-bot',
      cwd: '/var/www/stickerstreet/bot',
      script: 'venv/bin/python',
      args: 'admin_bot.py',
      interpreter: 'none',
      stop_exit_codes: [78],
    },
    {
      ...stableOpts,
      name: 'stickerstreet-webapp',
      cwd: '/var/www/stickerstreet/webapp',
      script: 'npx',
    // -y : pas de prompt npx ; -s : SPA (fallback index.html) ;
    // Port unique pour StickerStreet (pas de conflit avec ussd-dashboard:3001)
    args: '-y serve dist -s -l tcp://127.0.0.1:3005 --no-port-switching',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
    },
    {
      ...stableOpts,
    name: 'stickerstreet-ngrok',
    script: 'ngrok',
    // Passe par nginx (:3006) pour servir aussi /api — :3005 ne sert que les fichiers statiques
    args: 'http 3006',
      interpreter: 'none',
      cwd: '/var/www/stickerstreet',
    },
  ],
};
