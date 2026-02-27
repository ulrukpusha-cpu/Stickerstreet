import { useEffect, useMemo, useState, useRef } from "react";
import { S, XOF_FMT } from "../data/constants";
import { getPriceForSize } from "../utils/productPrice";

export default function ProductView({ p, addCart, design, setDesign, label, qBtn, card, t, isFavorite = false, toggleFavorite }) {
  const [sz, setSz] = useState(p.sizes[0]);
  const [qty, setQty] = useState(1);
  const [visIdx, setVisIdx] = useState(0);
  const ref = useRef(null);
  const galleryRef = useRef(null);
  const catLabel = p.cat === "stickers" ? "STICKER" : p.cat === "cartes" ? "CARTE DE VISITE" : p.cat === "photo" ? "PHOTO" : "FLYER";
  const catColor = p.cat === "stickers" ? "#FF3B5C" : p.cat === "cartes" ? "#B8860B" : p.cat === "photo" ? "#7C3AED" : "#00C48C";
  const priceForSz = getPriceForSize(p, sz);
  const visuals = useMemo(() => {
    const list = Array.isArray(p.visuals) ? p.visuals.filter(Boolean) : [];
    if (p.img && !list.includes(p.img)) list.unshift(p.img);
    while (list.length < 3 && list.length > 0) list.push(list[0]);
    return list;
  }, [p]);

  useEffect(() => {
    setSz(p.sizes[0]);
    setQty(1);
    setVisIdx(0);
  }, [p]);

  const goToVisual = (idx) => {
    if (!galleryRef.current) return;
    const clamped = Math.max(0, Math.min(idx, visuals.length - 1));
    setVisIdx(clamped);
    galleryRef.current.scrollTo({ left: clamped * galleryRef.current.clientWidth, behavior: "smooth" });
  };

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ background: p.img ? "#f5f5f3" : p.grad, borderRadius: 24, height: 240, marginTop: 16, position: "relative", overflow: "hidden" }}>
        {typeof toggleFavorite === "function" && (
          <button onClick={toggleFavorite} style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.45)", color: isFavorite ? "#FF3B5C" : "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}>{isFavorite ? S.heart : S.heartEmpty}</button>
        )}
        {visuals.length > 0 ? (
          <>
            <div
              ref={galleryRef}
              onScroll={(e) => {
                const w = e.currentTarget.clientWidth || 1;
                setVisIdx(Math.round(e.currentTarget.scrollLeft / w));
              }}
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                overflowX: "auto",
                scrollSnapType: "x mandatory",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {visuals.map((src, idx) => (
                <div key={`${src}-${idx}`} style={{ flex: "0 0 100%", height: "100%", scrollSnapAlign: "center" }}>
                  <img src={src} alt={`${p.name} ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", zIndex: 2 }} />
                </div>
              ))}
            </div>
            <button onClick={() => goToVisual(visIdx - 1)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 18, cursor: "pointer" }}>‹</button>
            <button onClick={() => goToVisual(visIdx + 1)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 18, cursor: "pointer" }}>›</button>
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
              {visuals.map((_, idx) => (
                <button key={idx} onClick={() => goToVisual(idx)} style={{ width: 8, height: 8, borderRadius: "50%", border: "none", background: idx === visIdx ? "#fff" : "rgba(255,255,255,0.5)", padding: 0, cursor: "pointer" }} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
            <span style={{ fontSize: 90, zIndex: 2, filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.2))", display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>{p.emoji}</span>
          </>
        )}
      </div>
      <div style={{ padding: "24px 4px" }}>
        <div style={{ display: "inline-block", background: catColor + "15", color: catColor, padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>{catLabel}</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", letterSpacing: -0.5, color: t.text }}>{p.name}</h2>
        <p style={{ color: t.textSec, fontSize: 15, margin: "0 0 24px", lineHeight: 1.5, fontFamily: "'Inter',sans-serif" }}>{p.desc}</p>

        <div style={{ marginBottom: 22 }}>
          <label style={label}>Taille</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {p.sizes.map((s) => {
              const ps = getPriceForSize(p, s);
              return (
                <button key={s} onClick={() => setSz(s)} style={{ padding: "11px 20px", background: sz === s ? t.pillActive : t.card, color: sz === s ? t.pillActiveTxt : t.textSec, border: sz === s ? "none" : `1px solid ${t.cardBorder}`, borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all 0.2s", boxShadow: sz === s ? "0 4px 12px rgba(0,0,0,0.12)" : "none" }}>{s} · {XOF_FMT(ps.xof)}</button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={label}>Quantité</label>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={qBtn}>−</button>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, minWidth: 36, textAlign: "center" }}>{qty}</span>
            <button onClick={() => setQty(qty + 1)} style={qBtn}>+</button>
          </div>
        </div>

        {p.custom && (
          <div style={{ marginBottom: 28 }}>
            <label style={label}>Ton design</label>
            <div onClick={() => ref.current?.click()} style={{ border: `2px dashed ${design ? "#00C48C" : t.cardBorder}`, borderRadius: 18, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: design ? "#00C48C12" : t.bgAlt, transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {design ? <><span style={{ fontSize: 36, color: "#00C48C" }}>{S.check}</span><span style={{ fontWeight: 600, color: "#00C48C" }}>Design uploadé !</span></> : <><span style={{ fontSize: 42, color: t.textMuted }}>{S.upload}</span><span style={{ fontWeight: 600, fontSize: 15 }}>Glisse ton fichier ici</span><span style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 12 }}>PNG, JPG, SVG, PDF — Max 10MB</span></>}
            </div>
            <input ref={ref} type="file" accept="image/*,.pdf,.svg" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) setDesign(e.target.files[0].name); }} />
          </div>
        )}

        <div style={{ ...card, padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 18 }}>
            <span style={{ fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>{XOF_FMT(priceForSz.xof * qty)}</span>
          </div>
          <button onClick={() => addCart(p, sz, qty, design)} style={{ width: "100%", padding: 17, background: "#FF3B5C", color: "#fff", border: "none", borderRadius: 16, fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "'Poppins',sans-serif", letterSpacing: 0.5, boxShadow: "0 6px 24px rgba(255,59,92,0.28)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Ajouter au panier {S.cart}</button>
        </div>
      </div>
    </div>
  );
}
