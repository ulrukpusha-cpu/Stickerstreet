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

export const MOMO = [
  { id: "wave", name: "Wave", num: "0709393959", color: "#F7931A", logo: "💸", qrImage: "/wave-qr.png" },
  { id: "djamo", name: "Djamo", num: "0709393959", color: "#00D26A", logo: "💳", link: "https://pay.djamo.com/pkbyg" },
];

export const XOF_FMT = (v) => v.toLocaleString("fr-FR") + " F";
