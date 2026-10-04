export const S = {
  shop: "◈", orders: "☰", chat: "◉", user: "◎", settings: "⚙",
  send: "➤", back: "‹", plus: "+", close: "✕", upload: "⇧", check: "✓",
  lock: "◆", unlock: "◇", phone: "▣", pin: "◈", bell: "△", box: "▢",
  star: "★", diamond: "◆", fire: "●", tag: "◇", clipboard: "☰",
  sun: "🌞", moon: "🌙", heart: "♥", heartEmpty: "♡", cart: "🛒",
};

export const STATUSES = {
  pending: { label: "En attente", color: "#F59E0B", icon: "⏳" },
  confirmed: { label: "Confirmée", color: "#00B894", icon: "✅" },
  production: { label: "En production", color: "#E17055", icon: "🔧" },
  shipped: { label: "Expédiée", color: "#0984E3", icon: "📦" },
  delivered: { label: "Livrée", color: "#00CEC9", icon: "🎉" },
};

/** Opérateurs Mobile Money via Jèko (couleurs indicatives des marques). */
export const JEKO_OPERATOR_STYLE = {
  wave: { color: "#1DC8F2", short: "W" },
  orange: { color: "#FF7900", short: "OM" },
  mtn: { color: "#FFCC00", ink: "#16161B", short: "MTN" },
  moov: { color: "#0058A3", short: "M" },
  djamo: { color: "#16161B", short: "D" },
};

export const PAY_LABELS = { jeko: "Mobile Money", momo: "Mobile Money", wave: "Wave", djamo: "Djamo", ton: "TON", stars: "Stars" };
export const PAYMENT_STATUS = {
  awaiting: { label: "Paiement en attente", color: "#D97E06" },
  paid: { label: "Payée", color: "#0E9F7A" },
  failed: { label: "Paiement échoué", color: "#E03131" },
  review: { label: "Paiement à vérifier", color: "#D97E06" },
};

export const XOF_FMT = (v) => v.toLocaleString("fr-FR") + " F";
