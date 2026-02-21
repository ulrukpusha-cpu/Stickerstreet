"""
Bot Telegram StickerStreet - Relié à l'API et à la webapp
Commande : python bot.py
"""
import json
import logging
import os
import requests
from dotenv import load_dotenv

load_dotenv()
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, MenuButtonWebApp
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ConversationHandler,
    PreCheckoutQueryHandler,
    ContextTypes,
    filters,
)

# Configuration
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_URL = os.getenv("STICKERSTREET_API", "http://localhost:5000")
WEBAPP_URL = os.getenv("STICKERSTREET_WEBAPP", "https://stickerstreet.vercel.app")
# Admins : un seul ID ou plusieurs séparés par des virgules (ex: 123,456,789)
_admin_ids = os.getenv("ADMIN_TELEGRAM_ID", "")
ADMIN_TELEGRAM_IDS = [str(x).strip() for x in _admin_ids.split(",") if x.strip()]
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip()
_admin_user_ids = [int(x) for x in ADMIN_TELEGRAM_IDS if x.isdigit()]

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ==================== API ====================
def api_get(path):
    try:
        headers = {"X-Admin-Key": ADMIN_API_KEY} if ADMIN_API_KEY else None
        r = requests.get(f"{API_URL}{path}", headers=headers, timeout=5)
        return r.json() if r.ok else None
    except Exception as e:
        logger.error(f"API GET error: {e}")
        return None


def api_post(path, data):
    try:
        headers = {"X-Admin-Key": ADMIN_API_KEY} if ADMIN_API_KEY else None
        r = requests.post(f"{API_URL}{path}", json=data, headers=headers, timeout=5)
        return r.json() if r.ok else None
    except Exception as e:
        logger.error(f"API POST error: {e}")
        return None


def api_patch(path, data):
    try:
        headers = {"X-Admin-Key": ADMIN_API_KEY} if ADMIN_API_KEY else None
        r = requests.patch(f"{API_URL}{path}", json=data, headers=headers, timeout=5)
        return r.json() if r.ok else None
    except Exception as e:
        logger.error(f"API PATCH error: {e}")
        return None


def _load_local_data():
    """Charge les données depuis data.json local si l'API est indisponible."""
    base = os.path.dirname(os.path.abspath(__file__))
    for p in [
        os.path.join(base, "..", "api", "data.json"),
        os.path.join(base, "..", "shared", "data.json"),
    ]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Lecture data.json échouée ({p}): {e}")
    return None


def get_products():
    """Récupère les produits via l'API, ou en fallback depuis data.json local."""
    products = api_get("/api/products")
    if products:
        return products
    data = _load_local_data()
    return data.get("products") if data else None


def get_statuses():
    """Récupère les statuts via l'API ou en fallback."""
    st = api_get("/api/statuses")
    if st:
        return st
    data = _load_local_data()
    return data.get("statuses", {}) if data else {}


def xof_fmt(v):
    return f"{int(v):,} F".replace(",", " ")


# ==================== Handlers ====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[
        InlineKeyboardButton("📱 Ouvrir l'app StickerStreet", web_app=WebAppInfo(url=WEBAPP_URL))
    ]]
    await update.message.reply_text(
        "👋 *Bienvenue chez STICKERSTREET !*\n\n"
        "Stickers, flyers et cartes de visite — imprimés sur mesure.\n\n"
        "👉 *Ouvre l'app* (bouton ci-dessous) pour commander et payer en Stars — connexion automatique.\n\n"
        "📌 *Commandes :*\n"
        "/catalog — Voir le catalogue\n"
        "/order — Passer une commande\n"
        "/orders — Mes commandes\n"
        "/register — Créer mon profil client\n"
        "/support — Contacter le support\n"
        "/start — Ce message",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def catalog(update: Update, context: ContextTypes.DEFAULT_TYPE):
    products = get_products()
    if not products:
        await update.message.reply_text("⚠️ Catalogue indisponible. Réessaie plus tard.")
        return

    cats = {}
    for p in products:
        c = p.get("cat", "other")
        if c not in cats:
            cats[c] = []
        cats[c].append(p)

    cat_names = {"stickers": "🏷️ Stickers", "flyers": "📄 Flyers", "cartes": "🪪 Cartes"}

    for cat, prods in cats.items():
        text = f"*{cat_names.get(cat, cat)}*\n\n"
        for p in prods[:5]:  # max 5 par catégorie dans le menu
            text += f"{p['emoji']} *{p['name']}* — {xof_fmt(p['xof'])}\n"
        text += "\n"
        await update.message.reply_text(text, parse_mode="Markdown")

    # Boutons pour voir un produit
    keyboard = []
    row = []
    for p in products[:6]:
        name_short = (p['name'][:12] + "…") if len(p.get('name', '')) > 12 else p.get('name', '')
        row.append(InlineKeyboardButton(f"{p['emoji']} {name_short}", callback_data=f"prod_{p['id']}"))
        if len(row) == 2:
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)
    keyboard.append([InlineKeyboardButton("📦 Voir tous les produits", callback_data="prod_list")])
    await update.message.reply_text("Choisis un produit :", reply_markup=InlineKeyboardMarkup(keyboard))


async def product_detail(update: Update, context: ContextTypes.DEFAULT_TYPE, pid: int):
    products = get_products()
    p = next((x for x in (products or []) if x["id"] == pid), None)
    if not p:
        await update.callback_query.answer("Produit introuvable")
        return

    text = (
        f"{p['emoji']} *{p['name']}*\n\n"
        f"{p.get('desc', '')}\n\n"
        f"💰 *Prix :* {xof_fmt(p['xof'])}\n"
        f"📐 *Tailles :* {', '.join(p.get('sizes', []))}\n"
        f"{'✨ Personnalisable' if p.get('custom') else ''}\n\n"
        f"Utilise /order pour commander."
    )
    sizes = p.get("sizes") or ["N/A"]
    sz0 = sizes[0].replace("×", "x")[:20]  # Telegram callback_data limit
    keyboard = [[InlineKeyboardButton("➕ Ajouter au panier", callback_data=f"add_{p['id']}_{sz0}")]]
    await update.callback_query.edit_message_text(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard))
    await update.callback_query.answer()


async def add_to_cart_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    parts = q.data.split("_", 2)  # add_1_8x8cm -> ['add','1','8x8cm']
    if len(parts) < 2:
        await q.answer("Erreur")
        return

    try:
        pid = int(parts[1])
    except ValueError:
        await q.answer("Erreur")
        return
    sz = parts[2] if len(parts) > 2 else ""
    products = get_products()
    p = next((x for x in (products or []) if x["id"] == pid), None)
    if not p:
        await q.answer("Produit introuvable")
        return

    if "cart" not in context.user_data:
        context.user_data["cart"] = []
    cart = context.user_data["cart"]
    existing = next((i for i in cart if i["id"] == pid and i.get("sz") == sz), None)
    if existing:
        existing["qty"] = existing.get("qty", 1) + 1
    else:
        cart.append({
            "id": p["id"],
            "name": p["name"],
            "emoji": p["emoji"],
            "qty": 1,
            "sz": sz or (p.get("sizes") or ["N/A"])[0],
            "price": p["price"],
            "ton": p["ton"],
            "xof": p["xof"],
        })
    await q.answer(f"✅ {p['name']} ajouté au panier !")
    await q.edit_message_text(f"✅ Ajouté ! Ton panier : {sum(i['qty'] for i in cart)} article(s). Utilise /order pour valider.")


async def order_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cart = context.user_data.get("cart", [])
    if not cart:
        await update.message.reply_text(
            "🛒 Ton panier est vide.\n"
            "Utilise /catalog pour parcourir les produits, puis ajoute-les au panier."
        )
        return

    total_xof = sum(i["xof"] * i["qty"] for i in cart)
    text = "🛒 *Ton panier*\n\n"
    for i in cart:
        text += f"• {i['emoji']} {i['name']} × {i['qty']} — {xof_fmt(i['xof'] * i['qty'])}\n"
    text += f"\n💰 *Total :* {xof_fmt(total_xof)}\n\n"
    text += "Pour valider ta commande, envoie *OUI* ou clique ci-dessous :"

    keyboard = [
        [InlineKeyboardButton("✅ Valider la commande", callback_data="order_confirm")],
        [InlineKeyboardButton("🗑 Annuler le panier", callback_data="order_cancel")],
    ]
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard))


async def order_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    cart = context.user_data.get("cart", [])
    if not cart:
        await q.answer("Panier vide")
        return

    items = [
        {
            "id": i["id"],
            "name": i["name"],
            "emoji": i.get("emoji", "📦"),
            "qty": i["qty"],
            "sz": i.get("sz", ""),
            "price": i["price"],
            "ton": i["ton"],
            "xof": i["xof"],
        }
        for i in cart
    ]
    order = api_post("/api/orders", {
        "items": items,
        "telegram_user_id": update.effective_user.id,
    })
    if order:
        context.user_data["cart"] = []
        momo = api_get("/api/momo") or []
        momo_lines = "\n".join(f"• {op['name']} : {op['num']}" for op in momo) if momo else "• Moov : 0171476415\n• Orange : 0714441413\n• MTN : 0564173232"
        await q.edit_message_text(
            f"🎉 *Commande validée !*\n\n"
            f"Numéro : *{order['id']}*\n"
            f"Total : {xof_fmt(order.get('totalXof', 0))}\n\n"
            f"Paiement (Mobile Money / Wave / Djamo) :\n{momo_lines}\n\n"
            f"Envoie le montant puis contacte le support pour confirmation.",
            parse_mode="Markdown",
        )
    else:
        await q.edit_message_text("❌ Erreur lors de la création de la commande. Réessaie ou contacte le support.")
    await q.answer()


async def order_cancel_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["cart"] = []
    await update.callback_query.edit_message_text("🗑 Panier vidé.")
    await update.callback_query.answer()


async def my_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    orders = api_get(f"/api/orders?telegram_user_id={update.effective_user.id}")
    if not orders:
        await update.message.reply_text("Tu n'as pas encore de commandes.")
        return

    statuses = get_statuses() or {}
    text = "📋 *Tes commandes*\n\n"
    for o in orders:
        st = statuses.get(o.get("status", "pending"), {})
        icon = st.get("icon", "📦")
        label = st.get("label", o.get("status", ""))
        text += f"{icon} *{o['id']}* — {label}\n"
        text += f"   {xof_fmt(o.get('totalXof', 0))} — {o.get('date', '')}\n\n"
    await update.message.reply_text(text, parse_mode="Markdown")


# ==================== Inscription client ====================
REGISTER_NAME, REGISTER_PHONE, REGISTER_ADDRESS = 1, 2, 3


async def register_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Démarre l'inscription : demande le nom."""
    context.user_data["register"] = {}
    await update.message.reply_text(
        "📝 *Inscription StickerStreet*\n\nEnregistre ton profil pour tes commandes.\n\nQuel est ton *nom complet* ?",
        parse_mode="Markdown",
    )
    return REGISTER_NAME


async def register_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    name = (update.message.text or "").strip()
    if not name:
        await update.message.reply_text("Entre ton nom s'il te plaît.")
        return REGISTER_NAME
    context.user_data["register"]["name"] = name
    await update.message.reply_text(
        "📱 Et ton *numéro de téléphone* ? (ex: 07 01 23 45 67)",
        parse_mode="Markdown",
    )
    return REGISTER_PHONE


async def register_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = (update.message.text or "").strip()
    context.user_data["register"]["phone"] = phone
    await update.message.reply_text(
        "📍 Et ton *adresse de livraison* ? (ville, quartier, repères)",
        parse_mode="Markdown",
    )
    return REGISTER_ADDRESS


async def register_address(update: Update, context: ContextTypes.DEFAULT_TYPE):
    address = (update.message.text or "").strip()
    context.user_data["register"]["address"] = address
    reg = context.user_data["register"]
    client = api_post("/api/register", {
        "telegram_user_id": update.effective_user.id,
        "name": reg["name"],
        "phone": reg.get("phone", ""),
        "address": address,
    })
    context.user_data.pop("register", None)
    if client:
        await update.message.reply_text(
            "✅ *Profil enregistré !*\n\n"
            f"📌 {reg['name']}\n"
            f"📱 {reg.get('phone', '-')}\n"
            f"📍 {address}\n\n"
            "Tu peux modifier tes infos avec /register à tout moment.",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            "❌ Erreur lors de l'enregistrement. Réessaie plus tard ou contacte le support.",
        )
    return ConversationHandler.END


async def register_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("register", None)
    await update.message.reply_text("Inscription annulée.")
    return ConversationHandler.END


async def support(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[
        InlineKeyboardButton("📱 Ouvrir l'app (connexion auto)", web_app=WebAppInfo(url=WEBAPP_URL))
    ]]
    await update.message.reply_text(
        "💬 *Support StickerStreet*\n\n"
        "Clique ci-dessous pour ouvrir l'app (connexion automatique) ou écris ton message ici.\n\n"
        "💡 *Admin :* Réponds ici aux messages des clients (webapp) — tes réponses s'afficheront dans le chat.",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def pre_checkout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Approuve la pré-vérification avant paiement Telegram Stars."""
    await update.pre_checkout_query.answer(ok=True)


async def successful_payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Après paiement Stars réussi, crée la commande via l'API."""
    payment = update.message.successful_payment
    payload = payment.invoice_payload
    if not payload:
        await update.message.reply_text("❌ Paiement reçu mais payload manquant. Contacte le support.")
        return
    order = api_post("/api/orders/from-invoice", {
        "invoice_id": payload,
        "invoice_payload": payload,
        "telegram_user_id": update.effective_user.id,
    })
    if order:
        momo = api_get("/api/momo") or []
        momo_lines = "\n".join(f"• {op['name']} : {op['num']}" for op in momo) if momo else "• Moov : 0171476415"
        await update.message.reply_text(
            f"🎉 *Paiement Stars reçu !*\n\n"
            f"Commande *{order['id']}* créée.\n"
            f"Montant : {payment.total_amount} ★\n\n"
            f"Tu recevras ta commande sous peu. Contacte le support en cas de question.",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text("❌ Erreur lors de la création de la commande. Réessaie ou contacte le support.")


async def admin_chat_reply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Quand l'admin envoie un message (non-commande), l'ajoute au chat support webapp."""
    if not ADMIN_TELEGRAM_IDS or str(update.effective_user.id) not in ADMIN_TELEGRAM_IDS:
        await update.message.reply_text("Utilisez les commandes du menu pour naviguer. /support pour le support.")
        return
    text = (update.message.text or "").strip()
    if not text:
        return
    ok = api_post("/api/chat/reply", {"text": text})
    if ok is not None:
        await update.message.reply_text("✅ Réponse envoyée au chat webapp.")
    else:
        await update.message.reply_text("❌ Erreur envoi. Vérifie que l'API est accessible.")


async def _fallback_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Message texte non capturé — redirige vers les commandes."""
    await update.message.reply_text(
        "💡 Utilise les commandes pour naviguer :\n"
        "/start · /catalog · /order · /orders · /support"
    )


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = update.callback_query.data
    if data == "order_confirm":
        await order_confirm_callback(update, context)
    elif data == "order_cancel":
        await order_cancel_callback(update, context)
    elif data.startswith("add_"):
        await add_to_cart_callback(update, context)
    elif data.startswith("prod_"):
        suf = data[5:]
        if suf == "list":
            await update.callback_query.answer("Utilise /catalog pour la liste complète", show_alert=False)
        else:
            try:
                await product_detail(update, context, int(suf))
            except ValueError:
                await update.callback_query.answer("Erreur")


async def post_init(app):
    """Configure le bouton Menu principal pour ouvrir la webapp (initData inclus)."""
    try:
        await app.bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="🛒 StickerStreet", web_app=WebAppInfo(url=WEBAPP_URL)))
    except Exception as e:
        logger.warning(f"Menu button non configuré: {e}")


def main():
    if not BOT_TOKEN:
        print("❌ Configure TELEGRAM_BOT_TOKEN (variable d'environnement ou .env)")
        print("   Ex: TELEGRAM_BOT_TOKEN=123456:ABC-DEF python bot.py")
        return

    app = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    conv_register = ConversationHandler(
        entry_points=[CommandHandler("register", register_start)],
        states={
            REGISTER_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, register_name)],
            REGISTER_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, register_phone)],
            REGISTER_ADDRESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, register_address)],
        },
        fallbacks=[CommandHandler("cancel", register_cancel)],
    )
    app.add_handler(PreCheckoutQueryHandler(pre_checkout))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment))
    app.add_handler(conv_register)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("catalog", catalog))
    app.add_handler(CommandHandler("order", order_start))
    app.add_handler(CommandHandler("orders", my_orders))
    app.add_handler(CommandHandler("support", support))
    if _admin_user_ids:
        app.add_handler(MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.User(user_id=_admin_user_ids),
            admin_chat_reply,
        ))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, _fallback_text))
    app.add_handler(CallbackQueryHandler(callback_handler))

    print("🤖 Bot StickerStreet en cours d'exécution...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
