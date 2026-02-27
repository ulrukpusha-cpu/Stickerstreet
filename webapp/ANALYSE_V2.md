# Analyse dossier v2 vs projet principal

## v2 (dossier v2/)

- **Stack** : React 19 + TypeScript + Vite 6. Export type "AI Studio" (Gemini).
- **Contenu** : Une seule page `App.tsx` (~950 lignes) avec tout en local (pas d’API, pas de backend).
- **Fonctionnalités** : Shop, Favoris (cœurs), Panier, Commandes démo, Chat mock (réponses aléatoires), Admin local, thème clair/sombre.
- **UI** : Overlay grain, toast, LazyImage, barre de progression des statuts de commande, favoris sur les cartes et la fiche produit.
- **Données** : Produits en dur avec `priceStars`, `priceTon`, `priceXof` ; catégories `business_cards`, `photo_retouch`.

## Projet principal (webapp/)

- **Stack** : React + JSX + Vite, API Flask (Railway), Bot Telegram, Vercel Blob.
- **Fonctionnalités** : Vraie API (produits, bannières, commandes, chat, auth Telegram), Mini App Telegram, admin avec PIN, paiement Stars/TON/MoMo, PDF factures.
- **Catégories** : `stickers`, `flyers`, `cartes`, `photo` (aligné avec l’API).

## Éléments repris de v2 pour la mise à jour

| Élément v2              | Action dans le projet principal                          |
|-------------------------|-----------------------------------------------------------|
| Favoris (cœurs)         | Ajout : state + localStorage, vue Favoris, cœur sur cartes + ProductView |
| Overlay grain           | Ajout : classe CSS + div optionnel                        |
| Icône cœur              | Ajout dans `constants.js`                                |
| Barre progression ordres| Déjà présente dans `OrdersView.jsx`                       |
| Chat / Admin / données  | Non repris (mock ou local) ; on garde l’API et le flux actuel |

## Non fusionné volontairement

- Pas de remplacement de l’API par du state local.
- Pas de Gemini / AI Studio (v2 est un export prototype).
- Catégories conservées : `cartes` et `photo` (cohérence API).
