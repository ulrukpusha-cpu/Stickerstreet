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
- Données : `shared/data.json` (produits, commandes, statuts, MoMo)

### Admin webapp

- Code PIN par défaut : **1234**
- Activation : maintenir 2 secondes sur le logo "STICKERSTREET" dans le header

---

## Paiements

- Stars (TikTok)
- TON
- Mobile Money (Moov, Orange, MTN) — numéros configurables dans `shared/data.json`

---

## Technologies

- **API** : Flask, Flask-CORS
- **Webapp** : React 18, Vite
- **Bot** : python-telegram-bot 20+
