import { useState, useCallback, useEffect, useRef } from "react";
import { S } from "../data/constants";
import { authTelegram } from "../api";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "StickerStreetBot";

export default function ProfilView({ profile, setProfile, banners = [], isAdmin, setShowPin, setIsAdmin, go, notify, title, card, t }) {
  const secretTaps = useRef(0);
  const secretTimer = useRef(null);

  const handleSecretTap = useCallback(() => {
    secretTaps.current += 1;
    if (secretTimer.current) clearTimeout(secretTimer.current);
    if (secretTaps.current >= 5) {
      secretTaps.current = 0;
      setShowPin(true);
    } else {
      secretTimer.current = setTimeout(() => { secretTaps.current = 0; }, 1500);
    }
  }, [setShowPin]);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: profile.name || "", phone: profile.phone || "", address: profile.address || "" });
  const tgWidgetRef = useRef(null);
  const authCallbackRef = useRef(null);
  authCallbackRef.current = async (user) => {
    try {
      const res = await authTelegram(user);
      setProfile((p) => ({
        ...p,
        telegram_user_id: res.telegram_user_id,
        name: p.name || res.name,
        telegram_username: res.username,
      }));
      notify("Compte Telegram connecté ✓");
    } catch (err) {
      notify(err.message || "Erreur connexion Telegram");
    }
  };

  useEffect(() => {
    if (!tgWidgetRef.current) return;
    window.onTelegramAuth = (user) => authCallbackRef.current?.(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth");
    script.setAttribute("data-request-access", "write");
    tgWidgetRef.current.innerHTML = "";
    tgWidgetRef.current.appendChild(script);
    return () => { window.onTelegramAuth = null; };
  }, []);

  const handleSave = useCallback(() => {
    const next = { ...profile, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() };
    setProfile(next);
    setEdit(false);
    notify("Profil mis à jour ✓");
  }, [form, profile, setProfile, notify]);

  const openMiniApp = () => {
    window.open(`https://t.me/${BOT_USERNAME}`, "_blank");
    notify("Ouvre le bot Telegram pour lancer l'app et payer en Stars");
  };

  const profileBanners = (banners || []).filter((b) => (b.section || "home") === "profile" && b.active && b.image);
  const homeBanners = (banners || []).filter((b) => (b.section || "home") === "home" && b.active && b.image);
  const fallbackProfileBanners = [
    { id: "default-1", image: "/images/bipbip-banner1.png", title: "Bipbip Recharge Pro" },
    { id: "default-2", image: "/images/bipbip-banner2.png", title: "Bipbip Recharge Pro" },
    { id: "default-3", image: "/images/bipbip-banner3.png", title: "Bipbip Recharge Pro" },
  ];
  const bannersToShow = profileBanners.length ? profileBanners : homeBanners.length ? homeBanners : fallbackProfileBanners;

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <h2 style={title}>Mon profil</h2>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: "linear-gradient(135deg, #FF3B5C, #FFA07A)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(255,59,92,0.2)", marginBottom: 12, fontSize: 36, color: "#fff" }}>{S.user}</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{profile.name || "Client StickerStreet"}</div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textMuted, marginTop: 2 }}>{profile.phone || "—"} · {profile.address || "—"}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {edit ? (
          <>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6 }}>Nom</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ton nom complet"
                style={{ width: "100%", padding: "12px 14px", background: t.inputBg || t.bgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 12, color: t.text, fontSize: 14, fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6 }}>Téléphone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="07 01 23 45 67"
                style={{ width: "100%", padding: "12px 14px", background: t.inputBg || t.bgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 12, color: t.text, fontSize: 14, fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6 }}>Adresse de livraison</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Ville, quartier, repères"
                style={{ width: "100%", padding: "12px 14px", background: t.inputBg || t.bgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 12, color: t.text, fontSize: 14, fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} style={{ flex: 1, padding: "14px", background: "#FF3B5C", color: "#fff", border: "none", borderRadius: 14, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>Enregistrer</button>
              <button onClick={() => { setEdit(false); setForm({ name: profile.name || "", phone: profile.phone || "", address: profile.address || "" }); }} style={{ flex: 1, padding: "14px", background: t.bgAlt, color: t.textMuted, border: `1px solid ${t.cardBorder}`, borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>Annuler</button>
            </div>
          </>
        ) : (
          <div style={{ ...card, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Informations</span>
              <button onClick={() => { setForm({ name: profile.name || "", phone: profile.phone || "", address: profile.address || "" }); setEdit(true); }} style={{ padding: "8px 14px", background: t.bgAlt, color: t.textSec, border: "none", borderRadius: 10, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>Modifier</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "'Inter',sans-serif", fontSize: 14, color: t.textMuted }}>
              <div><strong style={{ color: t.text }}>Nom :</strong> {profile.name || "—"}</div>
              <div><strong style={{ color: t.text }}>Téléphone :</strong> {profile.phone || "—"}</div>
              <div><strong style={{ color: t.text }}>Adresse :</strong> {profile.address || "—"}</div>
            </div>
          </div>
        )}

        <div style={{ ...card, borderRadius: 16, padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 10 }}>Se connecter avec Telegram</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textMuted, marginBottom: 12 }}>Lie ton compte Telegram pour payer en Stars et lier tes commandes</div>
          {profile.telegram_user_id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: t.bgAlt, borderRadius: 12 }}>
              <span style={{ fontSize: 24 }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#00C48C" }}>Compte connecté</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>@{profile.telegram_username || "Telegram"}</div>
              </div>
            </div>
          ) : (
            <>
              {typeof window !== "undefined" && window.Telegram?.WebApp && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#0088CC18", borderRadius: 12, border: "1px solid #0088CC44" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#0088CC", marginBottom: 4 }}>Connexion automatique (comme sur Fragment)</div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec, lineHeight: 1.5 }}>Ouvre l'app depuis le bot : menu 🛒 à côté du champ de saisie, ou bouton « Ouvrir l'app StickerStreet » sous /start. Tu seras enregistré sans étape supplémentaire.</div>
                </div>
              )}
              <div ref={tgWidgetRef} style={{ minHeight: 44 }} />
              <div style={{ marginTop: 12, padding: "12px 14px", background: t.warn, borderRadius: 12, border: `1px solid ${t.warnBorder}` }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#E17055", marginBottom: 6 }}>Tu ne reçois pas le message de confirmation ?</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec, lineHeight: 1.5 }}>Le message arrive dans l'app Telegram (pas SMS). Vérifie : numéro au format international (+225 pour Côte d'Ivoire), section « Messages enregistrés » et que ton compte Telegram est actif.</div>
              </div>
            </>
          )}
        </div>
        <button onClick={openMiniApp} style={{ ...card, width: "100%", borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif", transition: "all 0.2s", border: "none" }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "#FFD70022", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>★</div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Payer en Stars</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textMuted }}>Ouvre l'app depuis le bot Telegram pour payer avec tes étoiles</div>
          </div>
          <span style={{ color: "#D1D5DB", fontSize: 18 }}>›</span>
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { icon: "box", label: "Mes commandes", desc: "Voir l'historique", action: () => go("orders") },
          { icon: "chat", label: "Contacter le support", desc: "Chat en direct ou bot Telegram", action: () => go("chat") },
        ].map((item, i) => (
          <div key={i} onClick={item.action} style={{ ...card, borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all 0.2s" }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: t.bgAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20, color: t.textSec }}>{S[item.icon]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{item.label}</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textMuted }}>{item.desc}</div>
            </div>
            <span style={{ color: "#D1D5DB", fontSize: 18 }}>›</span>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 28, padding: "18px 20px", ...card, borderRadius: 18, border: "2px solid #F59E0B33" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22, color: "#F59E0B" }}>{S.unlock}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#F59E0B" }}>Mode Admin actif</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textMuted }}>Accès au panel de gestion</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => go("admin")} style={{ padding: "8px 16px", borderRadius: 10, background: "#F59E0B18", color: "#F59E0B", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Poppins',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>Panel {S.settings}</button>
              <button onClick={() => { setIsAdmin(false); notify("Mode admin désactivé 🔒"); go("profil"); }} style={{ padding: "8px 14px", borderRadius: 10, background: t.bgAlt, color: t.textMuted, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>Quitter</button>
            </div>
          </div>
        </div>
      )}

      <div onClick={handleSecretTap} className="banner-marquee" style={{ marginTop: 28, width: "100%" }}>
        <div className="banner-marquee-track" style={{ "--banner-count": String(bannersToShow.length) }}>
          {[...bannersToShow, ...bannersToShow].map((b, i) => (
            <img key={`${b.id}-${i}`} src={b.image} alt={b.title || "Bannière Profil"} />
          ))}
        </div>
      </div>
    </div>
  );
}
