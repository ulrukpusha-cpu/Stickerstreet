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
  description TEXT,
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
