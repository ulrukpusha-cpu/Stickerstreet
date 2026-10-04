import Icon from "./Icon";
import { XOF_FMT, STATUSES } from "../data/constants";

const STEP_LABELS = ["Reçue", "Confirmée", "Impression", "Expédiée", "Livrée"];
const PAY_LABELS = { momo: "Mobile Money", wave: "Wave", djamo: "Djamo", ton: "TON", stars: "Stars" };

function formatDate(o) {
  const d = new Date(o.created_at || o.date);
  if (Number.isNaN(d.getTime())) return o.date || "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function OrdersView({ orders, go }) {
  if (!orders.length) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="package" size={32} /></div>
        <h3>Aucune commande</h3>
        <p>Tes commandes et leur suivi apparaîtront ici.</p>
        <button className="btn btn-ink" onClick={() => go("home")}>Commencer mes achats</button>
      </div>
    );
  }

  const keys = Object.keys(STATUSES);
  return (
    <div>
      <h1 className="page-title">Mes commandes <small>{orders.length}</small></h1>
      <div className="stack">
        {orders.map((o, i) => {
          const st = STATUSES[o.status] || STATUSES.pending;
          const cur = Math.max(0, keys.indexOf(o.status));
          return (
            <article key={o.id} className="card order" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
              <div className="order-head">
                <div>
                  <div className="order-id">{o.id}</div>
                  <div className="order-date">{formatDate(o)}{o.payment_method ? ` · ${PAY_LABELS[o.payment_method] || o.payment_method}` : ""}</div>
                </div>
                <span className="status" style={{ background: `${st.color}1F`, color: st.color }}><i />{st.label}</span>
              </div>
              <div className="order-items">
                {o.items.map((it, j) => (
                  <div key={j} className="order-item">
                    {it.img ? <img src={it.img} alt="" /> : <span className="oi-emoji">{it.emoji}</span>}
                    <span>{it.name} <small>· {it.sz || "—"}</small></span>
                    <small className="num">×{it.qty}</small>
                  </div>
                ))}
              </div>
              <div className="steps" aria-label={`Étape ${cur + 1} sur ${keys.length} : ${st.label}`}>
                {keys.map((k, idx) => <div key={k} style={idx <= cur ? { background: st.color } : undefined} />)}
              </div>
              <div className="steps-labels" aria-hidden="true">
                {STEP_LABELS.map((l, idx) => <span key={l} style={idx === cur ? { color: st.color } : undefined}>{l}</span>)}
              </div>
              <div className="order-foot">
                <span className="muted" style={{ fontSize: 13 }}>{o.items.reduce((s, it) => s + it.qty, 0)} article(s)</span>
                <b className="num">{XOF_FMT(o.totalXof || 0)}</b>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
