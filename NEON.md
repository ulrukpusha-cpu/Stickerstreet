# Base de données Neon – StickerStreet

Neon (Postgres serverless) remplace le fichier JSON et peut remplacer Supabase pour le stockage des données de l’API.

## 1. Créer un projet Neon

1. Va sur [neon.tech](https://neon.tech) et crée un compte.
2. **New Project** → nom, région, puis **Create**.
3. Dans le dashboard, ouvre l’onglet **Connection** et copie la **connection string** (format `postgresql://user:password@host/dbname?sslmode=require`).

## 2. Configurer l’API (Railway)

Dans les variables d’environnement de ton service API sur Railway, ajoute :

| Variable        | Valeur                                      |
|-----------------|---------------------------------------------|
| `DATABASE_URL`  | La connection string Neon (avec `?sslmode=require` si absent) |

Dès que `DATABASE_URL` est défini, l’API utilise Neon au lieu du fichier `data.json`. Sans `DATABASE_URL`, l’API continue d’utiliser le fichier (comportement actuel).

## 3. Schéma (optionnel)

Le module `api/db.py` crée automatiquement la table `kv_store` au premier lancement. Pour initialiser à la main ou réinitialiser, tu peux exécuter dans le **SQL Editor** Neon le fichier `api/neon_schema.sql`.

## 4. Migration des données JSON → Neon

Si tu avais des données dans `data.json` ou `shared/data.json` :

1. Lance l’API une fois **sans** `DATABASE_URL` pour avoir le fichier à jour.
2. Option 1 : exécuter un script qui lit le JSON et fait un `INSERT` / `UPDATE` dans `kv_store` (clé `data`, valeur = ton JSON).
3. Option 2 : définir `DATABASE_URL`, lancer l’API (table créée vide), puis importer les produits/commandes via l’admin ou un script.

## 5. Webapp

La webapp ne se connecte pas à Neon : elle appelle uniquement l’API (Railway). Aucune variable Neon n’est nécessaire dans le `.env` de la webapp. Les anciennes variables Supabase (`VITE_SUPABASE_*`) peuvent rester commentées ou être supprimées.

## Résumé

| Où        | Variable       | Rôle |
|----------|----------------|------|
| **API** (Railway) | `DATABASE_URL` | Connection string Neon ; si présente, stockage en Postgres au lieu de JSON |
| **Webapp**       | —              | Aucune config Neon ; tout passe par l’API |
