import { useState, useEffect } from "react";
import { useTonConnectUI, useTonAddress, TonConnectButton } from "@tonconnect/ui-react";
import Icon from "./Icon";
import { XOF_FMT, JEKO_OPERATOR_STYLE } from "../data/constants";
import { createInvoiceStars, fetchTonRate } from "../api";

const TON_MERCHANT = import.meta.env.VITE_TON_MERCHANT_ADDRESS || "";
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "StickerStreetBot";

export default function CartView({ cart, totalXof, pay, setPay, rm, updQty, checkout, profile, hasSession, onStarsPaid, payJeko, jeko, go, notify }) {
  const [operator, setOperator] = useState("wave");
  const [jekoLoading, setJekoLoading] = useState(false);
  const [starsLoading, setStarsLoading] = useState(false);
  const [tonRate, setTonRate] = useState(null);
  const [tonRateError, setTonRateError] = useState("");
  const [tonLoading, setTonLoading] = useState(false);
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress();
  const tg = typeof window !== "undefined" && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
  const starsAvailable = !!tg?.openInvoice && hasSession;

  const methods = [
    jeko?.enabled && { id: "jeko", label: "MoMo", icon: "phone" },
    { id: "stars", label: "Stars", icon: "star" },
    { id: "ton", label: "TON", icon: "ton" },
  ].filter(Boolean);
  // Si le moyen mémorisé n'est plus proposé (ex. Jèko pas encore configuré), on prend le premier disponible
  const method = methods.some((m) => m.id === pay) ? pay : methods[0].id;

  useEffect(() => {
    if (method !== "ton" || !totalXof) {
      setTonRate(null);
      setTonRateError("");
      return;
    }
    fetchTonRate(totalXof)
      .then((r) => { setTonRate(r); setTonRateError(""); })
      .catch((e) => setTonRateError(e.message || "Cours indisponible"));
  }, [method, totalXof]);

  if (!cart.length) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="bag" size={32} /></div>
        <h3>Ton panier est vide</h3>
        <p>Choisis un sticker, un flyer ou des cartes de visite pour commencer.</p>
        <button className="btn btn-ink" onClick={() => go("home")}>Voir le catalogue</button>
      </div>
    );
  }

  const count = cart.reduce((s, i) => s + i.qty, 0);
  const missingContact = !profile?.name || !profile?.phone;
  const operators = jeko?.operators || [];
  const opLabel = operators.find((o) => o.id === operator)?.label || "Mobile Money";

  const startJeko = async () => {
    setJekoLoading(true);
    try {
      await payJeko(operator); // redirige vers la page de paiement Jèko
    } catch (err) {
      notify(err.message || "Paiement indisponible, réessaie");
      setJekoLoading(false);
    }
  };

  const payStars = async () => {
    setStarsLoading(true);
    try {
      const { url } = await createInvoiceStars(cart, profile);
      const onClosed = (e) => {
        tg.offEvent?.("invoiceClosed", onClosed);
        setStarsLoading(false);
        if (e?.status === "paid") onStarsPaid();
        else if (e?.status === "failed") notify("Paiement Stars échoué");
      };
      tg.onEvent("invoiceClosed", onClosed);
      tg.openInvoice(url);
    } catch (err) {
      setStarsLoading(false);
      notify(err.message || "Erreur facture Stars");
    }
  };

  const payTon = async () => {
    if (!tonRate?.amount_ton || !TON_MERCHANT) return;
    setTonLoading(true);
    try {
      const amountNano = BigInt(Math.round(tonRate.amount_ton * 1e9));
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: TON_MERCHANT, amount: amountNano.toString() }],
      });
      await checkout({ payment_method: "ton", ton_tx_boc: result?.boc });
    } catch (err) {
      if (!String(err).toLowerCase().includes("declined")) notify("Transaction TON non envoyée");
    } finally {
      setTonLoading(false);
    }
  };

  let cta;
  if (method === "jeko") {
    cta = (
      <button className="btn btn-primary btn-block" onClick={startJeko} disabled={jekoLoading}>
        <Icon name="lock" size={17} />
        {jekoLoading ? "Redirection vers le paiement…" : `Payer ${XOF_FMT(totalXof)} avec ${opLabel}`}
      </button>
    );
  } else if (method === "stars") {
    cta = starsAvailable
      ? <button className="btn btn-primary btn-block" onClick={payStars} disabled={starsLoading}><Icon name="star" size={18} fill strokeWidth={0} />{starsLoading ? "Ouverture du paiement…" : `Payer ${XOF_FMT(totalXof)} en Stars`}</button>
      : <a className="btn btn-telegram btn-block" href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer"><Icon name="telegram" size={18} />Ouvrir dans Telegram</a>;
  } else {
    cta = !tonAddress
      ? <div style={{ display: "flex", justifyContent: "center" }}><TonConnectButton /></div>
      : <button className="btn btn-ton btn-block" onClick={payTon} disabled={tonLoading || !tonRate?.amount_ton || !TON_MERCHANT}>
          <Icon name="ton" size={18} />{tonLoading ? "Envoi en cours…" : tonRate ? `Payer ≈ ${tonRate.amount_ton.toFixed(3)} TON` : "Calcul du cours…"}
        </button>;
  }

  return (
    <div>
      <h1 className="page-title">Panier <small>{count} article{count > 1 ? "s" : ""}</small></h1>

      <div className="cart-list">
        {cart.map((item, i) => (
          <div key={`${item.id}-${item.sz}`} className="card cart-item">
            <div className="cart-thumb" style={!item.img && item.grad ? { background: item.grad } : undefined}>
              {item.img ? <img src={item.img} alt="" /> : <span>{item.emoji}</span>}
            </div>
            <div className="cart-info">
              <div className="cart-name">{item.name}</div>
              <div className="cart-meta">{[item.sz, item.dsgn && "Design perso"].filter(Boolean).join(" · ")}</div>
              <div className="qty">
                <button onClick={() => updQty(i, item.qty - 1)} disabled={item.qty <= 1} aria-label="Moins"><Icon name="minus" size={15} /></button>
                <span className="num">{item.qty}</span>
                <button onClick={() => updQty(i, item.qty + 1)} aria-label="Plus"><Icon name="plus" size={15} /></button>
              </div>
            </div>
            <div className="cart-side">
              <button className="cart-remove" onClick={() => rm(i)} aria-label={`Retirer ${item.name}`}><Icon name="close" size={17} /></button>
              <span className="cart-line-total num">{XOF_FMT(item.xof * item.qty)}</span>
            </div>
          </div>
        ))}
      </div>

      {missingContact && (
        <div className="notice" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="notice-title">Coordonnées de livraison</div>
            Ajoute ton nom et ton téléphone pour qu'on puisse te livrer.
          </div>
          <button className="btn btn-sm btn-ink" onClick={() => go("profil")}>Compléter</button>
        </div>
      )}

      <div className="section-head"><h2>Paiement</h2></div>
      {methods.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Moyen de paiement">
          {methods.map((m) => (
            <button key={m.id} role="tab" aria-selected={method === m.id} className={method === m.id ? "is-active" : ""} onClick={() => setPay(m.id)}>
              <Icon name={m.icon} size={16} fill={m.id === "stars" && method === m.id} strokeWidth={m.id === "stars" && method === m.id ? 0 : 2} /> {m.label}
            </button>
          ))}
        </div>
      )}

      {method === "jeko" && (
        <div className="card pay-panel">
          <div className="op-grid" role="radiogroup" aria-label="Opérateur">
            {operators.map((op) => {
              const st = JEKO_OPERATOR_STYLE[op.id] || {};
              return (
                <button key={op.id} role="radio" aria-checked={operator === op.id} className={`op${operator === op.id ? " is-active" : ""}`} onClick={() => setOperator(op.id)} style={operator === op.id ? { borderColor: st.color } : undefined}>
                  <span className="op-logo" style={{ background: st.color, color: st.ink || "#fff" }}>{st.short || op.label[0]}</span>
                  <span className="op-name">{op.label}</span>
                </button>
              );
            })}
          </div>
          <div className="pay-secure">
            <Icon name="lock" size={15} />
            <span>Paiement sécurisé par <b>Jèko</b> : tu valides sur la page {opLabel}, puis tu reviens ici automatiquement.</span>
          </div>
        </div>
      )}

      {method === "stars" && (
        <div className="card pay-panel">
          <div className="pay-head">
            <div className="pay-head-icon" style={{ background: "rgba(245,184,0,0.14)", color: "var(--star)" }}><Icon name="star" size={22} fill strokeWidth={0} /></div>
            <div><b>Telegram Stars</b><span>Montant converti en Stars au cours du moment, paiement instantané.</span></div>
          </div>
          {!starsAvailable && (
            <div className="notice">
              <div className="notice-title">Disponible dans l'app Telegram</div>
              Ouvre le bot <strong>@{BOT_USERNAME}</strong> puis le bouton « Ouvrir l'app » pour payer en Stars.
            </div>
          )}
        </div>
      )}

      {method === "ton" && (
        <div className="card pay-panel">
          <div className="pay-head">
            <div className="pay-head-icon" style={{ background: "rgba(0,152,234,0.12)", color: "var(--ton)" }}><Icon name="ton" size={22} /></div>
            <div><b>Toncoin</b><span>{tonRate ? <>≈ <b className="num" style={{ display: "inline" }}>{tonRate.amount_ton.toFixed(4)} TON</b> · 1 TON ≈ {tonRate.ton_usd} $</> : tonRateError || "Calcul du cours en cours…"}</span></div>
          </div>
          {tonAddress && <div className="muted" style={{ fontSize: 13 }}>Wallet connecté · {tonAddress.slice(0, 6)}…{tonAddress.slice(-4)}</div>}
          {!TON_MERCHANT && <div className="notice"><div className="notice-title">Paiement TON indisponible</div>L'adresse du wallet marchand n'est pas configurée.</div>}
        </div>
      )}

      <div className="card summary">
        <div className="summary-row"><span>Sous-total</span><span className="num">{XOF_FMT(totalXof)}</span></div>
        <div className="summary-row"><span>Livraison</span><span>Confirmée par le support</span></div>
        <div className="summary-total"><span>Total</span><b className="num">{XOF_FMT(totalXof)}</b></div>
        {cta}
      </div>
    </div>
  );
}
