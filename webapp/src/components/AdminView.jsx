import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { XOF_FMT, STATUSES, PAY_LABELS, PAYMENT_STATUS } from "../data/constants";

const CATS = ["stickers", "flyers", "cartes", "posters", "tshirts", "art", "photo"];
const CAT_LABELS = { stickers: "Stickers", flyers: "Flyers", cartes: "Cartes", posters: "Posters", tshirts: "T-shirts", art: "Art", photo: "Photo" };
const XOF_PER_USD = 600;
const USD_PER_TON = 6.25;
const ORDER_FILTERS = [
  { k: "todo", l: "À traiter", test: (o) => ["confirmed", "production"].includes(o.status) || (o.status === "pending" && !["awaiting", "failed"].includes(o.payment_status)) },
  { k: "awaiting", l: "Paiement en attente", test: (o) => ["awaiting", "review"].includes(o.payment_status) },
  { k: "done", l: "Terminées", test: (o) => ["shipped", "delivered"].includes(o.status) },
  { k: "all", l: "Toutes", test: () => true },
];
const EMPTY_FORM = {
  name: "",
  cat: "stickers",
  xof: "",
  price: "",
  ton: "",
  sizes: "",
  desc: "",
  custom: true,
  emoji: "📦",
  grad: "linear-gradient(135deg, #FF6B6B, #EE5A24)",
  visuals: ["", "", ""],
};
const EMPTY_BANNER_FORM = {
  title: "",
  image: "",
  link: "",
  section: "home",
  active: true,
};

const PRODUCT_IMG_RULES = {
  minWidth: 800,
  minHeight: 800,
  targetRatio: 1,
  ratioTolerance: 0.08,
  label: "1080×1080 (ratio 1:1)",
};

const BANNER_IMG_RULES = {
  minWidth: 1200,
  minHeight: 350,
  targetRatio: 3.2,
  ratioTolerance: 0.22,
  label: "1600×500 (ratio ~3.2:1)",
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });

const loadImageMeta = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Number(img.naturalWidth || 0);
      const h = Number(img.naturalHeight || 0);
      if (!w || !h) {
        reject(new Error("Image invalide"));
        return;
      }
      resolve({ w, h, ratio: w / h });
    };
    img.onerror = () => reject(new Error("Impossible de lire l'image"));
    img.src = src;
  });

const withTimeout = (promise, ms = 7000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout validation image")), ms)),
  ]);

async function validateImageSource(src, rules) {
  try {
    const { w, h, ratio } = await withTimeout(loadImageMeta(src));
    const minOk = w >= rules.minWidth && h >= rules.minHeight;
    const ratioOk = Math.abs(ratio - rules.targetRatio) <= rules.ratioTolerance;
    if (minOk && ratioOk) return { ok: true, message: "" };
    const reason = !minOk
      ? `résolution trop faible (${w}×${h})`
      : `ratio non recommandé (${ratio.toFixed(2)}:1)`;
    return { ok: false, message: `${reason}. Recommandé: ${rules.label}` };
  } catch (err) {
    return { ok: false, message: err?.message || "Validation image impossible" };
  }
}

export default function AdminView({
  orders,
  setOrders,
  prods,
  banners = [],
  tab,
  setTab,
  title,
  segBtn,
  card,
  t,
  onUpdateOrder,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onCreateBanner,
  onUpdateBanner,
  onDeleteBanner,
  onUploadImage,
  onLogout,
  adminVia = "key",
  bannerSettings = { autoplay: true, interval: 4 },
  onSaveBannerSettings,
  notify,
}) {
  const [orderFilter, setOrderFilter] = useState("todo");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [bs, setBs] = useState(bannerSettings);
  const formRef = useRef(null);
  useEffect(() => setBs(bannerSettings), [bannerSettings]);
  const [catFilter, setCatFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sizePrices, setSizePrices] = useState({});
  const [saving, setSaving] = useState(false);
  const [bannerForm, setBannerForm] = useState(EMPTY_BANNER_FORM);
  const [editingBannerId, setEditingBannerId] = useState(null);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [prodSubtab, setProdSubtab] = useState("catalog");
  const [uploadingVisualIdx, setUploadingVisualIdx] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [allowUnsafeProductImages, setAllowUnsafeProductImages] = useState(false);
  const [allowUnsafeBannerImages, setAllowUnsafeBannerImages] = useState(false);

  useEffect(() => {
    try {
      const p = localStorage.getItem("stickerstreet_allow_unsafe_product_images");
      const b = localStorage.getItem("stickerstreet_allow_unsafe_banner_images");
      if (p !== null) setAllowUnsafeProductImages(p === "1");
      if (b !== null) setAllowUnsafeBannerImages(b === "1");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("stickerstreet_allow_unsafe_product_images", allowUnsafeProductImages ? "1" : "0");
    } catch {}
  }, [allowUnsafeProductImages]);

  useEffect(() => {
    try {
      localStorage.setItem("stickerstreet_allow_unsafe_banner_images", allowUnsafeBannerImages ? "1" : "0");
    } catch {}
  }, [allowUnsafeBannerImages]);

  const rev = orders.reduce((s, o) => s + (o.totalXof || 0), 0);
  const pend = orders.filter((o) => o.status === "pending").length;

  const parsedSizes = useMemo(
    () => form.sizes.split(",").map((x) => x.trim()).filter(Boolean),
    [form.sizes],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prods.filter((p) => (catFilter === "all" || p.cat === catFilter) && (!q || p.name.toLowerCase().includes(q)));
  }, [prods, catFilter, search]);

  const visibleBanners = useMemo(() => banners || [], [banners]);

  const handleStatusChange = (orderId, status) => {
    setOrders((p) => p.map((x) => (x.id === orderId ? { ...x, status } : x)));
    onUpdateOrder?.(orderId, status);
  };

  const startEdit = (p) => {
    const visuals = [...(p.visuals || (p.img ? [p.img] : []))];
    while (visuals.length < 3) visuals.push("");
    const sizes = p.sizes || [];
    const nextSizePrices = {};
    sizes.forEach((sz) => {
      const pb = p.pricesBySize?.[sz] || {};
      nextSizePrices[sz] = {
        xof: String(pb.xof ?? p.xof ?? ""),
        price: String(pb.price ?? p.price ?? ""),
        ton: String(pb.ton ?? p.ton ?? ""),
      };
    });
    setEditingId(p.id);
    setForm({
      name: p.name || "",
      cat: p.cat || "stickers",
      xof: String(p.xof || ""),
      price: String(p.price || ""),
      ton: String(p.ton || ""),
      sizes: (p.sizes || []).join(", "),
      desc: p.desc || "",
      custom: Boolean(p.custom),
      emoji: p.emoji || "📦",
      grad: p.grad || EMPTY_FORM.grad,
      visuals: visuals.slice(0, 3),
    });
    setSizePrices(nextSizePrices);
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSizePrices({});
  };

  const onVisualChange = (idx, value) => {
    setForm((prev) => {
      const next = [...prev.visuals];
      next[idx] = value;
      return { ...prev, visuals: next };
    });
  };

  const handleVisualFileUpload = async (idx, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify?.("Fichier image requis");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify?.("Image trop lourde (max 5MB)");
      return;
    }
    try {
      setUploadingVisualIdx(idx);
      const dataUrl = await fileToDataUrl(file);
      const check = await validateImageSource(dataUrl, PRODUCT_IMG_RULES);
      if (!check.ok && !allowUnsafeProductImages) {
        notify?.(`Visuel ${idx + 1}: ${check.message}`);
        return;
      }
      if (!check.ok && allowUnsafeProductImages) {
        notify?.(`Visuel ${idx + 1}: forçage activé (${check.message})`);
      }
      if (onUploadImage) {
        try {
          const remoteUrl = await onUploadImage(file, "products");
          onVisualChange(idx, remoteUrl);
        } catch {
          // Fallback local si Blob est indisponible (évite blocage total).
          onVisualChange(idx, dataUrl);
          notify?.("Upload Blob indisponible, image ajoutée en mode local");
        }
      } else {
        onVisualChange(idx, dataUrl);
      }
      notify?.(`Visuel ${idx + 1} importé ✓`);
    } catch (err) {
      notify?.(err?.message || "Erreur upload visuel");
    } finally {
      setUploadingVisualIdx(null);
    }
  };

  const submitProduct = async () => {
    const visuals = form.visuals.map((x) => x.trim()).filter(Boolean);
    const sizes = parsedSizes;
    const toUsd = (x) => Math.round((x / XOF_PER_USD) * 100) / 100;
    const toTon = (x) => Math.round((x / XOF_PER_USD / USD_PER_TON) * 10000) / 10000;
    const pricesBySize = {};
    sizes.forEach((sz) => {
      const xof = Number(sizePrices[sz]?.xof || form.xof || 0);
      pricesBySize[sz] = { xof, price: toUsd(xof), ton: toTon(xof) };
    });
    const xofs = Object.values(pricesBySize).map((v) => v.xof).filter((x) => x > 0);
    const baseXof = xofs.length ? Math.min(...xofs) : Number(form.xof || 0);
    const payload = {
      name: form.name.trim(),
      cat: form.cat,
      xof: baseXof,
      price: toUsd(baseXof),
      ton: toTon(baseXof),
      sizes,
      desc: form.desc.trim(),
      custom: Boolean(form.custom),
      emoji: form.emoji.trim() || "📦",
      grad: form.grad.trim(),
      visuals,
      img: visuals[0] || "",
      pricesBySize,
    };

    if (!payload.name || !payload.desc || !payload.sizes.length || !payload.visuals.length || !payload.xof
        || Object.values(pricesBySize).some((v) => !(v.xof > 0))) {
      notify?.("Remplis nom, description, tailles, un prix pour chaque taille et au moins 1 visuel");
      return;
    }
    if (!allowUnsafeProductImages) {
      for (let i = 0; i < payload.visuals.length; i += 1) {
        const check = await validateImageSource(payload.visuals[i], PRODUCT_IMG_RULES);
        if (!check.ok) {
          notify?.(`Visuel ${i + 1}: ${check.message}`);
          return;
        }
      }
    }

    try {
      setSaving(true);
      if (editingId) await onUpdateProduct?.(editingId, payload);
      else await onCreateProduct?.(payload);
      resetForm();
    } catch (err) {
      notify?.(err?.message || "Erreur produit");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer cet article ?")) return;
    try {
      await onDeleteProduct?.(id);
      if (editingId === id) resetForm();
    } catch (err) {
      notify?.(err?.message || "Erreur suppression");
    }
  };

  const startBannerEdit = (b) => {
    setShowBannerForm(true);
    setEditingBannerId(b.id);
    setBannerForm({
      title: b.title || "",
      image: b.image || "",
      link: b.link || "",
      section: b.section || "home",
      active: Boolean(b.active),
    });
    notify?.("Modification bannière");
  };

  const resetBannerForm = () => {
    setShowBannerForm(false);
    setEditingBannerId(null);
    setBannerForm(EMPTY_BANNER_FORM);
  };

  const submitBanner = async () => {
    if (!bannerForm.image.trim()) {
      notify?.("Image de bannière requise");
      return;
    }
    const bannerCheck = await validateImageSource(bannerForm.image.trim(), BANNER_IMG_RULES);
    if (!bannerCheck.ok && !allowUnsafeBannerImages) {
      notify?.(`Bannière: ${bannerCheck.message}`);
      return;
    }
    if (!bannerCheck.ok && allowUnsafeBannerImages) {
      notify?.(`Bannière: forçage activé (${bannerCheck.message})`);
    }
    try {
      setBannerSaving(true);
      const payload = {
        title: bannerForm.title.trim(),
        image: bannerForm.image.trim(),
        link: bannerForm.link.trim(),
        section: bannerForm.section || "home",
        active: Boolean(bannerForm.active),
      };
      if (editingBannerId) await onUpdateBanner?.(editingBannerId, payload);
      else await onCreateBanner?.(payload);
      resetBannerForm();
    } catch (err) {
      notify?.(err?.message || "Erreur bannière");
    } finally {
      setBannerSaving(false);
    }
  };

  const handleBannerFileUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify?.("Fichier image requis");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify?.("Image trop lourde (max 5MB)");
      return;
    }
    try {
      setUploadingBanner(true);
      const dataUrl = await fileToDataUrl(file);
      const check = await validateImageSource(dataUrl, BANNER_IMG_RULES);
      if (!check.ok && !allowUnsafeBannerImages) {
        notify?.(`Bannière: ${check.message}`);
        return;
      }
      if (!check.ok && allowUnsafeBannerImages) {
        notify?.(`Bannière: forçage activé (${check.message})`);
      }
      if (onUploadImage) {
        try {
          const remoteUrl = await onUploadImage(file, "banners");
          setBannerForm((p) => ({ ...p, image: remoteUrl }));
        } catch {
          // Fallback local si Blob est indisponible (évite blocage total).
          setBannerForm((p) => ({ ...p, image: dataUrl }));
          notify?.("Upload Blob indisponible, bannière ajoutée en mode local");
        }
      } else {
        setBannerForm((p) => ({ ...p, image: dataUrl }));
      }
      notify?.("Image bannière importée ✓");
    } catch (err) {
      notify?.(err?.message || "Erreur upload bannière");
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleDeleteBanner = async (bannerId) => {
    if (!window.confirm("Supprimer cette bannière ?")) return;
    try {
      await onDeleteBanner?.(bannerId);
      if (editingBannerId === bannerId) resetBannerForm();
    } catch (err) {
      notify?.(err?.message || "Erreur suppression bannière");
    }
  };

  const updateSizePrice = (size, field, value) => {
    setSizePrices((prev) => ({
      ...prev,
      [size]: {
        xof: prev[size]?.xof ?? form.xof ?? "",
        price: prev[size]?.price ?? form.price ?? "",
        ton: prev[size]?.ton ?? form.ton ?? "",
        [field]: value,
      },
    }));
  };

  const shownOrders = orders.filter((ORDER_FILTERS.find((f) => f.k === orderFilter) || ORDER_FILTERS[3]).test);
  const awaitingCount = orders.filter(ORDER_FILTERS[1].test).length;
  const todoCount = orders.filter(ORDER_FILTERS[0].test).length;
  const TABS = [
    { k: "orders", l: "Commandes", icon: "package" },
    { k: "products", l: "Produits", icon: "shop" },
    { k: "banners", l: "Bannières", icon: "image" },
    { k: "settings", l: "Réglages", icon: "settings" },
  ];

  return (
    <div className="admin">
      <h1 className="page-title">Panel admin <small>{adminVia === "telegram" ? "via Telegram" : "clé admin"}</small></h1>

      <div className="stats">
        <div className="stat"><b className="num" style={{ color: "var(--ok)" }}>{XOF_FMT(rev)}</b><span>Chiffre (toutes commandes)</span></div>
        <div className="stat"><b className="num" style={{ color: "var(--brand)" }}>{todoCount}</b><span>À traiter</span></div>
        <div className="stat"><b className="num" style={{ color: "var(--warn)" }}>{awaitingCount}</b><span>Paiements en attente</span></div>
        <div className="stat"><b className="num">{prods.length}</b><span>Produits</span></div>
      </div>

      <div className="admin-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.k} role="tab" aria-selected={tab === x.k} className={tab === x.k ? "is-active" : ""} onClick={() => setTab(x.k)}>
            <Icon name={x.icon} size={17} /><span>{x.l}</span>
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="stack">
          <div className="chip-row">
            {ORDER_FILTERS.map((f) => (
              <button key={f.k} className={`chip${orderFilter === f.k ? " is-active" : ""}`} onClick={() => setOrderFilter(f.k)}>
                {f.l} · {orders.filter(f.test).length}
              </button>
            ))}
          </div>
          {shownOrders.length === 0 && <div className="admin-empty">Aucune commande dans cette liste.</div>}
          {shownOrders.map((o) => {
            const st = STATUSES[o.status] || STATUSES.pending;
            const pay = PAYMENT_STATUS[o.payment_status];
            return (
              <article key={o.id} className="card admin-order">
                <div className="admin-order-head">
                  <div>
                    <b>{o.id}</b>
                    <small>{o.date} · {PAY_LABELS[o.payment_method] || o.payment_method || "—"}{o.payment_operator ? ` (${o.payment_operator})` : ""}</small>
                  </div>
                  <span className="num admin-order-total">{XOF_FMT(o.totalXof || 0)}</span>
                </div>
                <div className="admin-pills">
                  <span className="status" style={{ background: `${st.color}1F`, color: st.color }}><i />{st.label}</span>
                  {pay && <span className="status" style={{ background: `${pay.color}1F`, color: pay.color }}><i />{pay.label}</span>}
                </div>
                <div className="admin-client">
                  <b>{o.client_name || "Client"}</b>{o.telegram_user_id ? <small> · TG {o.telegram_user_id}</small> : null}
                  {(o.client_phone || o.client_address) && <div>{[o.client_phone, o.client_address].filter(Boolean).join(" · ")}</div>}
                </div>
                <ul className="admin-items">
                  {o.items.map((it, j) => <li key={j}><span>{it.name} <small>· {it.sz || "—"}</small></span><span className="num">×{it.qty}</span></li>)}
                </ul>
                {o.payment_note && <div className="notice" style={{ marginBottom: 10 }}>⚠ {o.payment_note}</div>}
                <div className="admin-status-row">
                  {Object.entries(STATUSES).map(([k, v]) => (
                    <button key={k} className={`chip${o.status === k ? " is-active" : ""}`} onClick={() => handleStatusChange(o.id, k)}>{v.label}</button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "products" && (
        <div className="stack">
          {!showForm && (
            <button className="btn btn-primary btn-block" onClick={() => { setShowForm(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }}>
              <Icon name="plus" size={18} /> Nouvel article
            </button>
          )}

          {showForm && (
            <section className="card admin-form" ref={formRef}>
              <div className="admin-form-head">
                <h2>{editingId ? "Modifier l'article" : "Nouvel article"}</h2>
                <button className="icon-btn" onClick={resetForm} aria-label="Fermer"><Icon name="close" size={18} /></button>
              </div>
              <label className="field"><span>Nom</span><input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex : Sticker Vinyle" /></label>
              <div className="admin-grid-2">
                <label className="field"><span>Catégorie</span>
                  <select className="input" value={form.cat} onChange={(e) => setForm((p) => ({ ...p, cat: e.target.value }))}>
                    {CATS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                  </select>
                </label>
                <label className="field"><span>Emoji</span><input className="input" value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} /></label>
              </div>
              <label className="field"><span>Tailles / options (séparées par des virgules)</span><input className="input" value={form.sizes} onChange={(e) => setForm((p) => ({ ...p, sizes: e.target.value }))} placeholder="Ex : 5×5cm, 8×8cm, Lot 100 · 5×5cm" /></label>
              {parsedSizes.length > 0 && (
                <div className="admin-prices">
                  <span className="eyebrow">Prix en F CFA (USD et TON calculés automatiquement)</span>
                  {parsedSizes.map((sz) => (
                    <label key={sz} className="admin-price-row">
                      <span>{sz}</span>
                      <input className="input num" inputMode="numeric" value={sizePrices[sz]?.xof ?? form.xof ?? ""} onChange={(e) => updateSizePrice(sz, "xof", e.target.value.replace(/[^\d]/g, ""))} placeholder="Prix" />
                    </label>
                  ))}
                </div>
              )}
              <label className="field"><span>Description</span><textarea className="input admin-textarea" value={form.desc} onChange={(e) => setForm((p) => ({ ...p, desc: e.target.value }))} rows={3} /></label>
              <div className="field">
                <span>Visuels (le premier est l'image principale)</span>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="admin-visual">
                    <div className="admin-thumb">{form.visuals[idx] ? <img src={form.visuals[idx]} alt="" /> : <Icon name="image" size={18} />}</div>
                    <input className="input" value={form.visuals[idx] || ""} onChange={(e) => onVisualChange(idx, e.target.value)} placeholder={`Visuel ${idx + 1} : URL ou importer`} />
                    <label className="btn btn-ghost btn-sm admin-upload">
                      {uploadingVisualIdx === idx ? "…" : <Icon name="upload" size={16} />}
                      <input type="file" accept="image/*" hidden onChange={(e) => handleVisualFileUpload(idx, e.target.files?.[0])} />
                    </label>
                  </div>
                ))}
              </div>
              <label className="admin-check"><input type="checkbox" checked={form.custom} onChange={(e) => setForm((p) => ({ ...p, custom: e.target.checked }))} /> Produit personnalisable (badge PERSO + envoi du design)</label>
              <label className="admin-check"><input type="checkbox" checked={allowUnsafeProductImages} onChange={(e) => setAllowUnsafeProductImages(e.target.checked)} /> Accepter des images hors format recommandé ({PRODUCT_IMG_RULES.label})</label>
              <div className="admin-actions">
                <button className="btn btn-ghost" onClick={resetForm}>Annuler</button>
                <button className="btn btn-primary" disabled={saving} onClick={submitProduct}>{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Ajouter l'article"}</button>
              </div>
            </section>
          )}

          <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un article…" aria-label="Rechercher un article" />
          <div className="chip-row">
            {["all", ...CATS].map((c) => (
              <button key={c} className={`chip${catFilter === c ? " is-active" : ""}`} onClick={() => setCatFilter(c)}>
                {c === "all" ? "Toutes" : CAT_LABELS[c]} · {c === "all" ? prods.length : prods.filter((p) => p.cat === c).length}
              </button>
            ))}
          </div>
          <div className="card list">
            {filteredProducts.length === 0 && <div className="admin-empty">Aucun article.</div>}
            {filteredProducts.map((p) => (
              <div key={p.id} className="admin-prod">
                <div className="admin-thumb lg" style={!p.img ? { background: p.grad } : undefined}>{p.img ? <img src={p.img} alt="" loading="lazy" /> : <span>{p.emoji}</span>}</div>
                <div className="admin-prod-info">
                  <b>{p.name}</b>
                  <small>{CAT_LABELS[p.cat] || p.cat} · {p.sizes?.length || 0} option(s) · dès <span className="num">{XOF_FMT(p.xof || 0)}</span></small>
                </div>
                <button className="icon-btn" onClick={() => startEdit(p)} aria-label={`Modifier ${p.name}`}><Icon name="settings" size={17} /></button>
                <button className="icon-btn admin-danger" onClick={() => handleDelete(p.id)} aria-label={`Supprimer ${p.name}`}><Icon name="close" size={17} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "banners" && (
        <div className="stack">
          <section className="card admin-form">
            <h2>Défilement</h2>
            <label className="admin-switch">
              <input type="checkbox" checked={!!bs.autoplay} onChange={(e) => setBs((p) => ({ ...p, autoplay: e.target.checked }))} />
              <span><b>Défilement automatique</b><small>Les bannières passent toutes seules ; le client peut toujours glisser au doigt.</small></span>
            </label>
            <label className="field"><span>Durée d'affichage de chaque bannière</span>
              <select className="input" value={bs.interval} disabled={!bs.autoplay} onChange={(e) => setBs((p) => ({ ...p, interval: Number(e.target.value) }))}>
                {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} secondes</option>)}
              </select>
            </label>
            <button className="btn btn-ink btn-block" disabled={bs.autoplay === bannerSettings.autoplay && Number(bs.interval) === Number(bannerSettings.interval)}
              onClick={() => onSaveBannerSettings?.({ autoplay: !!bs.autoplay, interval: Number(bs.interval) }).catch((e) => notify?.(e.message))}>
              Enregistrer le défilement
            </button>
          </section>

          {!showBannerForm && (
            <button className="btn btn-primary btn-block" onClick={() => setShowBannerForm(true)}><Icon name="plus" size={18} /> Nouvelle bannière</button>
          )}
          {showBannerForm && (
            <section className="card admin-form">
              <div className="admin-form-head">
                <h2>{editingBannerId ? "Modifier la bannière" : "Nouvelle bannière"}</h2>
                <button className="icon-btn" onClick={resetBannerForm} aria-label="Fermer"><Icon name="close" size={18} /></button>
              </div>
              <label className="field"><span>Titre (optionnel)</span><input className="input" value={bannerForm.title} onChange={(e) => setBannerForm((p) => ({ ...p, title: e.target.value }))} /></label>
              <div className="field">
                <span>Image ({BANNER_IMG_RULES.label})</span>
                <div className="admin-visual">
                  <input className="input" value={bannerForm.image} onChange={(e) => setBannerForm((p) => ({ ...p, image: e.target.value }))} placeholder="URL ou importer" />
                  <label className="btn btn-ghost btn-sm admin-upload">
                    {uploadingBanner ? "…" : <Icon name="upload" size={16} />}
                    <input type="file" accept="image/*" hidden onChange={(e) => handleBannerFileUpload(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
              {bannerForm.image && <img className="admin-banner-preview" src={bannerForm.image} alt="Aperçu" />}
              <label className="field"><span>Lien au clic (optionnel)</span><input className="input" value={bannerForm.link} onChange={(e) => setBannerForm((p) => ({ ...p, link: e.target.value }))} placeholder="https://…" /></label>
              <label className="field"><span>Emplacement</span>
                <select className="input" value={bannerForm.section} onChange={(e) => setBannerForm((p) => ({ ...p, section: e.target.value }))}>
                  <option value="home">Page d'accueil</option>
                  <option value="profile">Page profil</option>
                </select>
              </label>
              <label className="admin-check"><input type="checkbox" checked={bannerForm.active} onChange={(e) => setBannerForm((p) => ({ ...p, active: e.target.checked }))} /> Bannière visible</label>
              <label className="admin-check"><input type="checkbox" checked={allowUnsafeBannerImages} onChange={(e) => setAllowUnsafeBannerImages(e.target.checked)} /> Accepter une image hors format recommandé</label>
              <div className="admin-actions">
                <button className="btn btn-ghost" onClick={resetBannerForm}>Annuler</button>
                <button className="btn btn-primary" disabled={bannerSaving} onClick={submitBanner}>{bannerSaving ? "Enregistrement…" : editingBannerId ? "Enregistrer" : "Ajouter"}</button>
              </div>
            </section>
          )}

          <div className="card list">
            {visibleBanners.length === 0 && <div className="admin-empty">Aucune bannière.</div>}
            {visibleBanners.map((b) => (
              <div key={b.id} className="admin-prod">
                <div className="admin-thumb wide"><img src={b.image} alt="" loading="lazy" /></div>
                <div className="admin-prod-info">
                  <b>{b.title || "Bannière"}</b>
                  <small>{(b.section || "home") === "profile" ? "Profil" : "Accueil"} · {b.active ? "Visible" : "Masquée"}</small>
                </div>
                <button className="icon-btn" onClick={() => startBannerEdit(b)} aria-label="Modifier la bannière"><Icon name="settings" size={17} /></button>
                <button className="icon-btn admin-danger" onClick={() => handleDeleteBanner(b.id)} aria-label="Supprimer la bannière"><Icon name="close" size={17} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <section className="card admin-form">
          <h2>Accès admin</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            {adminVia === "telegram"
              ? "Connecté avec ton compte Telegram (propriétaire ou admin de l'équipe)."
              : "Connecté avec la clé admin : gardée uniquement pour cet onglet et vérifiée par le serveur."}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            L'équipe (employés, admins) se gère dans le bot <b>StickerStreet Admin</b> → 👥 Équipe.
          </p>
          <button className="btn btn-ghost btn-block" onClick={() => onLogout?.()}><Icon name="logout" size={17} /> Quitter le mode admin</button>
        </section>
      )}
    </div>
  );
}
