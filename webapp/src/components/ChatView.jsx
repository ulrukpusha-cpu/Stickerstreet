import { useEffect, useRef } from "react";
import { S } from "../data/constants";

export default function ChatView({ msgs, ci, setCi, send, title, t }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)", animation: "fadeUp 0.3s ease" }}>
      <h2 style={title}>Support <span style={{ color: "#00C48C" }}>en ligne</span></h2>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.textMuted, margin: "-8px 0 12px 0" }}>💬 Rejoins aussi notre bot Telegram pour le support</p>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "80%", padding: "13px 18px", borderRadius: 18, background: m.from === "user" ? "#FF3B5C" : t.card, color: m.from === "user" ? "#fff" : t.text, border: m.from === "user" ? "none" : `1px solid ${t.cardBorder}`, borderBottomRightRadius: m.from === "user" ? 4 : 18, borderBottomLeftRadius: m.from === "bot" ? 4 : 18, boxShadow: m.from === "user" ? "0 2px 12px rgba(255,59,92,0.2)" : t.shadow }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, lineHeight: 1.5 }}>{m.text}</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, textAlign: "right", marginTop: 4, color: m.from === "user" ? "rgba(255,255,255,0.65)" : t.textMuted }}>{m.time}</div>
            </div>
          </div>
        ))}
        <div ref={ref} />
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 10 }}>
        <input value={ci} onChange={(e) => setCi(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Écris ton message..." style={{ flex: 1, padding: "15px 18px", background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 16, fontFamily: "'Inter',sans-serif", fontSize: 15, color: t.text, outline: "none" }} />
        <button onClick={send} style={{ width: 52, height: 52, borderRadius: 16, background: "#FF3B5C", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(255,59,92,0.2)", flexShrink: 0, fontSize: 22, color: "#fff" }}>{S.send}</button>
      </div>
    </div>
  );
}
