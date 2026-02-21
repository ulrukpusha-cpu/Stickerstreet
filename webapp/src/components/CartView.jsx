import { useState, useEffect } from "react";
import { useTonConnectUI, useTonAddress, TonConnectButton } from "@tonconnect/ui-react";
import { S, XOF_FMT, MOMO } from "../data/constants";
import { fetchMomo, createInvoiceStars, fetchTonRate } from "../api";

const TON_MERCHANT = import.meta.env.VITE_TON_MERCHANT_ADDRESS || "";

export default function CartView({ cart, totalXof, pay, setPay, rm, updQty, checkout, checkoutLoading = false, title, segBtn, sqBtn, card, t, profile }) {
  const [momoOp, setMomoOp] = useState(null);
  const [copied, setCopied] = useState("");
  const [momoList, setMomoList] = useState(MOMO);
  const [starsLoading, setStarsLoading] = useState(false);
  const [tonRate, setTonRate] = useState(null);
  const [tonRateLoading, setTonRateLoading] = useState(false);
  const [tonRateError, setTonRateError] = useState("");
  const tgWebApp = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
  useEffect(() => {
    fetchMomo().then(setMomoList).catch(() => setMomoList(MOMO));
  }, []);
  useEffect(() => {
    if (pay !== "ton" || !totalXof) {
      setTonRate(null);
      setTonRateError("");
      return;
    }
    setTonRateLoading(true);
    setTonRateError("");
    fetchTonRate(totalXof)
      .then(setTonRate)
      .catch((e) => setTonRateError(e.message || "Cours indisponible"))
      .finally(() => setTonRateLoading(false));
  }, [pay, totalXof]);
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress();
  const [tonLoading, setTonLoading] = useState(false);

  const copyNum = (num, id) => {
    navigator.clipboard?.writeText(num).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  if (!cart.length)
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px", gap: 14, animation: "fadeUp 0.3s ease" }}>
        <span style={{ fontSize: 72, color: "#D1D5DB" }}>{S.cart}</span>
        <h3 style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>Panier vide</h3>
        <p style={{ color: t.textMuted, fontFamily: "'Inter',sans-serif", fontSize: 15 }}>Ajoute des articles pour commencer !</p>
      </div>
    );

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <h2 style={title}>Ton panier <span style={{ color: "#FF3B5C" }}>({cart.length})</span></h2>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, background: t.segBg, borderRadius: 16, padding: 4 }}>
        <button onClick={() => setPay("stars")} style={{ ...segBtn(pay === "stars"), fontSize: 12, padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>{S.star} Stars</button>
        <button onClick={() => setPay("ton")} style={{ ...segBtn(pay === "ton"), fontSize: 12, padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>{S.diamond} TON</button>
        <button onClick={() => setPay("momo")} style={{ ...segBtn(pay === "momo"), fontSize: 12, padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>{S.phone} MoMo</button>
      </div>

      {pay === "stars" && (
        <div style={{ marginBottom: 18, animation: "fadeUp 0.3s ease" }}>
          <div style={{ ...card, borderRadius: 20, padding: "20px 18px", border: "2px solid #FFD70033" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#FFD70015", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>★</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Paiement en Stars</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec }}>Ta facture en FCFA convertie en Stars à l'instant T</div>
              </div>
            </div>
            {!tgWebApp ? (
              <div style={{ marginTop: 12, padding: "14px 16px", background: t.warn, borderRadius: 12, border: `1px solid ${t.warnBorder}` }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#E17055", marginBottom: 8 }}>Paiement Stars uniquement dans l'app Telegram</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textSec, marginBottom: 12 }}>Ouvre le bot Telegram, lance l'app StickerStreet, puis reviens au panier pour payer en Stars.</div>
                <a href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "StickerStreetBot"}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "10px 18px", background: "#0088CC", color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: "'Poppins',sans-serif" }}>Ouvrir le bot Telegram →</a>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: t.textSec, marginTop: 8 }}>Connecte ton wallet TON ci-dessous ou paye avec tes Stars.</div>
            )}
          </div>
        </div>
      )}

      {pay === "ton" && (
        <div style={{ marginBottom: 18, animation: "fadeUp 0.3s ease" }}>
          <div style={{ ...card, borderRadius: 20, padding: "20px 18px", border: "2px solid #0098EA33" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#0098EA15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{S.diamond}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Paiement en TON</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec }}>Cours en temps réel — conversion XOF → TON</div>
              </div>
            </div>
            {tonRateLoading && (
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textMuted, marginBottom: 12 }}>Chargement du cours TON…</div>
            )}
            {tonRateError && (
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#E17055", marginBottom: 12 }}>⚠ {tonRateError}</div>
            )}
            {tonRate && !tonRateError && (
              <div style={{ marginBottom: 12, padding: "12px 14px", background: t.bgAlt, borderRadius: 12 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textSec }}>≈ <strong style={{ color: t.text }}>{tonRate.amount_ton?.toFixed(4)} TON</strong> à payer</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: t.textMuted, marginTop: 4 }}>Cours actuel : 1 TON ≈ {tonRate.ton_usd} $</div>
              </div>
            )}
            {!TON_MERCHANT && (
              <div style={{ marginBottom: 12, padding: "12px 14px", background: t.warn, borderRadius: 12, border: `1px solid ${t.warnBorder}` }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#E17055" }}>Paiement TON indisponible</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec, marginTop: 4 }}>L'adresse wallet marchand n'est pas encore configurée.</div>
              </div>
            )}
            {!tonAddress ? (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <TonConnectButton style={{ margin: 0 }} />
              </div>
            ) : (
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textSec }}>
                ✓ Wallet connecté · {tonAddress.slice(0, 6)}…{tonAddress.slice(-4)}
              </div>
            )}
          </div>
        </div>
      )}

      {pay === "momo" && (
        <div style={{ marginBottom: 18, animation: "fadeUp 0.3s ease" }}>
          <div style={{ ...card, borderRadius: 20, padding: "20px 18px", border: "2px solid #FF660033" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#FF660015", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{S.phone}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Paiement Mobile Money</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec }}>Choisis ton opérateur (Mobile Money, Wave, Djamo) et envoie le montant</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {momoList.map((op) => (
                <div key={op.id} onClick={() => setMomoOp(momoOp === op.id ? null : op.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, cursor: "pointer", transition: "all 0.2s", background: momoOp === op.id ? op.color + "12" : t.bgAlt, border: momoOp === op.id ? `2px solid ${op.color}44` : `2px solid ${t.cardBorder}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 24 }}>{op.logo}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: momoOp === op.id ? op.color : t.text }}>{op.name}</div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textSec, fontWeight: 500 }}>{op.link ? "Lien direct" : op.num}</div>
                    </div>
                  </div>
                  {op.link ? (
                    <a href={op.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, background: op.color + "22", color: op.color, textDecoration: "none", transition: "all 0.2s" }}>Payer →</a>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); copyNum(op.num, op.id); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, background: copied === op.id ? "#00C48C22" : t.bgAlt, color: copied === op.id ? "#00C48C" : t.textSec, transition: "all 0.2s" }}>{copied === op.id ? "✓ Copié" : "Copier"}</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: "14px 16px", background: t.warn, borderRadius: 12, border: `1px solid ${t.warnBorder}` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#E17055", marginBottom: 8 }}>Instructions :</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
                1. Copie le numéro de l'opérateur choisi<br />
                2. Envoie <span style={{ fontWeight: 700, color: t.text }}>{XOF_FMT(totalXof)}</span> au numéro<br />
                3. Clique sur "Confirmer le paiement"<br />
                4. On vérifie et on lance ta commande !
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cart.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, ...card, padding: "14px 16px", borderRadius: 18 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: item.img ? "#f5f5f3" : item.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, overflow: "hidden" }}>
              {item.img ? <img src={item.img} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{item.emoji}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textMuted }}>{item.sz}{item.dsgn ? " · 🎨 Perso" : ""}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button onClick={() => updQty(i, item.qty - 1)} style={sqBtn}>−</button>
              <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
              <button onClick={() => updQty(i, item.qty + 1)} style={sqBtn}>+</button>
            </div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, minWidth: 70, textAlign: "right" }}>
              {XOF_FMT(item.xof * item.qty)}
            </div>
            <button onClick={() => rm(i)} style={{ background: "none", border: "none", color: "#D1D5DB", cursor: "pointer", padding: 4, fontSize: 16 }}>{S.close}</button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, ...card, borderRadius: 22, padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontWeight: 500, fontSize: 14, color: t.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>Total</span>
          <span style={{ fontWeight: 800, fontSize: 26 }}>{XOF_FMT(totalXof)}</span>
        </div>
        <button
          onClick={async () => {
            if (pay === "stars") {
              if (tgWebApp?.openInvoice) {
                setStarsLoading(true);
                try {
                  const items = cart.map((i) => ({ id: i.id, name: i.name, emoji: i.emoji, qty: i.qty, sz: i.sz, price: i.price, ton: i.ton, xof: i.xof }));
                  const { url } = await createInvoiceStars(items, totalXof, profile);
                  const onClosed = (e) => {
                    setStarsLoading(false);
                    if (e?.status === "paid") checkout();
                    tgWebApp?.offEvent?.("invoiceClosed", onClosed);
                  };
                  tgWebApp.onEvent("invoiceClosed", onClosed);
                  tgWebApp.openInvoice(url);
                } catch (err) {
                  setStarsLoading(false);
                  alert(err.message || "Erreur facture Stars");
                }
              } else {
                await checkout();
              }
            } else if (pay === "ton") {
              if (!tonAddress) return;
              if (!tonRate?.amount_ton) {
                alert("Cours TON indisponible. Réessaie dans un instant.");
                return;
              }
              if (!TON_MERCHANT) return;
              setTonLoading(true);
              try {
                const amountTon = tonRate.amount_ton;
                const amountNano = BigInt(Math.round(amountTon * 1e9));
                await tonConnectUI.sendTransaction({
                  validUntil: Math.floor(Date.now() / 1000) + 300,
                  messages: [{ address: TON_MERCHANT, amount: amountNano.toString() }],
                });
                await checkout();
              } catch (err) {
                if (!String(err).includes("declined")) console.error(err);
              } finally {
                setTonLoading(false);
              }
            } else {
              await checkout();
            }
          }}
          disabled={(pay === "ton" && (!tonAddress || tonLoading || !tonRate?.amount_ton || !TON_MERCHANT)) || (pay === "stars" && starsLoading) || (pay === "momo" && checkoutLoading)}
          style={{ width: "100%", padding: 17, background: pay === "ton" ? "linear-gradient(135deg,#0098EA,#0078C8)" : pay === "momo" ? "linear-gradient(135deg,#FF6600,#E85D00)" : "linear-gradient(135deg,#FF3B5C,#E02D50)", color: "#fff", border: "none", borderRadius: 16, fontWeight: 700, fontSize: 16, cursor: (pay === "ton" && (!tonAddress || tonLoading || !tonRate?.amount_ton || !TON_MERCHANT)) || (pay === "stars" && starsLoading) || (pay === "momo" && checkoutLoading) ? "not-allowed" : "pointer", fontFamily: "'Poppins',sans-serif", letterSpacing: 0.5, boxShadow: pay === "ton" ? "0 6px 20px rgba(0,152,234,0.28)" : pay === "momo" ? "0 6px 20px rgba(255,102,0,0.28)" : "0 6px 20px rgba(255,59,92,0.28)", opacity: (pay === "ton" && (!tonAddress || tonLoading || !tonRate?.amount_ton || !TON_MERCHANT)) || (pay === "stars" && starsLoading) || (pay === "momo" && checkoutLoading) ? 0.7 : 1 }}>
          {pay === "ton" ? (tonLoading ? "Envoi en cours…" : tonAddress && tonRate ? `Payer ≈ ${tonRate.amount_ton.toFixed(4)} TON (${XOF_FMT(totalXof)})` : "Connecte ton wallet") : pay === "momo" ? (checkoutLoading ? "Enregistrement…" : "Confirmer le paiement") : pay === "stars" ? (starsLoading ? "Ouverture paiement…" : tgWebApp ? `Payer ${XOF_FMT(totalXof)} en Stars` : "Confirmer sans paiement") : "Confirmer"}
        </button>
      </div>
    </div>
  );
}
