import { useState, useEffect } from "react";

const A2HS_KEY = "stickerstreet_a2hs_dismissed";

export default function AddToHomeScreen({ theme }) {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Déjà installé (mode standalone)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    if (standalone) return;

    const dismissed = localStorage.getItem(A2HS_KEY);
    if (dismissed) return;

    // Mobile uniquement
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    if (ios) {
      setShow(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setShow(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(A2HS_KEY, Date.now().toString());
  };

  if (!show) return null;

  const t = theme || { card: "#1a1a1a", text: "#fff", textMuted: "#9ca3af", cardBorder: "#2d2d2d" };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        left: 16,
        right: 16,
        background: t.card,
        borderRadius: 20,
        border: `1px solid ${t.cardBorder}`,
        padding: "16px 18px",
        zIndex: 9990,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        animation: "slideUp 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <img src="/icon-192.png" alt="" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>Installer StickerStreet</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textMuted, lineHeight: 1.4 }}>
            {isIOS
              ? "Appuie sur le bouton Partager  puis « Sur l’écran d’accueil » pour ajouter l’app."
              : "Ajoute l’app sur ton écran d’accueil pour un accès rapide."}
          </p>
          {isIOS ? (
            <span style={{ fontSize: 24, marginTop: 6, display: "inline-block" }}>↑</span>
          ) : (
            <button
              onClick={handleInstall}
              style={{
                marginTop: 12,
                padding: "10px 20px",
                background: "#ff6b35",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Installer
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: "none",
            border: "none",
            color: t.textMuted,
            fontSize: 22,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
