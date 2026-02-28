# Déploiement webapp sur VPS (PM2 + ngrok)

Pour que **paiements** (Stars, TON, MoMo) et **chat** fonctionnent, la webapp doit joindre l’API sur Railway. En local ou sur Vercel, le proxy gère `/api`. Sur le VPS (fichiers statiques), il n’y a pas de proxy : il faut définir l’URL complète de l’API.

## Variables obligatoires au build (VPS)

Dans `webapp/.env` (ou `.env.production`) **avant** `npm run build` :

```env
# URL complète de l’API Railway (obligatoire sur VPS)
VITE_API_URL=https://stickerstreet-production.up.railway.app/api

# URL de la webapp (ngrok ou ton domaine) — pour TON Connect
VITE_APP_URL=https://ton-url.ngrok.io

# Optionnel mais recommandé
VITE_TON_MERCHANT_ADDRESS=UQ...
VITE_TELEGRAM_BOT_USERNAME=StickerStreetBot
```

Puis :

```bash
cd webapp
npm run build
pm2 restart stickerstreet-webapp
```

## CORS (Railway)

Sur Railway, dans les variables du projet **API**, ajoute l’origine de ta webapp :

```env
ALLOWED_ORIGINS=https://unjogging-socorro-lobularly.ngrok-free.dev
```

(Si tu as plusieurs URLs plus tard, sépare par des virgules.)

Sans ça, le navigateur peut bloquer les appels à l’API (paiements, chat, MoMo).
