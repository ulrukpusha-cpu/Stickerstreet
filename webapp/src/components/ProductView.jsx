import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { XOF_FMT } from "../data/constants";
import { getPriceForSize } from "../utils/productPrice";

const CAT_META = {
  stickers: { label: "STICKER", color: "#FF3B5C" },
  cartes: { label: "CARTE DE VISITE", color: "#B7791F" },
  photo: { label: "PHOTO", color: "#7C3AED" },
  flyers: { label: "FLYER", color: "#0E9F7A" },
  posters: { label: "POSTER", color: "#1C7ED6" },
  tshirts: { label: "TEXTILE DTF", color: "#E8590C" },
  art: { label: "ART", color: "#9C36B5" },
};

export default function ProductView({ p, addCart, design, setDesign, isFavorite = false, toggleFavorite }) {
  const sizes = p.sizes?.length ? p.sizes : [""];
  const [sz, setSz] = useState(sizes[0]);
  const [qty, setQty] = useState(1);
  const [visIdx, setVisIdx] = useState(0);
  const fileRef = useRef(null);
  const galleryRef = useRef(null);
  const cat = CAT_META[p.cat] || CAT_META.flyers;
  const unit = getPriceForSize(p, sz);
  // « Taille » pour les vêtements et les dimensions (5×5cm, A3…), « Option » pour matériaux/formules (PVC, Métal…)
  const optionLabel = p.cat === "tshirts" || sizes.every((s) => /\d/.test(s)) ? "Taille" : "Option";
  const visuals = useMemo(() => {
    const list = Array.isArray(p.visuals) ? p.visuals.filter(Boolean) : [];
    if (p.img && !list.includes(p.img)) list.unshift(p.img);
    return [...new Set(list)];
  }, [p]);

  useEffect(() => {
    setSz(sizes[0]);
    setQty(1);
    setVisIdx(0);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToVisual = (idx) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div>
      <div className="gallery">
        {visuals.length > 0 ? (
          <div
            className="gallery-track"
            ref={galleryRef}
            onScroll={(e) => setVisIdx(Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth || 1)))}
          >
            {visuals.map((src, idx) => (
              <div key={src}><img src={src} alt={`${p.name} — visuel ${idx + 1}`} /></div>
            ))}
          </div>
        ) : (
          <div className="gallery-track" style={{ background: p.grad || undefined }}>
            <div><span style={{ fontSize: 96 }}>{p.emoji}</span></div>
          </div>
        )}
        {visuals.length > 1 && (
          <div className="gallery-dots">
            {visuals.map((src, idx) => (
              <button key={src} className={idx === visIdx ? "is-active" : ""} onClick={() => goToVisual(idx)} aria-label={`Visuel ${idx + 1}`} />
            ))}
          </div>
        )}
        {typeof toggleFavorite === "function" && (
          <button className={`p-fav${isFavorite ? " is-on" : ""}`} onClick={toggleFavorite} aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} aria-pressed={isFavorite}>
            <Icon name="heart" size={20} fill={isFavorite} />
          </button>
        )}
      </div>

      <div className="pd">
        <span className="pd-cat" style={{ background: `${cat.color}1A`, color: cat.color }}>{cat.label}</span>
        <h1>{p.name}</h1>
        <p className="pd-desc">{p.desc}</p>

        {sizes[0] && (
          <div className="pd-block">
            <span className="eyebrow">{optionLabel}</span>
            <div className="size-grid" role="radiogroup" aria-label={optionLabel}>
              {sizes.map((s) => (
                <button key={s} role="radio" aria-checked={sz === s} className={`size-opt${sz === s ? " is-active" : ""}`} onClick={() => setSz(s)}>
                  <b>{s}</b>
                  <span className="num">{XOF_FMT(getPriceForSize(p, s).xof)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pd-block">
          <span className="eyebrow">Quantité</span>
          <div className="qty lg">
            <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Moins" disabled={qty <= 1}><Icon name="minus" size={18} /></button>
            <span className="num" aria-live="polite">{qty}</span>
            <button onClick={() => setQty(qty + 1)} aria-label="Plus"><Icon name="plus" size={18} /></button>
          </div>
        </div>

        {p.custom && (
          <div className="pd-block">
            <span className="eyebrow">Ton design</span>
            <button className={`dropzone${design ? " is-done" : ""}`} onClick={() => fileRef.current?.click()}>
              <Icon name={design ? "check" : "upload"} size={28} />
              <b>{design ? "Design ajouté" : "Ajoute ton fichier"}</b>
              <small>{design || "PNG, JPG, SVG ou PDF — tu pourras aussi l'envoyer au support"}</small>
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.svg" hidden onChange={(e) => { if (e.target.files[0]) setDesign(e.target.files[0].name); }} />
          </div>
        )}

        <div className="buybar">
          <div className="buybar-total">
            <small className="num">{qty} × {XOF_FMT(unit.xof)}</small>
            <b className="num">{XOF_FMT(unit.xof * qty)}</b>
          </div>
          <button className="btn btn-primary" onClick={() => addCart(p, sz, qty, design)}>
            <Icon name="bag" size={18} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
