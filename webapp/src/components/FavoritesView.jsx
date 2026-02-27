import { S, XOF_FMT } from "../data/constants";

export default function FavoritesView({ products, favorites, toggleFavorite, onProductSelect, go, title, card, t }) {
  const favProducts = products.filter((p) => favorites.includes(p.id));

  return (
    <div style={{ animation: "fadeUp 0.3s ease", paddingBottom: 24 }}>
      <h2 style={title}>♥ Coups de cœur</h2>
      {favProducts.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: 16 }}>
          <span style={{ fontSize: 56, opacity: 0.5 }}>💔</span>
          <p style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, margin: 0 }}>Aucun favori pour le moment</p>
          <button onClick={() => go("home")} style={{ padding: "12px 24px", borderRadius: 14, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>
            Aller au shop
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {favProducts.map((p, i) => (
            <div key={p.id} onClick={() => onProductSelect(p)} style={{ ...card, overflow: "hidden", cursor: "pointer", animation: `fadeUp 0.35s ease ${i * 0.05}s both`, position: "relative" }}>
              <div style={{ background: p.grad || t.bgAlt, height: 120, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                {p.img ? (
                  <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 40, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.15))" }}>{p.emoji}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                  style={{ position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", color: "#FF3B5C", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  aria-label="Retirer des favoris"
                >
                  {S.heart}
                </button>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</h3>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 700 }}>{XOF_FMT(p.xof)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
