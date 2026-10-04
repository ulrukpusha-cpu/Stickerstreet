import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { THEMES } from "./data/themes";
import { PRODUCTS } from "./data/products";
import {
  fetchProducts, fetchBanners, uploadBlobImage, createProduct, patchProduct, removeProduct,
  createBanner, patchBanner, removeBanner, fetchOrders, fetchMyOrders, createOrder, updateOrderStatus,
  fetchChat, postChatMessage, authTelegramMiniapp, updateProfile,
  getSessionToken, setSessionToken, getAdminKey, setAdminKey, checkAdmin,
} from "./api";
import { getPriceForSize } from "./utils/productPrice";
import { getTelegramWebApp, applyTelegramChrome, syncTelegramThemeCssVars, getThemeParam } from "./utils/telegramWebApp";
import Icon from "./components/Icon";
import HomeView from "./components/HomeView";

const ProductView = lazy(() => import("./components/ProductView"));
const CartView = lazy(() => import("./components/CartView"));
const OrdersView = lazy(() => import("./components/OrdersView"));
const ChatView = lazy(() => import("./components/ChatView"));
const ProfilView = lazy(() => import("./components/ProfilView"));
const AdminView = lazy(() => import("./components/AdminView"));
const AddToHomeScreen = lazy(() => import("./components/AddToHomeScreen"));
const FavoritesView = lazy(() => import("./components/FavoritesView"));

const VALID_VIEWS = ["home", "profil", "orders", "chat", "cart", "admin", "product", "favorites"];
const LOCAL_ORDERS_KEY = "stickerstreet_orders";

function getViewFromUrl() {
  const hash = (window.location.hash || "#/").replace(/^#\/?/, "").toLowerCase();
  const view = hash.split("/").filter(Boolean)[0] || "home";
  return VALID_VIEWS.includes(view) ? view : "home";
}

function getProductIdFromUrl() {
  const m = (window.location.hash || "").replace(/^#\/?/, "").match(/^product\/(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function withVisuals(product) {
  const visuals = Array.isArray(product?.visuals) ? product.visuals.filter(Boolean) : [];
  if (product?.img && !visuals.includes(product.img)) visuals.unshift(product.img);
  return { ...product, visuals: [...new Set(visuals)] };
}

function readJson(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

const nowTime = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function App() {
  // telegram-web-app.js expose WebApp même dans un navigateur : on ne garde que la vraie Mini App.
  const rawTg = getTelegramWebApp();
  const tg = rawTg?.initData ? rawTg : null;
  const isTgMiniApp = !!tg;

  const [view, setView] = useState(getViewFromUrl);
  const [prod, setProd] = useState(null);
  const [products, setProducts] = useState(null);
  const [banners, setBanners] = useState([]);
  const [orders, setOrders] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [msgs, setMsgs] = useState([]);
  const [ci, setCi] = useState("");
  const [pay, setPay] = useState(isTgMiniApp ? "stars" : "momo");
  const [design, setDesign] = useState(null);
  const [notif, setNotif] = useState("");
  const [atab, setAtab] = useState("orders");
  const [cart, setCart] = useState(() => readJson("stickerstreet_cart", []));
  const [favorites, setFavorites] = useState(() => {
    const arr = readJson("stickerstreet_favorites", []);
    return Array.isArray(arr) ? arr : [];
  });
  const [profile, setProfile] = useState(() => readJson("stickerstreet_profile", { name: "", phone: "", address: "" }));
  const [hasSession, setHasSession] = useState(() => !!getSessionToken());
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminVia, setAdminVia] = useState("key");
  const [tgAdmin, setTgAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [adminChecking, setAdminChecking] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const longPress = useRef(null);
  const notifTimer = useRef(null);

  const [dark, setDark] = useState(() => {
    if (tg?.colorScheme === "dark" || tg?.colorScheme === "light") return tg.colorScheme === "dark";
    const saved = readJson("stickerstreet_theme", null);
    if (saved === "dark" || saved === "light") return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const t = THEMES[dark ? "dark" : "light"];

  const notify = useCallback((msg) => {
    setNotif(msg);
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotif(""), 2600);
  }, []);

  const go = useCallback((v, p = null) => {
    const hash = v === "product" && p?.id ? `#/product/${p.id}` : v === "home" ? "#/" : `#/${v}`;
    window.history.replaceState(null, "", hash);
    setView(v);
    if (p) setProd(p);
    window.scrollTo(0, 0);
  }, []);

  /* ---------- Thème & chrome Telegram ---------- */
  useEffect(() => {
    if (!tg) return;
    const onTheme = () => {
      setDark(tg.colorScheme === "dark");
      syncTelegramThemeCssVars(tg);
    };
    onTheme();
    tg.onEvent?.("themeChanged", onTheme);
    return () => tg.offEvent?.("themeChanged", onTheme);
  }, [tg]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
    if (!tg) return;
    const tp = tg.themeParams || {};
    applyTelegramChrome(tg, {
      backgroundColor: t.bg,
      headerColor: t.bg,
      bottomBarColor: getThemeParam(tp, "bottom_bar_bg_color") || t.card,
    });
  }, [dark, t, tg]);

  const toggleTheme = useCallback(() => {
    setDark((d) => {
      writeJson("stickerstreet_theme", d ? "light" : "dark");
      return !d;
    });
  }, []);

  /** Zones sûres Telegram (plein écran) → variables CSS utilisées par le header/nav. */
  useEffect(() => {
    if (!tg) return;
    const root = document.documentElement;
    const compute = () => {
      const top = Number(tg.safeAreaInset?.top || 0) + Number(tg.contentSafeAreaInset?.top || 0);
      const bottom = Math.max(Number(tg.safeAreaInset?.bottom || 0), Number(tg.contentSafeAreaInset?.bottom || 0));
      root.style.setProperty("--tg-top", `${top}px`);
      root.style.setProperty("--tg-bottom", `${bottom}px`);
    };
    compute();
    ["viewportChanged", "safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"].forEach((e) => tg.onEvent?.(e, compute));
    return () => ["viewportChanged", "safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"].forEach((e) => tg.offEvent?.(e, compute));
  }, [tg]);

  /* ---------- Navigation ---------- */
  useEffect(() => {
    const onHashChange = () => setView(getViewFromUrl());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (view === "admin" && !isAdmin) go("home");
  }, [view, isAdmin, go]);

  /** Bouton retour natif Telegram hors accueil. */
  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;
    const onBack = () => go("home");
    if (view === "home") back.hide?.();
    else back.show?.();
    back.onClick?.(onBack);
    return () => back.offClick?.(onBack);
  }, [tg, view, go]);

  /* ---------- Données ---------- */
  useEffect(() => {
    fetchProducts()
      .then((rows) => setProducts((rows?.length ? rows : PRODUCTS).map(withVisuals)))
      .catch(() => setProducts(PRODUCTS.map(withVisuals)));
    fetchBanners().then((rows) => setBanners(Array.isArray(rows) ? rows : [])).catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    const pid = getProductIdFromUrl();
    if (view === "product" && pid && products) {
      const p = products.find((x) => x.id === pid);
      if (p) setProd(p);
    }
  }, [view, products]);

  useEffect(() => writeJson("stickerstreet_profile", profile), [profile]);
  useEffect(() => writeJson("stickerstreet_cart", cart), [cart]);
  useEffect(() => writeJson("stickerstreet_favorites", favorites), [favorites]);

  const toggleFavorite = useCallback((productId) => {
    setFavorites((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  }, []);

  /* ---------- Session Telegram ---------- */
  const endSession = useCallback(() => {
    setSessionToken("");
    setHasSession(false);
    setTgAdmin(false);
  }, []);

  const applySession = useCallback((res) => {
    setHasSession(!!res?.token);
    setTgAdmin(!!res?.is_admin);
    const c = res?.client || {};
    setProfile((p) => ({
      ...p,
      telegram_user_id: res.telegram_user_id,
      telegram_username: res.username,
      name: p.name || c.name || res.name,
      phone: p.phone || c.phone || "",
      address: p.address || c.address || "",
    }));
  }, []);

  /** Mini App : connexion automatique avec initData (signé par Telegram, vérifié par l'API). */
  useEffect(() => {
    if (!tg?.initData) return;
    authTelegramMiniapp(tg.initData)
      .then((res) => {
        applySession(res);
        notify("Connecté avec Telegram ✓");
      })
      .catch(() => notify("Connexion Telegram impossible — réessaie plus tard"));
  }, [tg, applySession, notify]);

  /** Clé admin gardée pour l'onglet : on revérifie au chargement. */
  useEffect(() => {
    if (!getAdminKey()) return;
    checkAdmin().then((ok) => {
      if (ok) {
        setIsAdmin(true);
        setAdminVia("key");
      } else {
        setAdminKey("");
      }
    });
  }, []);

  /* ---------- Commandes ---------- */
  const mergeLocalOrders = useCallback((serverOrders) => {
    const local = readJson(LOCAL_ORDERS_KEY, []);
    const byId = new Map(local.map((o) => [o.id, o]));
    serverOrders.forEach((o) => byId.set(o.id, o));
    return [...byId.values()].sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date)));
  }, []);

  const loadMyOrders = useCallback(() => {
    if (!hasSession) {
      setOrders(mergeLocalOrders([]));
      return;
    }
    fetchMyOrders()
      .then((rows) => setOrders(mergeLocalOrders(rows)))
      .catch((err) => {
        if (err.status === 401) endSession();
        setOrders(mergeLocalOrders([]));
      });
  }, [hasSession, mergeLocalOrders, endSession]);

  useEffect(() => {
    if (view === "orders") loadMyOrders();
    if (view === "admin" && isAdmin) fetchOrders().then(setAdminOrders).catch(() => notify("Erreur chargement commandes"));
  }, [view, isAdmin, loadMyOrders, notify]);

  /* ---------- Chat ---------- */
  useEffect(() => {
    if (view !== "chat" || !hasSession) return;
    const load = () => fetchChat().then(setMsgs).catch((err) => { if (err.status === 401) endSession(); });
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [view, hasSession, endSession]);

  const sendMsg = useCallback(async () => {
    const txt = ci.trim();
    if (!txt) return;
    setCi("");
    setMsgs((p) => [...p, { from: "user", text: txt, time: nowTime(), pending: true }]);
    try {
      setMsgs(await postChatMessage(txt));
    } catch (err) {
      setMsgs((p) => [...p, { from: "bot", text: `${err.message || "Erreur d'envoi"}. Réessaie ou écris-nous directement sur Telegram.`, time: nowTime() }]);
    }
  }, [ci]);

  /* ---------- Panier ---------- */
  const addCart = useCallback((p, sz, q = 1, d = null) => {
    const priceInfo = getPriceForSize(p, sz);
    setCart((prev) => {
      const e = prev.find((i) => i.id === p.id && i.sz === sz);
      if (e) return prev.map((i) => (i.id === p.id && i.sz === sz ? { ...i, qty: i.qty + q } : i));
      return [...prev, { id: p.id, name: p.name, emoji: p.emoji, img: p.img, grad: p.grad, sz, qty: q, dsgn: d, price: priceInfo.price, ton: priceInfo.ton, xof: priceInfo.xof }];
    });
    notify(`${p.name} ajouté au panier`);
  }, [notify]);

  const rmCart = useCallback((i) => setCart((p) => p.filter((_, x) => x !== i)), []);
  const updQty = useCallback((i, q) => {
    if (q < 1) return;
    setCart((p) => p.map((it, x) => (x === i ? { ...it, qty: q } : it)));
  }, []);

  const totalXof = cart.reduce((s, i) => s + i.xof * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  const checkout = useCallback(async (payment = { payment_method: "momo" }) => {
    if (!cart.length) return;
    setCheckoutLoading(true);
    try {
      const order = await createOrder(cart, profile, payment);
      writeJson(LOCAL_ORDERS_KEY, [order, ...readJson(LOCAL_ORDERS_KEY, [])].slice(0, 30));
      setCart([]);
      notify("Commande enregistrée 🎉");
      go("orders");
    } catch (err) {
      notify(err.message || "Erreur, réessaie ou contacte le support");
    } finally {
      setCheckoutLoading(false);
    }
  }, [cart, profile, notify, go]);

  /** Paiement Stars confirmé par Telegram : la commande est créée par le bot à réception du paiement. */
  const onStarsPaid = useCallback(() => {
    setCart([]);
    notify("Paiement Stars reçu 🎉");
    go("orders");
    setTimeout(loadMyOrders, 2500);
  }, [notify, go, loadMyOrders]);

  const saveProfile = useCallback(async (next) => {
    setProfile(next);
    if (!hasSession) return;
    try {
      await updateProfile({ name: next.name, phone: next.phone, address: next.address });
    } catch (err) {
      if (err.status === 401) endSession();
    }
  }, [hasSession, endSession]);

  /* ---------- Admin ---------- */
  const openAdmin = useCallback(() => {
    if (isAdmin) return go("admin");
    if (tgAdmin) {
      setIsAdmin(true);
      setAdminVia("telegram");
      notify("Mode admin activé");
      return go("admin");
    }
    setShowAdminLogin(true);
  }, [isAdmin, tgAdmin, go, notify]);

  const submitAdminKey = useCallback(async (e) => {
    e?.preventDefault();
    const key = adminKeyInput.trim();
    if (!key) return;
    setAdminChecking(true);
    setAdminKey(key);
    const ok = await checkAdmin();
    setAdminChecking(false);
    if (!ok) {
      setAdminKey("");
      notify("Clé admin incorrecte");
      return;
    }
    setAdminKeyInput("");
    setShowAdminLogin(false);
    setIsAdmin(true);
    setAdminVia("key");
    notify("Mode admin activé");
    go("admin");
  }, [adminKeyInput, notify, go]);

  const logoutAdmin = useCallback(() => {
    setAdminKey("");
    setIsAdmin(false);
    notify("Mode admin désactivé");
    go("home");
  }, [notify, go]);

  const handleUpdateOrderStatus = useCallback(async (orderId, status) => {
    try {
      await updateOrderStatus(orderId, status);
    } catch {
      notify("Erreur mise à jour statut");
    }
  }, [notify]);

  const handleCreateProduct = useCallback(async (payload) => {
    const created = withVisuals(await createProduct(payload));
    setProducts((prev) => [...(prev || []), created]);
    notify("Produit ajouté ✓");
    return created;
  }, [notify]);

  const handleUpdateProduct = useCallback(async (productId, payload) => {
    const updated = withVisuals(await patchProduct(productId, payload));
    setProducts((prev) => (prev || []).map((p) => (p.id === productId ? updated : p)));
    setProd((prev) => (prev?.id === productId ? updated : prev));
    notify("Produit modifié ✓");
    return updated;
  }, [notify]);

  const handleDeleteProduct = useCallback(async (productId) => {
    await removeProduct(productId);
    setProducts((prev) => (prev || []).filter((p) => p.id !== productId));
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

  /* ---------- Styles hérités (vue admin à styles inline) ---------- */
  const titleStyle = { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, margin: "22px 0 16px", letterSpacing: "-0.02em", color: t.text };
  const card = { background: t.card, borderRadius: 20, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadow };
  const segBtn = (active) => ({ flex: 1, padding: "12px 8px", background: active ? t.segActive : "transparent", color: active ? t.segActiveText : t.segInactive, border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all 0.2s", boxShadow: active ? t.shadow : "none" });

  const startLongPress = () => { longPress.current = setTimeout(openAdmin, 1500); };
  const cancelLongPress = () => clearTimeout(longPress.current);

  const NAV = [
    { id: "home", icon: "shop", label: "Boutique" },
    { id: "orders", icon: "package", label: "Commandes" },
    { id: "chat", icon: "chat", label: "Support" },
    isAdmin ? { id: "admin", icon: "settings", label: "Admin" } : { id: "profil", icon: "user", label: "Profil" },
  ];

  return (
    <div className="app">
      <Suspense fallback={null}>
        <AddToHomeScreen theme={t} />
      </Suspense>

      {notif && <div className="toast" role="status">{notif}</div>}

      {showAdminLogin && (
        <div className="modal-backdrop" onClick={() => setShowAdminLogin(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submitAdminKey}>
            <div className="modal-icon"><Icon name="lock" size={26} /></div>
            <h3>Accès admin</h3>
            <p>Entre la clé admin (ADMIN_API_KEY). Elle est vérifiée par le serveur et oubliée à la fermeture de l'onglet.</p>
            <input
              className="input"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={adminKeyInput}
              onChange={(e) => setAdminKeyInput(e.target.value)}
              placeholder="Clé admin"
              aria-label="Clé admin"
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={adminChecking || !adminKeyInput.trim()}>
              {adminChecking ? "Vérification…" : "Déverrouiller"}
            </button>
          </form>
        </div>
      )}

      <header className="header">
        <div className="header-left">
          {view !== "home" && !isTgMiniApp && (
            <button className="icon-btn" onClick={() => go("home")} aria-label="Retour"><Icon name="back" size={20} /></button>
          )}
          <button
            className="logo"
            onClick={() => go("home")}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="StickerStreet — accueil"
          >
            <div className="logo-word"><b>STICKER</b>STREET</div>
            <div className="logo-tag"><span className={`logo-dot${isAdmin ? " admin" : ""}`} />PRINT · STICK · REP</div>
          </button>
        </div>
        <div className="header-right">
          <button className={`icon-btn${view === "favorites" ? " is-active" : ""}`} onClick={() => go("favorites")} aria-label="Favoris">
            <Icon name="heart" size={19} fill={favorites.length > 0} style={{ color: favorites.length > 0 ? "var(--brand)" : undefined }} />
          </button>
          <button className={`icon-btn${count > 0 ? " is-brand" : ""}`} onClick={() => go("cart")} aria-label={`Panier (${count})`}>
            <Icon name="bag" size={19} />
            {count > 0 && <span className="badge num">{count}</span>}
          </button>
        </div>
      </header>
      <div className="header-spacer" aria-hidden="true" />

      <main className="app-main" key={view}>
        {view === "home" && (
          <HomeView
            products={products}
            banners={banners}
            filter={filter}
            setFilter={setFilter}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
            addCart={addCart}
            openProduct={(p) => go("product", p)}
            notify={notify}
          />
        )}
        <Suspense fallback={<div className="empty"><div className="empty-icon skeleton" /></div>}>
          {view === "product" && prod && (
            <ProductView p={prod} addCart={addCart} design={design} setDesign={setDesign} isFavorite={favorites.includes(prod.id)} toggleFavorite={() => toggleFavorite(prod.id)} />
          )}
          {view === "favorites" && (
            <FavoritesView products={products || []} favorites={favorites} toggleFavorite={toggleFavorite} onProductSelect={(p) => go("product", p)} go={go} />
          )}
          {view === "cart" && (
            <CartView
              cart={cart} totalXof={totalXof} pay={pay} setPay={setPay} rm={rmCart} updQty={updQty}
              checkout={checkout} checkoutLoading={checkoutLoading} profile={profile} hasSession={hasSession}
              onStarsPaid={onStarsPaid} go={go} notify={notify}
            />
          )}
          {view === "orders" && <OrdersView orders={orders} go={go} />}
          {view === "chat" && <ChatView msgs={msgs} ci={ci} setCi={setCi} send={sendMsg} hasSession={hasSession} go={go} />}
          {view === "admin" && isAdmin && (
            <AdminView
              orders={adminOrders}
              setOrders={setAdminOrders}
              prods={products || []}
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
              onLogout={logoutAdmin}
              adminVia={adminVia}
              notify={notify}
            />
          )}
          {view === "profil" && (
            <ProfilView
              profile={profile}
              saveProfile={saveProfile}
              hasSession={hasSession}
              onSession={applySession}
              onLogout={() => { endSession(); setProfile((p) => ({ ...p, telegram_user_id: undefined, telegram_username: undefined })); notify("Déconnecté"); }}
              isAdmin={isAdmin}
              canAdmin={tgAdmin}
              dark={dark}
              toggleTheme={isTgMiniApp ? null : toggleTheme}
              openAdmin={openAdmin}
              go={go}
              notify={notify}
            />
          )}
        </Suspense>
      </main>

      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((item) => (
          <button key={item.id} className={`nav-item${view === item.id ? " is-active" : ""}`} onClick={() => go(item.id)} aria-current={view === item.id ? "page" : undefined}>
            <span className="nav-pill"><Icon name={item.icon} size={21} /></span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
