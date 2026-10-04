import { useState, useCallback, useEffect, useRef } from "react";
import Icon from "./Icon";
import { authTelegram } from "../api";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "StickerStreetBot";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "SS";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function ProfilView({ profile, saveProfile, hasSession, onSession, onLogout, isAdmin, canAdmin, openAdmin, dark, toggleTheme, go, notify }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: profile.name || "", phone: profile.phone || "", address: profile.address || "" });
  const taps = useRef(0);
  const tapTimer = useRef(null);
  const widgetRef = useRef(null);
  const onAuthRef = useRef(null);
  const inMiniApp = !!window.Telegram?.WebApp?.initData;

  /** 5 taps sur l'avatar : accès admin discret (comme avant). */
  const onAvatarTap = useCallback(() => {
    taps.current += 1;
    clearTimeout(tapTimer.current);
    if (taps.current >= 5) {
      taps.current = 0;
      openAdmin();
    } else {
      tapTimer.current = setTimeout(() => { taps.current = 0; }, 1500);
    }
  }, [openAdmin]);

  onAuthRef.current = async (user) => {
    try {
      onSession(await authTelegram(user));
      notify("Compte Telegram connecté ✓");
    } catch (err) {
      notify(err.message || "Erreur connexion Telegram");
    }
  };

  /** Widget de connexion Telegram (navigateur uniquement ; dans la Mini App la connexion est automatique). */
  useEffect(() => {
    if (hasSession || inMiniApp || !widgetRef.current) return;
    window.onTelegramAuth = (user) => onAuthRef.current?.(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    widgetRef.current.replaceChildren(script);
    return () => { window.onTelegramAuth = null; };
  }, [hasSession, inMiniApp]);

  const handleSave = async (e) => {
    e.preventDefault();
    await saveProfile({ ...profile, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() });
    setEdit(false);
    notify("Profil mis à jour ✓");
  };

  const startEdit = () => {
    setForm({ name: profile.name || "", phone: profile.phone || "", address: profile.address || "" });
    setEdit(true);
  };

  return (
    <div>
      <div className="profile-head">
        <button className="avatar" onClick={onAvatarTap} aria-label="Avatar">{initials(profile.name)}</button>
        <div>
          <b>{profile.name || "Bienvenue 👋"}</b>
          <span>{profile.telegram_username ? `@${profile.telegram_username}` : hasSession ? "Compte Telegram lié" : "Invité"}</span>
        </div>
      </div>

      <div className="stack">
        <section className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="eyebrow" style={{ margin: 0 }}>Livraison</span>
            {!edit && <button className="btn btn-ghost btn-sm" onClick={startEdit}>Modifier</button>}
          </div>
          {edit ? (
            <form className="stack" onSubmit={handleSave}>
              <label className="field"><span>Nom complet</span><input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Awa Koné" autoComplete="name" maxLength={120} /></label>
              <label className="field"><span>Téléphone</span><input className="input" type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="07 01 23 45 67" autoComplete="tel" maxLength={40} /></label>
              <label className="field"><span>Adresse de livraison</span><input className="input" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Ville, quartier, repères" autoComplete="street-address" maxLength={300} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          ) : (
            <dl className="info-grid">
              <div><dt>Nom</dt><dd>{profile.name || "—"}</dd></div>
              <div><dt>Téléphone</dt><dd>{profile.phone || "—"}</dd></div>
              <div><dt>Adresse</dt><dd>{profile.address || "—"}</dd></div>
            </dl>
          )}
        </section>

        <section className="card" style={{ padding: 16 }}>
          <span className="eyebrow">Compte Telegram</span>
          {hasSession ? (
            <div className="connected">
              <Icon name="check" size={20} />
              <div style={{ flex: 1 }}>Connecté<small>Commandes, chat et paiements Stars liés à ton compte</small></div>
              {!inMiniApp && <button className="btn btn-ghost btn-sm" onClick={onLogout}>Déconnexion</button>}
            </div>
          ) : (
            <>
              <p className="muted" style={{ margin: "0 0 12px", fontSize: 13.5 }}>Connecte-toi pour suivre tes commandes, discuter avec le support et payer en Stars.</p>
              <div ref={widgetRef} style={{ minHeight: 44 }} />
              <a className="btn btn-telegram btn-block" style={{ marginTop: 10 }} href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer">
                <Icon name="telegram" size={18} /> Ouvrir l'app dans Telegram
              </a>
            </>
          )}
        </section>

        <nav className="card list">
          {[
            { icon: "package", label: "Mes commandes", desc: "Suivi et historique", action: () => go("orders") },
            { icon: "heart", label: "Favoris", desc: "Tes coups de cœur", action: () => go("favorites") },
            { icon: "chat", label: "Support", desc: "Une question sur ta commande ?", action: () => go("chat") },
            ...(toggleTheme ? [{ icon: dark ? "sun" : "moon", label: dark ? "Thème clair" : "Thème sombre", desc: "Apparence de l'app", action: toggleTheme }] : []),
            ...(isAdmin || canAdmin ? [{ icon: "settings", label: "Panel admin", desc: "Commandes, produits, bannières", action: openAdmin }] : []),
          ].map((item) => (
            <button key={item.label} className="list-row" onClick={item.action}>
              <span className="li-icon"><Icon name={item.icon} size={19} /></span>
              <div><b>{item.label}</b><small>{item.desc}</small></div>
              <Icon name="next" size={18} style={{ color: "var(--text-3)" }} />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
