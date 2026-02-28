/** URL de l'API : VITE_API_URL en prod (VPS) pour pointer vers Railway, sinon /api (dev local) */
const _apiBase = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const API = _apiBase ? _apiBase : "/api";
const ADMIN_API_KEY = (import.meta.env.VITE_ADMIN_API_KEY || "").trim();

function adminHeaders(base = {}) {
  return ADMIN_API_KEY ? { ...base, "X-Admin-Key": ADMIN_API_KEY } : base;
}

export async function fetchProducts() {
  const r = await fetch(`${API}/products`);
  if (!r.ok) throw new Error("Erreur chargement produits");
  return r.json();
}

export async function uploadBlobImage(file, folder = "uploads") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  const r = await fetch(`${API}/upload/blob`, {
    method: "POST",
    headers: adminHeaders(),
    body: fd,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur upload image (${r.status})`);
  }
  return r.json();
}

export async function fetchBanners() {
  const r = await fetch(`${API}/banners`);
  if (!r.ok) throw new Error("Erreur chargement bannières");
  return r.json();
}

export async function createProduct(product) {
  const r = await fetch(`${API}/products`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(product),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ajout produit (${r.status})`);
  }
  return r.json();
}

export async function patchProduct(productId, patch) {
  const r = await fetch(`${API}/products/${productId}`, {
    method: "PATCH",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur modification produit (${r.status})`);
  }
  return r.json();
}

export async function removeProduct(productId) {
  const r = await fetch(`${API}/products/${productId}`, { method: "DELETE", headers: adminHeaders() });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur suppression produit (${r.status})`);
  }
  return r.json();
}

export async function createBanner(payload) {
  const r = await fetch(`${API}/banners`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ajout bannière (${r.status})`);
  }
  return r.json();
}

export async function patchBanner(bannerId, payload) {
  const r = await fetch(`${API}/banners/${bannerId}`, {
    method: "PATCH",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur modification bannière (${r.status})`);
  }
  return r.json();
}

export async function removeBanner(bannerId) {
  const r = await fetch(`${API}/banners/${bannerId}`, { method: "DELETE", headers: adminHeaders() });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur suppression bannière (${r.status})`);
  }
  return r.json();
}

export async function fetchOrders(telegramUserId = null) {
  const url = telegramUserId ? `${API}/orders?telegram_user_id=${telegramUserId}` : `${API}/orders`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Erreur chargement commandes");
  return r.json();
}

export async function createOrder(items, profile = null) {
  const body = { items };
  if (profile?.name) body.client_name = profile.name;
  if (profile?.phone) body.client_phone = profile.phone;
  if (profile?.address) body.client_address = profile.address;
  if (profile?.telegram_user_id) body.telegram_user_id = profile.telegram_user_id;
  const r = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur création commande (${r.status})`);
  }
  return r.json();
}

export async function fetchChat() {
  const r = await fetch(`${API}/chat`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur chargement chat (${r.status})`);
  }
  return r.json();
}

export async function postChatMessage(text) {
  const r = await fetch(`${API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur envoi message (${r.status})`);
  }
  return r.json();
}

export async function authTelegram(user) {
  const r = await fetch(`${API}/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Erreur authentification Telegram");
  }
  return r.json();
}

/** Connexion automatique (Mini App). initData ou, en secours, initDataUnsafeUser. */
export async function authTelegramMiniapp(initData = null, initDataUnsafeUser = null) {
  const body = {};
  if (initData && String(initData).trim()) body.init_data = initData;
  if (initDataUnsafeUser && typeof initDataUnsafeUser === "object" && initDataUnsafeUser.id) body.init_data_unsafe_user = initDataUnsafeUser;
  if (!body.init_data && !body.init_data_unsafe_user) throw new Error("Données Telegram manquantes");
  const r = await fetch(`${API}/auth/telegram-miniapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Erreur connexion Mini App");
  }
  return r.json();
}

export async function createInvoiceStars(items, totalXof, profile = null) {
  const body = { items, total_xof: totalXof };
  if (profile?.name) body.client_name = profile.name;
  if (profile?.phone) body.client_phone = profile.phone;
  if (profile?.address) body.client_address = profile.address;
  const r = await fetch(`${API}/invoice/stars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Erreur création facture Stars (${r.status})`);
  }
  return r.json();
}

export async function fetchMomo() {
  const r = await fetch(`${API}/momo`);
  if (!r.ok) throw new Error("Erreur chargement paiements");
  return r.json();
}

/** Récupère le taux TON (prix en USD) et le montant TON équivalent pour un total XOF. Cours en temps réel via CoinGecko. */
export async function fetchTonRate(totalXof) {
  const r = await fetch(`${API}/rates/ton?total_xof=${totalXof}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Taux TON indisponible");
  }
  return r.json();
}

export async function updateOrderStatus(orderId, status) {
  const r = await fetch(`${API}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status }),
  });
  if (!r.ok) throw new Error("Erreur mise à jour statut");
  return r.json();
}
