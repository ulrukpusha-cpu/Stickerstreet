# Résumé des variables d'environnement – StickerStreet

## webapp/ (VPS)

| Variable | Obligatoire | Exemple | Rôle |
|----------|-------------|---------|------|
| `VITE_API_URL` | Oui | `https://xxx.up.railway.app/api` | URL de l’API Railway (**avec** `https://` et `/api`) |
| `VITE_APP_URL` | Pour TON | `https://unjogging-socorro-lobularly.ngrok-free.dev` | URL publique de la webapp (TON Connect) |
| `VITE_TON_MERCHANT_ADDRESS` | Pour TON | `UQBxxxx...` | Adresse wallet TON pour recevoir les paiements |
| `VITE_TELEGRAM_BOT_USERNAME` | Pour profil | `StickerStreetBot` | Username du bot (lien inscription via Telegram) |

## bot/ (local ou hébergement)

| Variable | Obligatoire | Exemple | Rôle |
|----------|-------------|---------|------|
| `TELEGRAM_BOT_TOKEN` | Oui | `123456:ABC-xxx` | Token du bot (BotFather) |
| `STICKERSTREET_API` | Oui en prod | `https://xxx.up.railway.app` | URL de l’API Railway (**avec** `https://`) |

## api/ (Railway)

| Variable | Obligatoire pour chat | Description |
|----------|------------------------|-------------|
| `TELEGRAM_BOT_TOKEN` | Oui (chat + Stars) | Token du bot (chat, paiement Telegram Stars) |
| `ADMIN_TELEGRAM_ID` | Oui (chat) | ID Telegram de l'admin (pour recevoir les messages clients) |

Railway définit automatiquement `PORT`. Optionnel : `FLASK_DEBUG` = `true`

## bot/ – variable supplémentaire pour le chat

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `ADMIN_TELEGRAM_ID` | Pour répondre | Ton ID Telegram (réponses aux clients → chat webapp) |

---

## Paiements Mobile Money / Wave / Djamo (Côte d'Ivoire)

Les numéros de paiement sont définis dans **`api/data.json`** (clé `momo`).  
Remplace `07XXXXXXXX` par tes vrais numéros :

| Service | Format CI | Exemple |
|---------|-----------|---------|
| Moov Money | 01XXXXXXXX | 0171476415 |
| Orange Money | 07XXXXXXXX | 0714441413 |
| MTN MoMo | 05XXXXXXXX | 0564173232 |
| Wave | 07XXXXXXXX | ton numéro Wave |
| Djamo | 07XXXXXXXX ou ID | numéro ou compte Djamo |

Après modification, redéploie l’API sur Railway pour que les changements soient pris en compte.

---

## Redémarrage / redéploiement

| Service | Action après modif du code |
|---------|----------------------------|
| **API** (Railway) | Redéployer (push Git ou bouton Redeploy) |
| **Bot** (local) | Redémarrer : `python bot.py` |
| **Webapp** (VPS) | Rebuild : `npm run build` puis `pm2 restart stickerstreet-webapp` |
