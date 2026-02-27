import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { S } from "./data/constants";
import { THEMES } from "./data/themes";
import { fetchProducts, fetchBanners, uploadBlobImage, createProduct, patchProduct, removeProduct, createBanner, patchBanner, removeBanner, fetchOrders, createOrder, updateOrderStatus, fetchChat, postChatMessage, authTelegramMiniapp } from "./api";
import { XOF_FMT } from "./data/constants";

const ProductView = lazy(() => import("./components/ProductView"));
const CartView = lazy(() => import("./components/CartView"));
const OrdersView = lazy(() => import("./components/OrdersView"));
const ChatView = lazy(() => import("./components/ChatView"));
const ProfilView = lazy(() => import("./components/ProfilView"));
const AdminView = lazy(() => import("./components/AdminView"));
const AddToHomeScreen = lazy(() => import("./components/AddToHomeScreen"));
const FavoritesView = lazy(() => import("./components/FavoritesView"));
import { PRODUCTS } from "./data/products";
import { getPriceForSize } from "./utils/productPrice";

const VALID_VIEWS = ["home", "profil", "orders", "chat", "cart", "admin", "product", "favorites"];

function getViewFromUrl() {
  const hash = (window.location.hash || "#/").replace(/^#\/?/, "").toLowerCase();
  const parts = hash.split("/").filter(Boolean);
  const view = parts[0] || "home";
  return VALID_VIEWS.includes(view) ? view : "home";
}

function getProductIdFromUrl() {
  const hash = (window.location.hash || "").replace(/^#\/?/, "");
  const m = hash.match(/^product\/(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function withVisuals(product) {
  const baseVisuals = Array.isArray(product?.visuals)
    ? product.visuals.filter(Boolean)
    : [];
  if (product?.img && !baseVisuals.includes(product.img)) baseVisuals.unshift(product.img);
  while (baseVisuals.length < 3 && baseVisuals.length > 0) {
    baseVisuals.push(baseVisuals[baseVisuals.length % (baseVisuals.length || 1)]);
  }
  return { ...product, visuals: baseVisuals };
}

export default function App() {
  const [view, setView] = useState(getViewFromUrl);
  const [cart, setCart] = useState(() => {
    try {
      const s = localStorage.getItem("stickerstreet_cart");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [prod, setProd] = useState(null);
  const [products, setProducts] = useState(PRODUCTS);
  const [banners, setBanners] = useState([]);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [msgs, setMsgs] = useState([{ from: "bot", text: "Salut ! 👋 Bienvenue chez StickerStreet. Dis-moi ce qu'il te faut !", time: "14:30" }]);
  const [ci, setCi] = useState("");
  const [pay, setPay] = useState("stars");
  const [design, setDesign] = useState(null);
  const [notif, setNotif] = useState("");
  const [atab, setAtab] = useState("orders");
  const [fade, setFade] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [tgTopOffset, setTgTopOffset] = useState(0);
  const [adminPin, setAdminPin] = useState(() => {
    try {
      return localStorage.getItem("stickerstreet_admin_pin") || "1234";
    } catch {
      return "1234";
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      const s = localStorage.getItem("stickerstreet_profile");
      return s ? JSON.parse(s) : { name: "", phone: "", address: "" };
    } catch {
      return { name: "", phone: "", address: "" };
    }
  });
  const [favorites, setFavorites] = useState(() => {
    try {
      const s = localStorage.getItem("stickerstreet_favorites");
      if (!s) return [];
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
  const longPress = useRef(null);

  const autoIsDark = () => { const h = new Date().getHours(); return h >= 19 || h < 6; };
  const [dark, setDark] = useState(autoIsDark);
  const t = THEMES[dark ? "dark" : "light"];

  useEffect(() => {
    document.documentElement.style.setProperty("--app-shell-bg", t.bg);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.bg);
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
    if (!tg) return;
    try {
      tg.ready?.();
      tg.expand?.();
      tg.setBackgroundColor?.(t.bg);
      tg.setHeaderColor?.(dark ? "#0D0F14" : "#FFFFFF");
    } catch {}
  }, [t.bg, dark]);

  useEffect(() => {
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
    if (!tg) {
      setTgTopOffset(0);
      return;
    }
    const computeOffset = () => {
      const safeTop = Number(tg?.safeAreaInset?.top || 0);
      // Place le contenu juste sous la zone "heure/réseau + Fermer" de Telegram.
      const offset = Math.max(52, safeTop + 28);
      setTgTopOffset(offset);
    };
    computeOffset();
    tg.onEvent?.("viewportChanged", computeOffset);
    return () => tg.offEvent?.("viewportChanged", computeOffset);
  }, []);

  const notify = useCallback((msg) => { setNotif(msg); setTimeout(() => setNotif(""), 2800); }, []);
  const go = useCallback((v, p = null) => {
    setFade(false);
    const hash = v === "product" && p?.id ? `#/product/${p.id}` : v === "home" ? "#/" : `#/${v}`;
    window.history.replaceState(null, "", hash);
    setTimeout(() => { setView(v); if (p) setProd(p); setFade(true); window.scrollTo(0, 0); }, 120);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const v = getViewFromUrl();
      setView(v);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (view === "admin" && !isAdmin) {
      window.history.replaceState(null, "", "#/");
      setView("home");
    }
  }, [view, isAdmin]);

  useEffect(() => {
    fetchProducts()
      .then((apiProducts) => {
        if (apiProducts?.length) {
          setProducts(apiProducts.map(withVisuals));
        } else {
          setProducts(PRODUCTS.map(withVisuals));
        }
      })
      .catch(() => setProducts(PRODUCTS.map(withVisuals)));
  }, []);

  useEffect(() => {
    fetchBanners().then((rows) => setBanners(Array.isArray(rows) ? rows : [])).catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    const pid = getProductIdFromUrl();
    if (view === "product" && pid) {
      const p = products.find((x) => x.id === pid);
      if (p) setProd(p);
    }
  }, [view, products]);

  useEffect(() => {
    try {
      localStorage.setItem("stickerstreet_profile", JSON.stringify(profile));
    } catch {}
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem("stickerstreet_cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem("stickerstreet_favorites", JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  const toggleFavorite = useCallback((productId) => {
    setFavorites((prev) => {
      const has = prev.includes(productId);
      const next = has ? prev.filter((id) => id !== productId) : [...prev, productId];
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "stickerstreet_admin_pin") {
        setAdminPin(e.newValue || "1234");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
    if (!tg) return;
    tg.ready?.();
    const applyProfile = (res) => {
      setProfile((p) => ({
        ...p,
        telegram_user_id: res.telegram_user_id,
        name: p.name || res.name,
        telegram_username: res.username,
      }));
      notify("Connexion automatique ✓");
    };
    const tryConnect = () => {
      const initData = tg?.initData;
      const unsafeUser = tg?.initDataUnsafe?.user;
      if (initData && String(initData).trim()) {
        authTelegramMiniapp(initData).then(applyProfile).catch(() => {});
        return true;
      }
      if (unsafeUser?.id) {
        authTelegramMiniapp(null, unsafeUser).then(applyProfile).catch(() => {});
        return true;
      }
      return false;
    };
    if (tryConnect()) return;
    const t1 = setTimeout(tryConnect, 400);
    const t2 = setTimeout(tryConnect, 900);
    const t3 = setTimeout(tryConnect, 1500);
    const t4 = setTimeout(tryConnect, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [notify]);

  useEffect(() => {
    if (view === "admin") {
      fetchOrders().then(setOrders).catch(() => setOrders([]));
    } else if (profile?.telegram_user_id) {
      fetchOrders(profile.telegram_user_id).then(setOrders).catch(() => setOrders([]));
    }
  }, [view, profile?.telegram_user_id]);

  useEffect(() => {
    if (view !== "chat") return;
    fetchChat().then(setMsgs).catch(() => {});
    const iv = setInterval(() => fetchChat().then(setMsgs).catch(() => {}), 4000);
    return () => clearInterval(iv);
  }, [view]);

  const addCart = useCallback((p, sz, q = 1, d = null) => {
    const priceInfo = getPriceForSize(p, sz);
    setCart((prev) => {
      const e = prev.find((i) => i.id === p.id && i.sz === sz);
      if (e) return prev.map((i) => (i.id === p.id && i.sz === sz ? { ...i, qty: i.qty + q } : i));
      return [...prev, { ...p, sz, qty: q, dsgn: d, price: priceInfo.price, ton: priceInfo.ton, xof: priceInfo.xof }];
    });
    notify(`${p.name} ajouté ✓`);
  }, [notify]);

  const rmCart = useCallback((i) => setCart((p) => p.filter((_, x) => x !== i)), []);
  const updQty = useCallback((i, q) => { if (q < 1) return; setCart((p) => p.map((it, x) => (x === i ? { ...it, qty: q } : it))); }, []);

  const totalXof = cart.reduce((s, i) => s + i.xof * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  const sendMsg = useCallback(async () => {
    if (!ci.trim()) return;
    const txt = ci;
    setCi("");
    setMsgs((p) => [...p, { from: "user", text: txt, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) }]);
    try {
      const messages = await postChatMessage(txt);
      setMsgs(messages);
    } catch (err) {
      setMsgs((p) => [...p, { from: "bot", text: (err.message || "Erreur d'envoi. Vérifie ta connexion et l'URL de l'API.") + " Réessaie ou contacte-nous via Telegram.", time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) }]);
    }
  }, [ci]);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const checkout = useCallback(async () => {
    if (!cart.length) return;
    setCheckoutLoading(true);
    const items = cart.map((i) => ({ id: i.id, name: i.name, emoji: i.emoji, qty: i.qty, sz: i.sz, price: i.price, ton: i.ton, xof: i.xof }));
    try {
      const order = await createOrder(items, profile);
      const orderWithImg = { ...order, items: order.items?.map((it) => ({ ...it, img: cart.find((c) => c.id === it.id)?.img ?? PRODUCTS.find((p) => p.id === it.id)?.img })) ?? [] };
      setOrders((p) => [orderWithImg, ...p]);
      setCart([]);
      notify("Commande confirmée 🎉");
      go("orders");
    } catch (err) {
      notify("Erreur : " + (err.message || "Réessaie ou contacte le support"));
    } finally {
      setCheckoutLoading(false);
    }
  }, [cart, profile, notify, go]);

  const handleUpdateOrderStatus = useCallback(async (orderId, status) => {
    try {
      await updateOrderStatus(orderId, status);
    } catch (err) {
      notify("Erreur mise à jour statut");
    }
  }, [notify]);

  const handleCreateProduct = useCallback(async (payload) => {
    const created = await createProduct(payload);
    const finalProd = withVisuals(created);
    setProducts((prev) => [...prev, finalProd]);
    notify("Produit ajouté ✓");
    return finalProd;
  }, [notify]);

  const handleUpdateProduct = useCallback(async (productId, payload) => {
    const updated = await patchProduct(productId, payload);
    const finalProd = withVisuals(updated);
    setProducts((prev) => prev.map((p) => (p.id === productId ? finalProd : p)));
    setProd((prev) => (prev?.id === productId ? finalProd : prev));
    notify("Produit modifié ✓");
    return finalProd;
  }, [notify]);

  const handleDeleteProduct = useCallback(async (productId) => {
    await removeProduct(productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setProd((prev) => (prev?.id === productId ? null : prev));
    notify("Produit supprimé ✓");
  }, [notify]);

  const handleCreateBanner = useCallback(async (payload) => {
    const created = await createBanner(payload);
    setBanners((prev) => [...prev, created]);
    notify("Bannière ajoutée ✓");
    return created;
  }, [notify]);

  const handleUpdateBanner = useCallback(async (bannerId, payload) => {
    const updated = await patchBanner(bannerId, payload);
    setBanners((prev) => prev.map((b) => (b.id === bannerId ? updated : b)));
    notify("Bannière modifiée ✓");
    return updated;
  }, [notify]);

  const handleDeleteBanner = useCallback(async (bannerId) => {
    await removeBanner(bannerId);
    setBanners((prev) => prev.filter((b) => b.id !== bannerId));
    notify("Bannière supprimée ✓");
  }, [notify]);

  const handleUploadImage = useCallback(async (file, folder = "uploads") => {
    const res = await uploadBlobImage(file, folder);
    if (!res?.url) throw new Error("URL image introuvable");
    return res.url;
  }, []);

  const handleChangeAdminPin = useCallback((newPin) => {
    const normalized = String(newPin || "").replace(/\D/g, "").slice(0, 4);
    if (normalized.length !== 4) throw new Error("Le PIN doit faire 4 chiffres");
    try {
      localStorage.setItem("stickerstreet_admin_pin", normalized);
    } catch {}
    setAdminPin(normalized);
    setIsAdmin(false);
    setPin("");
    setShowPin(false);
  }, []);

  const fp = filter === "all" ? products : products.filter((p) => p.cat === filter);
  const homeBanners = banners.filter((b) => (b.section || "home") === "home" && b.active && b.image);

  const label = { fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 700, color: t.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, display: "block" };
  const titleStyle = { fontFamily: "'Poppins',sans-serif", fontSize: 24, fontWeight: 800, margin: "20px 0 18px", letterSpacing: -0.5, color: t.text };
  const pill = (active, ac = t.pillActive) => ({ flex: 1, padding: "11px 8px", background: active ? ac : t.pillBg, color: active ? t.pillActiveTxt : t.textSec, border: active ? "none" : `1px solid ${t.pillBorder}`, borderRadius: 14, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Poppins',sans-serif", transition: "all 0.2s", boxShadow: active ? "0 4px 12px rgba(0,0,0,0.12)" : "none" });
  const card = { background: t.card, borderRadius: 20, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadow };
  const segBtn = (active) => ({ flex: 1, padding: "12px 8px", background: active ? t.segActive : "transparent", color: active ? t.segActiveText : t.segInactive, border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif", transition: "all 0.2s", boxShadow: active ? t.shadow : "none" });
  const qBtn = { width: 44, height: 44, borderRadius: 14, background: t.bgAlt, border: `1px solid ${t.cardBorder}`, color: t.text, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" };
  const sqBtn = { width: 28, height: 28, borderRadius: 8, background: t.bgAlt, border: `1px solid ${t.cardBorder}`, color: t.text, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

  const LoadingFallback = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, color: t.textMuted }}>Chargement…</div>
  );

  return (
    <div className="app-container" style={{ fontFamily: "'Poppins',sans-serif", background: t.bg, color: t.text, minHeight: "100vh", margin: "0 auto", position: "relative", paddingTop: tgTopOffset, paddingBottom: 90, transition: "background 0.3s, color 0.3s" }}>
      <div className="grain-overlay" aria-hidden="true" />
      <Suspense fallback={null}>
        <AddToHomeScreen theme={t} />
      </Suspense>
      {notif && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: t.notifBg, color: t.notifColor, padding: "14px 28px", borderRadius: 50, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: t.shadowStrong, animation: "notifIn 0.3s ease", whiteSpace: "nowrap" }}>{notif}</div>}

      {showPin && (
        <div style={{ position: "fixed", inset: 0, background: t.modalOverlay, backdropFilter: "blur(8px)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeUp 0.2s ease" }} onClick={() => { setShowPin(false); setPin(""); }}>
          <div style={{ background: t.modalBg, borderRadius: 24, padding: "32px 28px", width: "100%", maxWidth: 320, boxShadow: t.shadowStrong }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <span style={{ fontSize: 48 }}>{S.lock}</span>
              <h3 style={{ fontWeight: 800, fontSize: 20, margin: "12px 0 6px" }}>Accès Admin</h3>
              <p style={{ fontFamily: "'Inter',sans-serif", color: t.textMuted, fontSize: 13, margin: 0 }}>Entre le code PIN pour accéder au panel</p>
            </div>
            <input
              type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setPin(v);
                if (v.length === 4) {
                  if (v === adminPin) { setIsAdmin(true); setShowPin(false); setPin(""); go("admin"); notify(adminPin === "1234" ? "⚠️ PIN par défaut ! Change-le dans Admin → Réglages" : "Mode admin activé 🔓"); }
                  else { setPin(""); notify("Code incorrect ❌"); }
                }
              }}
              placeholder="• • • •"
              style={{ width: "100%", padding: "16px 20px", background: t.inputBg, border: `2px solid ${t.inputBorder}`, borderRadius: 16, fontFamily: "'Inter',sans-serif", fontSize: 28, textAlign: "center", color: t.text, outline: "none", letterSpacing: 12, fontWeight: 700 }}
            />
            <p style={{ fontFamily: "'Inter',sans-serif", color: "#D1D5DB", fontSize: 11, textAlign: "center", marginTop: 12, marginBottom: 0 }}>Modifie le PIN dans le panel Admin</p>
          </div>
        </div>
      )}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: t.headerBg, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${t.cardBorderLight}`, transition: "background 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {view !== "home" && <button onClick={() => go("home")} style={{ background: t.bgAlt, border: "none", width: 34, height: 34, borderRadius: 10, fontSize: 20, fontWeight: 300, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.text }}>{S.back}</button>}
          <div
            onTouchStart={() => { longPress.current = setTimeout(() => setShowPin(true), 2000); }}
            onTouchEnd={() => clearTimeout(longPress.current)}
            onMouseDown={() => { longPress.current = setTimeout(() => setShowPin(true), 2000); }}
            onMouseUp={() => clearTimeout(longPress.current)}
            onMouseLeave={() => clearTimeout(longPress.current)}
            style={{ cursor: "pointer", userSelect: "none" }}
          >
            <h1 style={{ margin: 0, fontWeight: 900, fontSize: 18, letterSpacing: -0.4, lineHeight: 1 }}>
              <span style={{ color: "#FF3B5C" }}>STICKER</span><span>STREET</span>
              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: isAdmin ? "#F59E0B" : "#00C48C", marginLeft: 4, verticalAlign: "super" }} />
            </h1>
            <p style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 9, color: t.textMuted, letterSpacing: 2.2, fontWeight: 500 }}>PRINT · STICK · REP</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setDark(!dark)} style={{ background: t.bgAlt, border: "none", width: 36, height: 36, borderRadius: 11, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: dark ? "#F59E0B" : t.textSec, transition: "all 0.3s" }}>{dark ? S.sun : S.moon}</button>
          <button onClick={() => go("favorites")} style={{ background: "none", border: "none", width: 40, height: 40, borderRadius: 12, fontSize: 20, cursor: "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: view === "favorites" ? "#FF3B5C" : favorites.length > 0 ? "#FF3B5C" : t.textMuted, transition: "all 0.2s" }} title="Favoris">
            {S.heart}
            {favorites.length > 0 && <span style={{ position: "absolute", top: -2, right: -2, fontSize: 9, fontWeight: 800 }}>{favorites.length}</span>}
          </button>
          <button onClick={() => go("cart")} style={{ background: count > 0 ? "#FF3B5C" : t.bgAlt, border: "none", width: 40, height: 40, borderRadius: 12, fontSize: 20, cursor: "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
            <span style={{ fontSize: 18, color: count > 0 ? "#fff" : t.text, fontWeight: 700 }}>{S.cart}</span>
            {count > 0 && <span style={{ position: "absolute", top: -5, right: -5, background: t.badgeBg, color: t.badgeColor, fontSize: 10, fontWeight: 800, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${t.badgeBorder}`, animation: "popIn 0.3s ease" }}>{count}</span>}
          </button>
        </div>
      </header>

      <main style={{ padding: "0 16px 20px", opacity: fade ? 1 : 0, transform: fade ? "translateY(0)" : "translateY(8px)", transition: "all 0.15s ease" }}>
        {view === "home" && (
          <>
            {homeBanners.length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 14 }} className="banner-marquee">
                <div
                  className="banner-marquee-track"
                  style={{ "--banner-count": String(homeBanners.length) }}
                >
                  {[...homeBanners, ...homeBanners].map((b, i) => (
                    <img
                      key={`${b.id}-${i}`}
                      src={b.image}
                      alt={b.title || "Bannière"}
                      onClick={() => { if (b.link) window.open(b.link, "_blank", "noopener,noreferrer"); }}
                      style={{ cursor: b.link ? "pointer" : "default" }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "linear-gradient(135deg, #FF3B5C 0%, #FF6B6B 40%, #FFA07A 100%)", borderRadius: 24, padding: "32px 24px", marginTop: 16, marginBottom: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -30, right: -20, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
              <div style={{ position: "absolute", bottom: -40, right: 30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <div style={{ position: "absolute", top: 20, right: 24, fontSize: 60, opacity: 0.15, animation: "float 3s ease infinite", color: "#fff" }}>{S.tag}</div>
              <div style={{ position: "relative", zIndex: 2 }}>
                <div style={{ display: "inline-block", background: "rgba(255,255,255,0.2)", padding: "5px 14px", borderRadius: 50, fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 14, backdropFilter: "blur(4px)", letterSpacing: 0.5 }}>🔥 NOUVEAU</div>
                <h2 style={{ fontSize: 30, fontWeight: 900, color: "#fff", margin: "0 0 8px", lineHeight: 1.05, letterSpacing: -0.5 }}>{"Tes designs,\nimprimés en grand."}</h2>
                <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, margin: "0 0 20px", fontFamily: "'Inter',sans-serif", fontWeight: 400 }}>Stickers & flyers sur mesure, livrés chez toi.</p>
                <button onClick={() => window.scrollTo(0, 300)} style={{ background: "#fff", color: "#FF3B5C", border: "none", padding: "13px 26px", borderRadius: 14, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif", letterSpacing: 0.5, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>Explorer le catalogue →</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[{ k: "all", l: "Tout" }, { k: "stickers", l: "Stickers" }, { k: "flyers", l: "Flyers" }, { k: "cartes", l: "Cartes" }, { k: "photo", l: "Photo" }].map((c) => (
                <button key={c.k} onClick={() => setFilter(c.k)} style={pill(filter === c.k)}>{c.l}</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {fp.map((p, i) => (
                <div key={p.id} onClick={() => go("product", p)} style={{ ...card, overflow: "hidden", cursor: "pointer", animation: `fadeUp 0.4s ease ${i * 0.06}s both`, position: "relative" }}>
                  <div style={{ background: p.grad, height: 130, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    {p.img ? (
                      <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 44, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" }}>{p.emoji}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); notify(favorites.includes(p.id) ? "Retiré des favoris" : "Ajouté aux favoris ♥"); }} style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "none", color: favorites.includes(p.id) ? "#FF3B5C" : "rgba(255,255,255,0.9)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Favoris">{favorites.includes(p.id) ? S.heart : S.heartEmpty}</button>
                    {p.custom && <div style={{ position: "absolute", top: 10, left: 10, background: dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)", padding: "3px 8px", borderRadius: 8, fontSize: 9, fontWeight: 700, color: "#FF3B5C", letterSpacing: 0.8 }}>PERSO</div>}
                  </div>
                  <div style={{ padding: "14px 14px 16px" }}>
                    <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: t.text }}>{p.name}</h3>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 700 }}>{XOF_FMT(p.xof)}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); addCart(p, p.sizes?.[0] || "N/A"); }} style={{ width: 36, height: 36, borderRadius: 12, background: t.pillActive, color: t.pillActiveTxt, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: t.shadow, fontSize: 18, fontWeight: 300 }}>{S.plus}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === "product" && prod && (
          <Suspense fallback={<LoadingFallback />}>
            <ProductView p={prod} addCart={addCart} design={design} setDesign={setDesign} label={label} qBtn={qBtn} card={card} t={t} isFavorite={favorites.includes(prod.id)} toggleFavorite={() => toggleFavorite(prod.id)} />
          </Suspense>
        )}
        {view === "favorites" && (
          <Suspense fallback={<LoadingFallback />}>
            <FavoritesView products={products} favorites={favorites} toggleFavorite={toggleFavorite} onProductSelect={(p) => go("product", p)} go={go} title={titleStyle} card={card} t={t} />
          </Suspense>
        )}
        {view === "cart" && (
          <Suspense fallback={<LoadingFallback />}>
            <CartView cart={cart} totalXof={totalXof} pay={pay} setPay={setPay} rm={rmCart} updQty={updQty} checkout={checkout} checkoutLoading={checkoutLoading} title={titleStyle} segBtn={segBtn} sqBtn={sqBtn} card={card} t={t} profile={profile} />
          </Suspense>
        )}
        {view === "orders" && (
          <Suspense fallback={<LoadingFallback />}>
            <OrdersView orders={orders} title={titleStyle} card={card} t={t} />
          </Suspense>
        )}
        {view === "chat" && (
          <Suspense fallback={<LoadingFallback />}>
            <ChatView msgs={msgs} ci={ci} setCi={setCi} send={sendMsg} title={titleStyle} t={t} />
          </Suspense>
        )}
        {view === "admin" && isAdmin && (
          <Suspense fallback={<LoadingFallback />}>
            <AdminView
              orders={orders}
              setOrders={setOrders}
              prods={products}
              banners={banners}
              tab={atab}
              setTab={setAtab}
              title={titleStyle}
              segBtn={segBtn}
              card={card}
              t={t}
              onUpdateOrder={handleUpdateOrderStatus}
              onCreateProduct={handleCreateProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onCreateBanner={handleCreateBanner}
              onUpdateBanner={handleUpdateBanner}
              onDeleteBanner={handleDeleteBanner}
              onUploadImage={handleUploadImage}
              onChangeAdminPin={handleChangeAdminPin}
              notify={notify}
            />
          </Suspense>
        )}
        {view === "profil" && (
          <Suspense fallback={<LoadingFallback />}>
            <ProfilView profile={profile} setProfile={setProfile} banners={banners} isAdmin={isAdmin} setShowPin={setShowPin} setIsAdmin={setIsAdmin} go={go} notify={notify} title={titleStyle} card={card} t={t} />
          </Suspense>
        )}
      </main>

      <nav className="app-nav" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", display: "flex", justifyContent: "space-around", background: t.navBg, borderTop: `1px solid ${t.cardBorderLight}`, padding: "6px 0 14px", backdropFilter: "blur(20px)", zIndex: 100, transition: "background 0.3s" }}>
        {[{ id: "home", ic: "shop", l: "Shop" }, { id: "orders", ic: "orders", l: "Commandes" }, { id: "chat", ic: "chat", l: "Chat" }, isAdmin ? { id: "admin", ic: "settings", l: "Admin" } : { id: "profil", ic: "user", l: "Profil" }].map((t2) => (
          <button key={t2.id} onClick={() => go(t2.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 16px", position: "relative" }}>
            {view === t2.id && <div style={{ position: "absolute", top: -7, width: 20, height: 3, borderRadius: 2, background: "#FF3B5C" }} />}
            <span style={{ transition: "transform 0.2s", transform: view === t2.id ? "scale(1.15)" : "scale(1)", fontSize: 22, color: view === t2.id ? "#FF3B5C" : t.textMuted }}>{S[t2.ic]}</span>
            <span style={{ fontSize: 10, fontWeight: view === t2.id ? 700 : 500, color: view === t2.id ? "#FF3B5C" : t.textMuted, letterSpacing: 0.5, fontFamily: "'Poppins',sans-serif" }}>{t2.l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
