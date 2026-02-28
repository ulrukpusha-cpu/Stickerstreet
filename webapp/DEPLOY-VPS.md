# Déploiement webapp sur VPS (PM2 + ngrok)

Pour que **paiements** (Stars, TON, MoMo) et **chat** fonctionnent, la webapp doit joindre l’API sur Railway. En local ou sur Vercel, le proxy gère `/api`. Sur le VPS (fichiers statiques), il n’y a pas de proxy : il faut définir l’URL complète de l’API.

## Variables obligatoires au build (VPS)

Dans `webapp/.env` (ou `.env.production`) **avant** `npm run build` :

```env
# URL complète de l’API Railway (obligatoire sur VPS)
VITE_API_URL=https://stickerstreet-production.up.railway.app/api

# URL de la webapp (ngrok ou ton domaine) — pour TON Connect
VITE_APP_URL=https://unjogging-socorro-lobularly.ngrok-free.dev

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

(Si tu as plusieurs URLs plus tard, sépare par des virgules. **Sans slash final** : `https://ton-domaine.ngrok-free.dev` pas `.../`.)

Sans ça, le navigateur peut bloquer les appels à l’API (paiements, chat, MoMo).

## Vérifier que le .env n'est pas coupé

Sur le VPS, les valeurs doivent être **complètes**. Ouvre `webapp/.env` et vérifie :

- `VITE_API_URL` = **exactement** : `https://stickerstreet-production.up.railway.app/api` (avec `/api` à la fin).
- `VITE_APP_URL` = **exactement** : `https://unjogging-socorro-lobularly.ngrok-free.dev` (sans slash à la fin).

Si tu vois par exemple `VITE_API_URL=https://stickerstreet` ou `VITE_APP_URL=https://unjogging-soc` (coupé), corrige et refais un build.

**Vérifier que le build a bien pris l'API Railway** (sur le VPS, dans `webapp`) :

```bash
grep -r "stickerstreet-production.up.railway.app" dist/ || echo "ERREUR: URL Railway absente - refais npm run build avec le bon .env"
```

Si tu vois "ERREUR: URL Railway absente", corrige le `.env`, refais `npm run build` puis `pm2 restart stickerstreet-webapp`.

## Si ça ne marche toujours pas

1. **Sur Railway** : vérifie que `ALLOWED_ORIGINS` n’a **pas** de slash à la fin (`https://unjogging-socorro-lobularly.ngrok-free.dev` pas `.../`). Redéploie l’API après modification.
2. **Sur le VPS** : le build doit être fait **après** avoir créé/modifié `webapp/.env` avec `VITE_API_URL`. Sinon le JS continue d’appeler `/api` (ton VPS) au lieu de Railway. Refais `npm run build` puis `pm2 restart stickerstreet-webapp`.
3. Ouvre les **outils développeur** (F12) → onglet **Réseau** : vérifie que les requêtes partent bien vers `stickerstreet-production.up.railway.app` et pas vers ton URL ngrok.  
4. **Accès via ngrok** : à la première visite, clique sur « Visit Site » si ngrok affiche un avertissement, puis rafraîchis avec Ctrl+F5. Si tu vois des appels vers ton domaine pour `/api/...`, c’est que le build n’a pas pris `VITE_API_URL`.
