import { useEffect, useMemo, useState } from "react";
import { XOF_FMT, STATUSES } from "../data/constants";

const CATS = ["stickers", "flyers", "cartes", "photo"];
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
  onChangeAdminPin,
  notify,
}) {
  const [newPin, setNewPin] = useState("");
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
    if (catFilter === "all") return prods;
    return prods.filter((p) => p.cat === catFilter);
  }, [prods, catFilter]);

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
    notify?.("Mode modification activé");
  };

  const resetForm = () => {
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
    const pricesBySize = {};
    sizes.forEach((sz) => {
      const row = sizePrices[sz] || {};
      pricesBySize[sz] = {
        xof: Number(row.xof || form.xof || 0),
        price: Number(row.price || form.price || 0),
        ton: Number(row.ton || form.ton || 0),
      };
    });
    const payload = {
      name: form.name.trim(),
      cat: form.cat,
      xof: Number(form.xof),
      price: Number(form.price || 0),
      ton: Number(form.ton || 0),
      sizes,
      desc: form.desc.trim(),
      custom: Boolean(form.custom),
      emoji: form.emoji.trim() || "📦",
      grad: form.grad.trim(),
      visuals,
      img: visuals[0] || "",
      pricesBySize,
    };

    if (!payload.name || !payload.desc || !payload.sizes.length || !payload.visuals.length || !payload.xof) {
      notify?.("Remplis nom, description, tailles, prix XOF et au moins 1 visuel");
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

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <h2 style={title}>Panel admin</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { v: XOF_FMT(rev), l: "Revenus", c: "#F59E0B" },
          { v: orders.length, l: "Commandes", c: "#3B82F6" },
          { v: pend, l: "En attente", c: "#FF3B5C" },
          { v: prods.length, l: "Produits", c: "#00C48C" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderRadius: 18, padding: "18px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: t.textMuted, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginBottom: 18, background: t.segBg, borderRadius: 16, padding: 4 }}>
        <button onClick={() => setTab("orders")} style={segBtn(tab === "orders")}>Commandes</button>
        <button onClick={() => setTab("products")} style={segBtn(tab === "products")}>Produits</button>
        <button onClick={() => setTab("settings")} style={segBtn(tab === "settings")}>Paramètres</button>
      </div>

      {tab === "orders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((o) => (
            <div key={o.id} style={{ ...card, borderRadius: 18, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{o.id}</div>
                <div style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 12, marginTop: 2 }}>{o.date} · {o.items.length} article(s) · {XOF_FMT(o.totalXof || o.total * 600)}</div>
              </div>
              <label style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Statut :</label>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {Object.entries(STATUSES).map(([k, v]) => (
                  <button key={k} onClick={() => handleStatusChange(o.id, k)} style={{ padding: "7px 12px", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontWeight: 600, border: "none", background: o.status === k ? v.color + "22" : t.bgAlt, color: o.status === k ? v.color : t.textMuted, transition: "all 0.2s" }}>{v.icon} {v.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <div style={{ ...card, borderRadius: 18, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Code PIN admin</h3>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textMuted, marginBottom: 14 }}>Modifie le code à 4 chiffres pour accéder au panel admin.</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Nouveau PIN (4 chiffres)"
            style={{ width: "100%", padding: "14px 16px", background: t.inputBg || t.bgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 12, fontFamily: "'Inter',sans-serif", fontSize: 18, color: t.text, outline: "none", letterSpacing: 8, textAlign: "center", boxSizing: "border-box", marginBottom: 12 }}
          />
          <button
            onClick={() => {
              if (newPin.length !== 4) { notify?.("Le PIN doit faire 4 chiffres"); return; }
              try { onChangeAdminPin?.(newPin); } catch (err) { notify?.(err?.message || "Erreur changement PIN"); return; }
              setNewPin("");
              notify?.("PIN modifié ✓ (reconnexion admin requise)");
            }}
            style={{ padding: "12px 20px", background: "#F59E0B", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}
          >
            Enregistrer le PIN
          </button>
        </div>
      )}

      {tab === "products" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <button onClick={() => setProdSubtab("catalog")} style={segBtn(prodSubtab === "catalog")}>Catalogue</button>
            <button onClick={() => setProdSubtab("banners")} style={segBtn(prodSubtab === "banners")}>Bannières pub</button>
          </div>

          {prodSubtab === "catalog" && (
            <>
          <div style={{ ...card, borderRadius: 18, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["all", ...CATS].map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} style={{ ...segBtn(catFilter === c), textTransform: c === "all" ? "none" : "capitalize" }}>
                  {c === "all" ? "Toutes" : c}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nom de l'article" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
              <select value={form.cat} onChange={(e) => setForm((p) => ({ ...p, cat: e.target.value }))} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }}>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.sizes} onChange={(e) => setForm((p) => ({ ...p, sizes: e.target.value }))} placeholder="Tailles (ex: A5, A4)" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input value={form.xof} onChange={(e) => setForm((p) => ({ ...p, xof: e.target.value }))} placeholder="Prix XOF" style={{ width: "100%", padding: "12px 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
                <input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} placeholder="USD" style={{ width: "100%", padding: "12px 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
                <input value={form.ton} onChange={(e) => setForm((p) => ({ ...p, ton: e.target.value }))} placeholder="TON" style={{ width: "100%", padding: "12px 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
              </div>
              {parsedSizes.length > 0 && (
                <div style={{ border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: 10, background: t.bgAlt }}>
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 8 }}>Prix par taille</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {parsedSizes.map((sz) => (
                      <div key={sz} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 6, alignItems: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{sz}</div>
                        <input value={sizePrices[sz]?.xof ?? form.xof ?? ""} onChange={(e) => updateSizePrice(sz, "xof", e.target.value)} placeholder="XOF" style={{ width: "100%", padding: "8px 8px", borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.card, color: t.text }} />
                        <input value={sizePrices[sz]?.price ?? form.price ?? ""} onChange={(e) => updateSizePrice(sz, "price", e.target.value)} placeholder="USD" style={{ width: "100%", padding: "8px 8px", borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.card, color: t.text }} />
                        <input value={sizePrices[sz]?.ton ?? form.ton ?? ""} onChange={(e) => updateSizePrice(sz, "ton", e.target.value)} placeholder="TON" style={{ width: "100%", padding: "8px 8px", borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.card, color: t.text }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <input value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} placeholder="Emoji (ex: 📦)" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
              <input value={form.grad} onChange={(e) => setForm((p) => ({ ...p, grad: e.target.value }))} placeholder="Dégradé CSS (optionnel)" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
              <textarea value={form.desc} onChange={(e) => setForm((p) => ({ ...p, desc: e.target.value }))} placeholder="Description" rows={3} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text, resize: "vertical" }} />
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: t.textMuted }}>Visuels (min 1, affichage carrousel sur 3)</div>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <input value={form.visuals[idx] || ""} onChange={(e) => onVisualChange(idx, e.target.value)} placeholder={`URL visuel ${idx + 1} ou upload`} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
                    <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.card, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      {uploadingVisualIdx === idx ? "..." : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleVisualFileUpload(idx, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.textMuted }}>
                <input type="checkbox" checked={allowUnsafeProductImages} onChange={(e) => setAllowUnsafeProductImages(e.target.checked)} />
                Forcer images produits hors dimensions recommandées
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.textMuted }}>
                <input type="checkbox" checked={form.custom} onChange={(e) => setForm((p) => ({ ...p, custom: e.target.checked }))} />
                Produit personnalisable
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={saving} onClick={submitProduct} style={{ ...segBtn(true), opacity: saving ? 0.7 : 1 }}>
                  {editingId ? "Enregistrer" : "Ajouter l'article"}
                </button>
                {editingId && (
                  <button onClick={resetForm} style={segBtn(false)}>Annuler</button>
                )}
              </div>
            </div>
          </div>

          {filteredProducts.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, ...card, borderRadius: 18, padding: "14px 16px" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: p.img ? "#f5f5f3" : p.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, overflow: "hidden" }}>
                {p.img ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{p.emoji}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 12 }}>{p.cat} · {p.sizes?.join(", ") || ""}</div>
                <div style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 11, marginTop: 3 }}>
                  {Array.isArray(p.visuals) ? p.visuals.length : p.img ? 1 : 0} visuel(s)
                </div>
              </div>
              <div style={{ textAlign: "right", display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{XOF_FMT(p.xof || 0)}</div>
                <button onClick={() => startEdit(p)} style={{ padding: "6px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: "#3B82F6", color: "#fff", fontSize: 12 }}>Modifier</button>
                <button onClick={() => handleDelete(p.id)} style={{ padding: "6px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: "#EF4444", color: "#fff", fontSize: 12 }}>Supprimer</button>
              </div>
            </div>
          ))}
            </>
          )}

          {prodSubtab === "banners" && (
            <>
              <div style={{ ...card, borderRadius: 18, padding: 14, display: "grid", gap: 8 }}>
                <input value={bannerForm.title} onChange={(e) => setBannerForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titre bannière (optionnel)" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input value={bannerForm.image} onChange={(e) => setBannerForm((p) => ({ ...p, image: e.target.value }))} placeholder="URL image bannière ou upload" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
                  <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.card, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    {uploadingBanner ? "..." : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => handleBannerFileUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
                <input value={bannerForm.link} onChange={(e) => setBannerForm((p) => ({ ...p, link: e.target.value }))} placeholder="Lien au clic (optionnel)" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }} />
                <select value={bannerForm.section} onChange={(e) => setBannerForm((p) => ({ ...p, section: e.target.value }))} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.bgAlt, color: t.text }}>
                  <option value="home">Accueil</option>
                  <option value="profile">Profil</option>
                </select>
                {bannerForm.image && (
                  <div style={{ width: "100%", borderRadius: 10, overflow: "hidden", background: t.bgAlt, border: `1px solid ${t.cardBorder}` }}>
                    <img src={bannerForm.image} alt="Preview bannière" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.textMuted }}>
                  <input type="checkbox" checked={allowUnsafeBannerImages} onChange={(e) => setAllowUnsafeBannerImages(e.target.checked)} />
                  Forcer bannière hors dimensions recommandées
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.textMuted }}>
                  <input type="checkbox" checked={bannerForm.active} onChange={(e) => setBannerForm((p) => ({ ...p, active: e.target.checked }))} />
                  Bannière active
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={bannerSaving} onClick={submitBanner} style={{ ...segBtn(true), opacity: bannerSaving ? 0.7 : 1 }}>
                    {editingBannerId ? "Enregistrer" : "Ajouter bannière"}
                  </button>
                  {editingBannerId && (
                    <button onClick={resetBannerForm} style={segBtn(false)}>Annuler</button>
                  )}
                </div>
              </div>

              {visibleBanners.map((b) => (
                <div key={b.id} style={{ ...card, borderRadius: 18, padding: 12, display: "grid", gridTemplateColumns: "68px 1fr auto", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 68, height: 52, borderRadius: 8, overflow: "hidden", background: t.bgAlt }}>
                    <img src={b.image} alt={b.title || "Bannière"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b.title || "Bannière"}</div>
                    <div style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 12 }}>
                      {(b.section || "home") === "profile" ? "Profil" : "Accueil"} · {b.active ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <button onClick={() => startBannerEdit(b)} style={{ padding: "6px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: "#3B82F6", color: "#fff", fontSize: 12 }}>Modifier</button>
                    <button onClick={() => handleDeleteBanner(b.id)} style={{ padding: "6px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: "#EF4444", color: "#fff", fontSize: 12 }}>Supprimer</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
