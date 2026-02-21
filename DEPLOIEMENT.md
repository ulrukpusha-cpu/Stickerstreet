# Checklist déploiement StickerStreet

## Pour que les changements soient visibles en production

### 1. Vercel (webapp)

1. **Pousser le code** : `git add .` puis `git commit` puis `git push`
2. Vercel déploie automatiquement après chaque push
3. **Vérifier** : Dashboard Vercel → ton projet → Settings → Root Directory doit être **`webapp`** (si ton repo contient api/, bot/, webapp/)
4. **Variables d'environnement** (Vercel → Settings → Environment Variables) :
   - `VITE_API_URL` = `https://stickerstreet-production.up.railway.app/api`
   - `VITE_APP_URL` = ton URL Vercel (ex: https://stickerstreet.vercel.app)
   - `VITE_TON_MERCHANT_ADDRESS` = ton adresse wallet TON
   - `VITE_TELEGRAM_BOT_USERNAME` = nom de ton bot (ex: StickerStreetBot)

### 2. Railway (API)

1. **Pousser le code** : les fichiers `api/` et `api/data.json` doivent être dans le repo
2. Railway redéploie au push (si connecté à Git)
3. Ou : Dashboard Railway → Deploy → Redeploy
4. **Vérifier** que `api/data.json` contient :
   - `clients` : []
   - `momo` avec Wave et Djamo (voir ci-dessous)

### 3. Bot (OBLIGATOIRE pour les réponses chat → webapp)

**Important :** Les réponses que tu envoies sur Telegram n’apparaissent dans le chat webapp que si le **bot tourne en permanence**.

- **En local :** garde le terminal ouvert (`python bot.py`) pendant que tu testes
- **En production :** déploie le bot sur Railway (ou un autre hébergeur) pour qu’il tourne 24/7

**Déployer le bot sur Railway :**
1. Crée un nouveau service Railway → **Deploy from GitHub** → choisis ton repo
2. **Root Directory** : `bot`
3. **Variables d’environnement** : `TELEGRAM_BOT_TOKEN`, `STICKERSTREET_API`, `ADMIN_TELEGRAM_ID`, `STICKERSTREET_WEBAPP` (ex: `https://stickerstreet.vercel.app`)
4. **Start Command** : `python bot.py`

**Vérifier ADMIN_TELEGRAM_ID (plusieurs admins possibles) :**
- Envoie `/start` à [@userinfobot](https://t.me/userinfobot) pour obtenir ton ID
- Un seul : `ADMIN_TELEGRAM_ID=6735995998`
- Plusieurs : `ADMIN_TELEGRAM_ID=6735995998,123456789,987654321` (séparés par des virgules)

### 4. Contenu de api/data.json (momo, clients)

Le fichier `api/data.json` doit avoir :

```json
"momo": [
  {"id":"moov","name":"Moov Money","num":"0171476415",...},
  {"id":"orange","name":"Orange Money","num":"0714441413",...},
  {"id":"mtn","name":"MTN MoMo","num":"0564173232",...},
  {"id":"wave","name":"Wave","num":"0709393959","color":"#F7931A","logo":"💸"},
  {"id":"djamo","name":"Djamo","num":"0709393959","color":"#00D26A","logo":"💳"}
],
"clients": []
```

La webapp charge les moyens de paiement via `GET /api/momo`. Si l’API ne répond pas, elle utilise une liste par défaut (constants.js).

### 5. Paiement Telegram Stars (aligné Fragment)

La facture en FCFA est convertie en Stars via le cours TON (comme sur Fragment : ~95 Stars par TON).
- **API** : `TELEGRAM_BOT_TOKEN`, `XOF_PER_USD` (600), `STARS_PER_TON` (95). Cours TON en temps réel (CoinGecko).
- **Secours** (si CoinGecko indisponible) : `TON_FALLBACK_USD` (7), `XOF_PER_STAR_FALLBACK` (600).
- **Webapp** : Panier → Stars → montant en étoiles calculé à l'instant T
- **Bot** : doit tourner pour recevoir les paiements Stars et créer les commandes

### 6. Connexion Telegram (Login Widget)

Pour que « Se connecter avec Telegram » fonctionne sur la webapp :
1. Ouvre [@BotFather](https://t.me/BotFather) sur Telegram
2. Envoie `/setdomain`
3. Choisis ton bot StickerStreet
4. Ajoute le domaine : `stickerstreet.vercel.app` (ou ton domaine Vercel)

Sans ça, le bouton de connexion Telegram ne fonctionnera pas.

### 7. Connexion automatique (Mini App)

Quand l'utilisateur ouvre la webapp **depuis le bot** (bouton « Ouvrir l'app » ou menu 🛒), il est connecté automatiquement — pas besoin du message d'inscription.

**Important :** L'utilisateur doit ouvrir l'app via le **bouton** du bot (pas en copiant le lien dans un navigateur). Le bot affiche :
- Un bouton « 📱 Ouvrir l'app StickerStreet » sous /start
- Un bouton menu 🛒 à côté du champ de saisie (si configuré)
- Un bouton dans /support

### 8. Où voir les fonctionnalités

| Fonctionnalité | Où |
|----------------|-----|
| Paiement TON | Cours en temps réel (CoinGecko), conversion XOF→TON automatique |
| Connexion auto | Ouvre l'app via le bouton du bot Telegram |
| Connexion manuelle | Profil → « Se connecter avec Telegram » (si ouverture via navigateur) |
| Payer en Stars | Ouvre l'app depuis le bot Telegram → Panier → Stars |
| Wave / Djamo | Panier → sélectionner « MoMo » → liste des opérateurs |
| Profil éditable | Onglet Profil → Modifier |
