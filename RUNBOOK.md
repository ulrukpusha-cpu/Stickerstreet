# StickerStreet - Runbook rapide

## Vérifier l'état global

```bash
cd /var/www/stickerstreet
./scripts/health-check.sh
```

## Relancer proprement tous les services

```bash
cd /var/www/stickerstreet
pm2 reload ecosystem.config.cjs --update-env
pm2 status
```

## Si un service ne démarre pas

```bash
pm2 logs stickerstreet-api --lines 80 --nostream
pm2 logs stickerstreet-webapp --lines 80 --nostream
pm2 logs stickerstreet-bot --lines 80 --nostream
```

## Endpoints utiles

- API locale: `http://127.0.0.1:5000/api/health`
- Webapp locale: `http://127.0.0.1:3005`
- ngrok (démos) : `http://127.0.0.1:4040/api/tunnels` — le tunnel pointe sur nginx :3006 (webapp + /api)
- Stockage actif : champ `storage` de `/api/health` (`neon` ou `file`)
