-- Schéma Neon (Postgres) pour StickerStreet
-- À exécuter dans le SQL Editor du dashboard Neon : https://console.neon.tech

-- Une seule table pour stocker le blob JSON (compatible avec l'API actuelle)
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'
);

-- Données initiales (même structure que data.json)
INSERT INTO kv_store (key, value) VALUES (
  'data',
  '{
    "products": [],
    "orders": [],
    "statuses": {
      "pending": {"label": "En attente", "color": "#F59E0B", "icon": "⏳"},
      "confirmed": {"label": "Confirmée", "color": "#00B894", "icon": "✅"},
      "production": {"label": "En production", "color": "#E17055", "icon": "🔧"},
      "shipped": {"label": "Expédiée", "color": "#0984E3", "icon": "📦"},
      "delivered": {"label": "Livrée", "color": "#00CEC9", "icon": "🎉"}
    },
    "momo": [],
    "clients": [],
    "chat": [],
    "banners": [],
    "invoices": [],
    "pending_invoices": {}
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
