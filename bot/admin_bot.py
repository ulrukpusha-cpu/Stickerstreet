"""
Bot Telegram « StickerStreet Admin » — réservé à l'équipe.

- Reçoit (via l'API) les notifications : commandes, paiements, messages et fichiers clients
- Support : répondre (glisser vers la gauche) à une notification 📩/📎 → la réponse part au client
  par le bot client @StickerStreetbot
- Boutons de statut sous chaque commande (le client est prévenu par l'API)
- Équipe : propriétaire (ADMIN_TELEGRAM_ID), rôles « admin » et « employe », invitations par lien

Commande : python admin_bot.py   (PM2 : stickerstreet-admin-bot)
"""
import logging
import os
import re
from datetime import date

import requests
from dotenv import load_dotenv

load_dotenv(override=True)
from telegram import (  # noqa: E402
    BotCommand, BotCommandScopeChat, BotCommandScopeDefault,
    InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, Update,
)
from telegram.ext import (  # noqa: E402
    Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters,
)

ADMIN_BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN", "").strip().strip('"').strip("'")
API_URL = os.getenv("STICKERSTREET_API", "http://127.0.0.1:5000")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip().strip('"').strip("'")
OWNER_IDS = [x.strip() for x in os.getenv("ADMIN_TELEGRAM_ID", "").split(",") if x.strip()]
WEBAPP_URL = os.getenv("STICKERSTREET_WEBAPP", "https://stickerstreet.ci")

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)   # les URL httpx contiennent le token
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger("admin_bot")

STATUSES = {
    "pending": "⏳ En attente", "confirmed": "✅ Confirmée", "production": "🖨 En production",
    "shipped": "📦 Expédiée", "delivered": "🎉 Livrée",
}
ROLE_LABELS = {"owner": "👑 Propriétaire", "admin": "🛡 Admin", "employe": "🧑‍🔧 Employé"}
_CLIENT_TAG = re.compile(r"#U(\d+)")


# ==================== API ====================
def _api(method, path, **kw):
    try:
        r = requests.request(method, f"{API_URL}{path}", headers={"X-Admin-Key": ADMIN_API_KEY}, timeout=20, **kw)
        try:
            body = r.json()
        except ValueError:
            body = {}
        return r.ok, body
    except Exception as e:
        logger.error(f"API {method} {path} : {e}")
        return False, {}


def role_of(user_id):
    if str(user_id) in OWNER_IDS:
        return "owner"
    ok, res = _api("GET", f"/api/staff/role/{user_id}")
    return res.get("role") if ok else None


def xof(v):
    return f"{int(v or 0):,} F".replace(",", " ")


# ==================== Clavier ====================
BTN_TODO, BTN_AWAIT, BTN_STATS = "🖨 À traiter", "⏳ Paiements en attente", "📊 Stats du jour"
BTN_TEAM, BTN_HELP = "👥 Équipe", "❓ Aide"


def keyboard(role):
    rows = [[BTN_TODO, BTN_AWAIT], [BTN_STATS, BTN_HELP]]
    if role in ("owner", "admin"):
        rows[1].insert(1, BTN_TEAM)
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True,
                               input_field_placeholder="Réponds à une notification 📩 pour écrire au client")


HELP = (
    "🛠 *StickerStreet Admin*\n\n"
    "• Les nouvelles commandes, paiements et messages clients arrivent ici.\n"
    "• *Répondre à un client* : glisse sa notification 📩 / 📎 vers la gauche (Répondre) puis écris.\n"
    "  La réponse part au client sur @StickerStreetbot.\n"
    "• *Statut d'une commande* : utilise les boutons sous la notification — le client est prévenu.\n\n"
    "/todo — Commandes à traiter\n"
    "/attente — Paiements en attente\n"
    "/stats — Chiffres du jour\n"
    "/equipe — Équipe et invitations (admins)\n"
)


# ==================== Garde d'accès ====================
async def guard(update: Update):
    """Retourne le rôle du membre, ou None (et répond) si la personne n'est pas de l'équipe."""
    role = role_of(update.effective_user.id)
    if not role:
        target = update.message or (update.callback_query and update.callback_query.message)
        if update.callback_query:
            await update.callback_query.answer("Accès réservé à l'équipe StickerStreet", show_alert=True)
        elif target:
            await target.reply_text("🔒 Bot réservé à l'équipe StickerStreet.\nDemande un lien d'invitation à un admin.")
    return role


# ==================== Commandes ====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if context.args:  # lien d'invitation t.me/<bot>?start=<code>
        ok, res = _api("POST", "/api/staff/join", json={
            "code": context.args[0], "telegram_user_id": user.id,
            "name": user.full_name, "username": user.username or "",
        })
        if not ok:
            await update.message.reply_text(f"❌ {res.get('error') or 'Invitation invalide.'}")
            return
        role = res.get("role")
        await update.message.reply_text(
            f"🎉 Bienvenue dans l'équipe StickerStreet, {user.first_name} !\nRôle : {ROLE_LABELS.get(role, role)}\n\n" + HELP,
            parse_mode="Markdown", reply_markup=keyboard(role),
        )
        for owner in OWNER_IDS:
            try:
                await context.bot.send_message(owner, f"👥 {user.full_name} (@{user.username or '—'}) a rejoint l'équipe — {ROLE_LABELS.get(role, role)}")
            except Exception:
                pass
        await set_commands_for(context.bot, user.id, role)
        return
    role = await guard(update)
    if not role:
        return
    await update.message.reply_text(f"{ROLE_LABELS.get(role, role)} — {HELP}", parse_mode="Markdown", reply_markup=keyboard(role))


def _orders():
    ok, res = _api("GET", "/api/orders")
    return res if ok and isinstance(res, list) else []


def _order_line(o):
    pay = {"awaiting": "⏳", "paid": "✅", "failed": "❌", "review": "⚠️"}.get(o.get("payment_status"), "")
    return f"• *{o['id']}* — {xof(o.get('totalXof'))} {pay} — {o.get('client_name') or '—'} — {STATUSES.get(o.get('status'), o.get('status'))}"


async def todo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await guard(update):
        return
    orders = [o for o in _orders() if o.get("status") in ("confirmed", "production")
              or (o.get("status") == "pending" and o.get("payment_status") in (None, "paid", "review"))]
    if not orders:
        await update.message.reply_text("🎉 Rien à traiter pour le moment.")
        return
    await update.message.reply_text("🖨 *À traiter*\n\n" + "\n".join(_order_line(o) for o in orders[:15]), parse_mode="Markdown")
    for o in orders[:5]:
        await update.message.reply_text(f"{o['id']} — statut actuel : {STATUSES.get(o.get('status'), o.get('status'))}",
                                        reply_markup=status_buttons(o["id"]))


async def awaiting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await guard(update):
        return
    orders = [o for o in _orders() if o.get("payment_status") in ("awaiting", "review")]
    text = "⏳ *Paiements en attente / à vérifier*\n\n" + ("\n".join(_order_line(o) for o in orders[:20]) if orders else "Aucun.")
    await update.message.reply_text(text, parse_mode="Markdown")


async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await guard(update):
        return
    orders, today = _orders(), date.today().isoformat()
    of_today = [o for o in orders if str(o.get("created_at") or o.get("date", "")).startswith(today)]
    paid_today = [o for o in orders if o.get("payment_status") == "paid" and str(o.get("paid_at", "")).startswith(today)]
    await update.message.reply_text(
        "📊 *Aujourd'hui*\n\n"
        f"🧾 Commandes créées : {len(of_today)}\n"
        f"💰 Encaissé (Jèko) : {xof(sum(int(o.get('totalXof') or 0) for o in paid_today))} ({len(paid_today)} paiement(s))\n"
        f"🖨 À produire : {sum(1 for o in orders if o.get('status') in ('confirmed', 'production'))}\n"
        f"📦 Total commandes : {len(orders)}",
        parse_mode="Markdown",
    )


# ==================== Statuts ====================
def status_buttons(order_id):
    b = lambda label, st: InlineKeyboardButton(label, callback_data=f"st:{order_id}:{st}"[:64])
    return InlineKeyboardMarkup([[b("✅ Confirmer", "confirmed"), b("🖨 Production", "production")],
                                 [b("📦 Expédiée", "shipped"), b("🎉 Livrée", "delivered")]])


async def on_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not await guard(update):
        return
    _, order_id, status = q.data.split(":", 2)
    ok, res = _api("PATCH", f"/api/orders/{order_id}/status", json={"status": status})
    if not ok:
        await q.answer(f"❌ {res.get('error') or 'Erreur'}", show_alert=True)
        return
    await q.answer(f"{order_id} → {STATUSES.get(status, status)} (client prévenu)")
    who = update.effective_user.first_name
    try:
        await q.message.reply_text(f"{STATUSES.get(status, status)} — {order_id} (par {who}). Le client a été prévenu.")
    except Exception:
        pass


# ==================== Support ====================
async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    role = await guard(update)
    if not role:
        return
    text = (update.message.text or "").strip()
    menu = {BTN_TODO: todo, BTN_AWAIT: awaiting, BTN_STATS: stats, BTN_TEAM: team, BTN_HELP: start}
    if text in menu:
        return await menu[text](update, context)
    replied = update.message.reply_to_message
    match = _CLIENT_TAG.search((replied.text or replied.caption or "") if replied else "")
    if not match:
        await update.message.reply_text("↩️ Pour écrire à un client, *réponds* (glisse vers la gauche) à sa notification 📩 ou 📎.",
                                        parse_mode="Markdown", reply_markup=keyboard(role))
        return
    ok, res = _api("POST", "/api/chat/reply", json={"telegram_user_id": int(match.group(1)), "text": text, "deliver": True})
    if not ok:
        await update.message.reply_text(f"❌ {res.get('error') or 'Envoi impossible.'}")
    elif res.get("delivered"):
        await update.message.reply_text("✅ Réponse envoyée au client (Telegram + chat de l'app).")
    else:
        await update.message.reply_text("✅ Réponse visible dans le chat de l'app (le client n'a pas démarré @StickerStreetbot).")


# ==================== Équipe ====================
async def team(update: Update, context: ContextTypes.DEFAULT_TYPE):
    role = await guard(update)
    if not role:
        return
    if role not in ("owner", "admin"):
        await update.message.reply_text("🔒 Réservé aux admins.")
        return
    ok, res = _api("GET", "/api/staff")
    members = res.get("staff", []) if ok else []
    lines = ["👥 *Équipe StickerStreet*\n", f"{ROLE_LABELS['owner']} : propriétaire ({len(OWNER_IDS)})"]
    lines += [f"{ROLE_LABELS.get(m.get('role'), m.get('role'))} : {m.get('name') or '—'} (@{m.get('username') or '—'})" for m in members]
    buttons = [[InlineKeyboardButton("➕ Inviter un employé", callback_data="inv:employe")]]
    if role == "owner":
        buttons[0].append(InlineKeyboardButton("➕ Inviter un admin", callback_data="inv:admin"))
    for m in members:
        if role == "owner" or m.get("role") == "employe":  # un admin ne retire que des employés
            buttons.append([InlineKeyboardButton(f"🗑 Retirer {m.get('name') or m.get('telegram_user_id')}",
                                                 callback_data=f"rm:{m.get('telegram_user_id')}")])
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(buttons))


async def on_team_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    role = await guard(update)
    if not role:
        return
    kind, arg = q.data.split(":", 1)
    if role not in ("owner", "admin") or (kind == "inv" and arg == "admin" and role != "owner"):
        await q.answer("🔒 Action réservée", show_alert=True)
        return
    if kind == "inv":
        ok, res = _api("POST", "/api/staff/invites", json={"role": arg, "created_by": update.effective_user.id})
        if not ok:
            await q.answer(f"❌ {res.get('error') or 'Erreur'}", show_alert=True)
            return
        link = f"https://t.me/{context.bot.username}?start={res['code']}"
        await q.answer()
        await q.message.reply_text(
            f"🔗 Lien d'invitation *{ROLE_LABELS.get(arg, arg)}* (usage unique, valable 24 h) :\n\n{link}\n\n"
            "Envoie-le à la personne : elle l'ouvre et appuie sur « Démarrer ».",
            parse_mode="Markdown", disable_web_page_preview=True,
        )
    elif kind == "rm":
        ok, res = _api("GET", f"/api/staff/role/{arg}")
        if role == "admin" and res.get("role") != "employe":
            await q.answer("🔒 Un admin ne peut retirer que des employés", show_alert=True)
            return
        ok, res = _api("DELETE", f"/api/staff/{arg}")
        await q.answer("✅ Retiré de l'équipe" if ok else f"❌ {res.get('error') or 'Erreur'}", show_alert=not ok)
        if ok:
            await q.message.reply_text(f"🗑 Membre {arg} retiré : il ne reçoit plus rien et n'a plus accès au bot.")


# ==================== Démarrage ====================
def commands_for(role):
    cmds = [BotCommand("start", "Accueil et aide"), BotCommand("todo", "Commandes à traiter"),
            BotCommand("attente", "Paiements en attente"), BotCommand("stats", "Chiffres du jour")]
    if role in ("owner", "admin"):
        cmds.append(BotCommand("equipe", "Équipe et invitations"))
    return cmds


async def set_commands_for(bot, chat_id, role):
    try:
        await bot.set_my_commands(commands_for(role), scope=BotCommandScopeChat(chat_id=int(chat_id)))
    except Exception as e:
        logger.warning(f"Commandes non configurées pour {chat_id}: {e}")


async def post_init(app):
    # Personne hors équipe ne voit de commande ; chaque membre reçoit son menu selon son rôle
    await app.bot.set_my_commands([BotCommand("start", "Accès équipe")], scope=BotCommandScopeDefault())
    for owner in OWNER_IDS:
        await set_commands_for(app.bot, owner, "owner")
    ok, res = _api("GET", "/api/staff")
    for m in (res.get("staff", []) if ok else []):
        await set_commands_for(app.bot, m.get("telegram_user_id"), m.get("role"))


def main():
    if not ADMIN_BOT_TOKEN:
        print("❌ ADMIN_BOT_TOKEN manquant dans bot/.env (python3 scripts/set-admin-bot-token.py)")
        raise SystemExit(78)
    app = Application.builder().token(ADMIN_BOT_TOKEN).post_init(post_init).build()
    app.add_handler(CommandHandler(["start", "aide", "help"], start))
    app.add_handler(CommandHandler("todo", todo))
    app.add_handler(CommandHandler("attente", awaiting))
    app.add_handler(CommandHandler("stats", stats))
    app.add_handler(CommandHandler("equipe", team))
    app.add_handler(CallbackQueryHandler(on_status, pattern=r"^st:"))
    app.add_handler(CallbackQueryHandler(on_team_action, pattern=r"^(inv|rm):"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE, on_text))
    print("🛠 Bot StickerStreet Admin en cours d'exécution…")
    app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)


if __name__ == "__main__":
    main()
