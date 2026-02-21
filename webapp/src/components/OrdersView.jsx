import { S, XOF_FMT, STATUSES } from "../data/constants";

export default function OrdersView({ orders, title, card, t }) {
  if (!orders.length)
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px", gap: 14 }}>
        <span style={{ fontSize: 72, color: "#D1D5DB" }}>{S.orders}</span>
        <h3 style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>Aucune commande</h3>
        <p style={{ color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>Tes commandes apparaîtront ici</p>
      </div>
    );

  const stKeys = Object.keys(STATUSES);
  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <h2 style={title}>Mes commandes</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {orders.map((o, i) => {
          const st = STATUSES[o.status];
          const cur = stKeys.indexOf(o.status);
          return (
            <div key={o.id} style={{ ...card, borderRadius: 20, padding: 18, animation: `fadeUp 0.4s ease ${i * 0.08}s both` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{o.id}</div>
                  <div style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 13, marginTop: 2 }}>{o.date}</div>
                </div>
                <div style={{ background: st.color + "18", color: st.color, padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{st.icon} {st.label}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {o.items.map((it, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>
                    {it.img ? <img src={it.img} alt={it.name} style={{ width: 20, height: 20, borderRadius: 5, objectFit: "cover" }} /> : <span>{it.emoji}</span>}
                    <span style={{ fontWeight: 500 }}>{it.name} × {it.qty}</span>
                    <span style={{ color: t.textMuted, fontSize: 12 }}>{it.sz || it.selectedSize}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 3, flex: 1 }}>{stKeys.map((k, idx) => <div key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: idx <= cur ? st.color : t.cardBorder, transition: "all 0.3s" }} />)}</div>
                <span style={{ fontWeight: 800, fontSize: 17, marginLeft: 16 }}>{XOF_FMT(o.totalXof || o.total * 600)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
