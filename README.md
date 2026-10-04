# StickerStreet

Boutique en ligne de stickers, flyers et cartes de visite — avec **webapp React** et **bot Telegram** reliés à une API commune.

## Structure du projet

```
stickerstreet/
├── api/           # Backend Flask (produits, commandes, statuts)
├── webapp/        # Application React (Vite)
├── bot/           # Bot Telegram Python
├── shared/        # Données partagées (data.json)
└── README.md
```

## Prérequis

- **Node.js** 18+
- **Python** 3.10+
- Un token de bot Telegram (via [@BotFather](https://t.me/BotFather))

---

## 1. Lancer l'API (backend partagé)

L’API sert les produits et commandes à la webapp et au bot.

```bash
cd api
pip install -r requirements.txt
python app.py
```

L’API tourne sur **http://localhost:5000**.

---

## 2. Lancer la webapp

```bash
cd webapp
npm install
npm run dev
```

La webapp est sur **http://localhost:5173** et utilise l’API via le proxy Vite.

---

## 3. Lancer le bot Telegram

1. Crée un bot sur Telegram avec [@BotFather](https://t.me/BotFather) et récupère le token.
2. Assure-toi que l’API tourne (étape 1).
3. Lance le bot :

```bash
cd bot
pip install -r requirements.txt
set TELEGRAM_BOT_TOKEN=TON_TOKEN
python bot.py
```

Ou avec un fichier `.env` (optionnel) :

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
STICKERSTREET_API=http://localhost:5000
```

### Commandes du bot

- `/start` — Message de bienvenue
- `/catalog` — Catalogue des produits
- `/order` — Voir le panier et passer commande
- `/orders` — Liste des commandes
- `/support` — Support

---

## Configuration

### API

- Port par défaut : `5000`
- Données : Neon (`DATABASE_URL`, entre guillemets dans `.env`) ou, à défaut, `api/data.json` (hors git)

### Admin webapp

- **Depuis Telegram** : les comptes listés dans `ADMIN_TELEGRAM_ID` (api/.env) sont reconnus automatiquement
  (Profil → « Panel admin »).
- **Depuis un navigateur** : appui long sur le logo (ou 5 taps sur l'avatar du profil), puis saisir `ADMIN_API_KEY`.
  La clé est vérifiée par l'API et gardée uniquement pour l'onglet (sessionStorage).
- ⚠️ Ne jamais mettre `ADMIN_API_KEY` dans `webapp/.env` : toute variable `VITE_*` est copiée dans le JS public.

### Sécurité (résumé)

- Les prix sont recalculés côté API depuis le catalogue ; le client n'envoie que `{id, sz, qty}`.
- Les clients s'authentifient par `initData` Telegram (Mini App) ou le Login Widget → jeton de session signé.
- Commandes, profil et chat ne sont accessibles qu'à leur propriétaire ; le chat est un fil par client.
- Les écritures passent par un verrou (`data_tx`) : pas de commandes perdues avec plusieurs workers gunicorn.

---

## Paiements

- **Mobile Money via [Jèko](https://developer.jeko.africa)** : Wave, Orange Money, MTN, Moov, Djamo.
  La commande est créée en « paiement en attente », le client paie sur la page Jèko, puis le webhook signé
  (`POST /api/webhooks/jeko`, en-tête `Jeko-Signature`) la passe en « payée » et prévient l'admin et le client.
  - Clés : `python3 scripts/set-jeko-keys.py` (saisie masquée, vérifiée auprès de Jèko)
  - Webhook à déclarer dans le Cockpit Jèko : `<PUBLIC_APP_URL>/api/webhooks/jeko`, événement `TRANSACTION_COMPLETED`
  - Tant que les clés ne sont pas configurées, le paiement Mobile Money est masqué dans l'app et le bot.
- **Telegram Stars** (dans la Mini App), montant vérifié par le bot avant paiement.
- **TON** (TON Connect) — à vérifier manuellement on-chain avant confirmation.

L'ancien paiement manuel (QR Wave / lien Djamo + bouton « J'ai payé ») a été retiré.

---

## Technologies

- **API** : Flask, Flask-CORS
- **Webapp** : React 18, Vite
- **Bot** : python-telegram-bot 20+
