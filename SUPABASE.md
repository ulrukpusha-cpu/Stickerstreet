# Intégration Supabase – StickerStreet

## 1. Créer un projet Supabase

1. Va sur [supabase.com](https://supabase.com) et connecte-toi
2. **New Project** → choisis un nom, une région, un mot de passe pour la base
3. Une fois le projet créé, va dans **Project Settings** → **API** pour récupérer :
   - **Project URL** (ex. `https://xxxxx.supabase.co`)
   - **anon public** key

## 2. Configurer la webapp

Ajoute ces variables dans `.env` et dans **Vercel** (Settings → Environment Variables) :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

## 3. Tables suggérées (optionnel)

Pour migrer les données vers Supabase, crée ces tables dans l’éditeur SQL :

```sql
-- Produits
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cat TEXT,
  price DECIMAL(10,2),
  ton DECIMAL(10,2),
  xof INTEGER,
  emoji TEXT,
  img TEXT,
  grad TEXT,
  sizes JSONB,
  desc TEXT,
  custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Commandes
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  items JSONB NOT NULL,
  total DECIMAL(10,2),
  total_xof INTEGER,
  status TEXT DEFAULT 'pending',
  date DATE,
  telegram_user_id BIGINT,
  client_name TEXT,
  client_phone TEXT,
  client_address TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Clients
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  telegram_user_id BIGINT UNIQUE,
  telegram_username TEXT,
  name TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages chat
CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  "from" TEXT NOT NULL,
  text TEXT NOT NULL,
  time TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mobile Money
CREATE TABLE momo (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  num TEXT,
  color TEXT,
  logo TEXT,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 4. Utilisation du client

```javascript
import { supabase, isSupabaseConfigured } from "./lib/supabase";

if (isSupabaseConfigured()) {
  const { data } = await supabase.from("products").select("*");
}
```

## 5. Prochaines étapes possibles

- Migrer l’API Flask pour lire/écrire dans Supabase au lieu de `data.json`
- Utiliser Supabase Auth pour la connexion
- Utiliser Supabase Realtime pour le chat temps réel
