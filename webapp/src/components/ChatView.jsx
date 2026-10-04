import { useEffect, useRef } from "react";
import Icon from "./Icon";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "StickerStreetBot";

export default function ChatView({ msgs, ci, setCi, send, hasSession, go }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  if (!hasSession) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="chat" size={32} /></div>
        <h3>Parle-nous sur Telegram</h3>
        <p>Le chat est lié à ton compte Telegram pour que nos réponses n'arrivent qu'à toi.</p>
        <a className="btn btn-telegram" href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer">
          <Icon name="telegram" size={18} /> Ouvrir @{BOT_USERNAME}
        </a>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => go("profil")}>Me connecter avec Telegram</button>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="chat-avatar">SS</div>
        <div>
          <b>Support StickerStreet</b>
          <span>Réponse en général dans la journée</span>
        </div>
      </div>
      <div className="chat-scroll" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.from === "user" ? "me" : "them"}`} style={m.pending ? { opacity: 0.7 } : undefined}>
            {m.text}
            <time>{m.time}</time>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" value={ci} onChange={(e) => setCi(e.target.value)} placeholder="Écris ton message…" aria-label="Message" maxLength={2000} />
        <button type="submit" className="btn btn-primary" disabled={!ci.trim()} aria-label="Envoyer"><Icon name="send" size={19} /></button>
      </form>
    </div>
  );
}
