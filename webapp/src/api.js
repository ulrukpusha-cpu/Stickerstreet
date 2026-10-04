/** URL de l'API : /api (même nginx que la webapp) ou VITE_API_URL. */
const _apiBase = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const API = _apiBase ? _apiBase : "/api";

/*
 * Auth :
 * - session client : jeton signé renvoyé par /auth/telegram-miniapp ou /auth/telegram (localStorage)
 * - clé admin : saisie par l'admin dans l'app, gardée pour l'onglet uniquement (sessionStorage).
 *   Elle n'est JAMAIS dans le bundle (les variables VITE_* sont publiques).
 */
const SESSION_KEY = "stickerstreet_session";
const ADMIN_KEY = "stickerstreet_admin_key";

function readStore(store, key) {
  try { return store.getItem(key) || ""; } catch { return ""; }
}
function writeStore(store, key, value) {
  try { value ? store.setItem(key, value) : store.removeItem(key); } catch { /* stockage indisponible */ }
}

export const getSessionToken = () => readStore(localStorage, SESSION_KEY);
export const setSessionToken = (token) => writeStore(localStorage, SESSION_KEY, token);
export const getAdminKey = () => readStore(sessionStorage, ADMIN_KEY);
export const setAdminKey = (key) => writeStore(sessionStorage, ADMIN_KEY, key);

function headers(base = {}) {
  const h = { ...base };
  const token = getSessionToken();
  if (token) h.Authorization = `Bearer ${token}`;
  const adminKey = getAdminKey();
  if (adminKey) h["X-Admin-Key"] = adminKey;
  return h;
}

async function request(path, { method = "GET", body, form, errorLabel = "Erreur réseau" } = {}) {
  const init = { method, headers: headers(body !== undefined ? { "Content-Type": "application/json" } : {}) };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (form) init.body = form;
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const e = new Error(err.error || `${errorLabel} (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export const fetchProducts = () => request("/products", { errorLabel: "Erreur chargement produits" });
export const fetchBanners = () => request("/banners", { errorLabel: "Erreur chargement bannières" });
export const fetchMomo = () => request("/momo", { errorLabel: "Erreur chargement paiements" });
export const fetchTonRate = (totalXof) => request(`/rates/ton?total_xof=${encodeURIComponent(totalXof)}`, { errorLabel: "Taux TON indisponible" });

export function uploadBlobImage(file, folder = "uploads") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  return request("/upload/blob", { method: "POST", form: fd, errorLabel: "Erreur upload image" });
}

export const createProduct = (product) => request("/products", { method: "POST", body: product, errorLabel: "Erreur ajout produit" });
export const patchProduct = (id, patch) => request(`/products/${id}`, { method: "PATCH", body: patch, errorLabel: "Erreur modification produit" });
export const removeProduct = (id) => request(`/products/${id}`, { method: "DELETE", errorLabel: "Erreur suppression produit" });
export const createBanner = (payload) => request("/banners", { method: "POST", body: payload, errorLabel: "Erreur ajout bannière" });
export const patchBanner = (id, payload) => request(`/banners/${id}`, { method: "PATCH", body: payload, errorLabel: "Erreur modification bannière" });
export const removeBanner = (id) => request(`/banners/${id}`, { method: "DELETE", errorLabel: "Erreur suppression bannière" });
export const updateOrderStatus = (orderId, status) => request(`/orders/${encodeURIComponent(orderId)}/status`, { method: "PATCH", body: { status }, errorLabel: "Erreur mise à jour statut" });

/** Admin : toutes les commandes. Client connecté : les siennes (filtrées côté serveur). */
export const fetchOrders = () => request("/orders", { errorLabel: "Erreur chargement commandes" });
/** Toujours les commandes du client connecté, même si une clé admin est active. */
export const fetchMyOrders = () => request("/orders?mine=1", { errorLabel: "Erreur chargement commandes" });
export const updateProfile = (fields) => request("/profile", { method: "PATCH", body: fields, errorLabel: "Erreur mise à jour profil" });

/** Seuls id / taille / quantité partent : le serveur recalcule noms et prix depuis le catalogue. */
const toOrderLines = (items) => items.map((i) => ({ id: i.id, sz: i.sz, qty: i.qty }));

function clientFields(profile) {
  const body = {};
  if (profile?.name) body.client_name = profile.name;
  if (profile?.phone) body.client_phone = profile.phone;
  if (profile?.address) body.client_address = profile.address;
  return body;
}

export function createOrder(items, profile = null, payment = {}) {
  return request("/orders", {
    method: "POST",
    body: { items: toOrderLines(items), ...clientFields(profile), ...payment },
    errorLabel: "Erreur création commande",
  });
}

export function createInvoiceStars(items, profile = null) {
  return request("/invoice/stars", {
    method: "POST",
    body: { items: toOrderLines(items), ...clientFields(profile) },
    errorLabel: "Erreur création facture Stars",
  });
}

export const fetchChat = () => request("/chat", { errorLabel: "Erreur chargement chat" });
export const postChatMessage = (text) => request("/chat", { method: "POST", body: { text }, errorLabel: "Erreur envoi message" });

async function openSession(path, body) {
  const res = await request(path, { method: "POST", body, errorLabel: "Erreur connexion Telegram" });
  if (res?.token) setSessionToken(res.token);
  return res;
}

/** Login Widget Telegram (navigateur). */
export const authTelegram = (user) => openSession("/auth/telegram", user);

/** Connexion automatique (Mini App) : initData signé par Telegram, vérifié côté serveur. */
export function authTelegramMiniapp(initData) {
  if (!initData || !String(initData).trim()) return Promise.reject(new Error("Données Telegram manquantes"));
  return openSession("/auth/telegram-miniapp", { init_data: initData });
}

/** Vérifie les droits admin (clé saisie ou session Telegram d'un admin). */
export async function checkAdmin() {
  try {
    const res = await request("/admin/me");
    return !!res?.admin;
  } catch {
    return false;
  }
}
