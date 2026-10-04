"""
Bot Telegram StickerStreet - Relié à l'API et à la webapp
Commande : python bot.py
"""
import html
import json
import logging
import os
import re
import requests
from dotenv import load_dotenv

load_dotenv(override=True)  # priorité au .env (PM2 peut garder des valeurs CRLF dans dump.pm2)
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, MenuButtonWebApp, ReplyKeyboardMarkup,
    BotCommand, BotCommandScopeChat, BotCommandScopeDefault,
)
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
# Si le bot équipe « StickerStreet Admin » est configuré, ce bot-ci ne sert plus qu'aux clients
ADMIN_BOT_ENABLED = bool(os.getenv("ADMIN_BOT_TOKEN", "").strip().strip('"').strip("'"))
_admin_user_ids = [int(x) for x in ADMIN_TELEGRAM_IDS if x.isdigit()]

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)
# httpx logge chaque URL en INFO, token du bot compris : on le fait taire.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


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


def api_post_full(path, data):
    """Comme api_post mais renvoie (ok, json) pour pouvoir afficher l'erreur de l'API."""
    try:
        headers = {"X-Admin-Key": ADMIN_API_KEY} if ADMIN_API_KEY else None
        r = requests.post(f"{API_URL}{path}", json=data, headers=headers, timeout=25)
        try:
            body = r.json()
        except ValueError:
            body = {}
        return r.ok, body
    except Exception as e:
        logger.error(f"API POST error: {e}")
        return False, {}


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
    keyboard = [[InlineKeyboardButton("📱 Ouvrir l'app StickerStreet", web_app=WebAppInfo(url=WEBAPP_URL))]]
    await update.message.reply_text(
        "👋 *Bienvenue chez STICKERSTREET !*\n\n"
        "Stickers, flyers, cartes de visite, posters, t-shirts et art — imprimés sur mesure.\n\n"
        "💳 Paiement Mobile Money (Wave, Orange, MTN, Moov, Djamo) ou Stars ⭐\n\n"
        "📌 *Commandes :*\n"
        "/catalog — Voir le catalogue\n"
        "/order — Mon panier et paiement\n"
        "/orders — Suivre mes commandes\n"
        "/profil — Mes coordonnées de livraison\n"
        "/support — Écrire au support\n"
        "/app — Ouvrir la boutique\n\n"
        "👇 Ou utilise le clavier en bas de l'écran.",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    await update.message.reply_text("⌨️ Menu rapide activé 👇", reply_markup=MENU_KB)


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

    cat_names = {
        "stickers": "🏷️ Stickers", "flyers": "📄 Flyers", "cartes": "🪪 Cartes",
        "posters": "🖼️ Posters", "tshirts": "👕 T-shirts & textile", "art": "🎨 Art", "photo": "📷 Photo",
    }

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


JEKO_OPERATORS = {"wave": "🌊 Wave", "orange": "🟠 Orange Money", "mtn": "🟡 MTN MoMo", "moov": "🔵 Moov Money", "djamo": "💳 Djamo"}


async def order_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Validation du panier : choix de l'opérateur Mobile Money (paiement en ligne Jèko)."""
    q = update.callback_query
    if not context.user_data.get("cart"):
        await q.answer("Panier vide")
        return
    cfg = api_get("/api/payments/config") or {}
    if not (cfg.get("jeko") or {}).get("enabled"):
        await q.edit_message_text(
            "💳 Le paiement Mobile Money en ligne arrive très bientôt.\n\n"
            "En attendant, ouvre l'app pour payer en Stars ⭐ :",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("📱 Ouvrir l'app", web_app=WebAppInfo(url=WEBAPP_URL))]]),
        )
        await q.answer()
        return
    total = sum(i["xof"] * i["qty"] for i in context.user_data["cart"])
    ops = list(JEKO_OPERATORS.items())
    keyboard = [[InlineKeyboardButton(label, callback_data=f"jpay_{op}") for op, label in ops[k:k + 2]] for k in range(0, len(ops), 2)]
    keyboard.append([InlineKeyboardButton("↩️ Retour", callback_data="order_cancel_keep")])
    await q.edit_message_text(
        f"💳 *Paiement sécurisé Jèko*\n\nTotal : *{xof_fmt(total)}*\nChoisis ton moyen de paiement :",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    await q.answer()


async def jeko_pay_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Crée la commande + le lien de paiement Jèko pour l'opérateur choisi."""
    q = update.callback_query
    op = q.data.split("_", 1)[1]
    cart = context.user_data.get("cart", [])
    if not cart or op not in JEKO_OPERATORS:
        await q.answer("Panier vide")
        return
    await q.answer("Création du paiement…")
    ok, res = api_post_full("/api/payments/jeko", {
        "items": [{"id": i["id"], "sz": i.get("sz", ""), "qty": i["qty"]} for i in cart],
        "payment_method": op,
        "telegram_user_id": update.effective_user.id,
        "client_name": update.effective_user.full_name,
    })
    if not ok or not res.get("redirect_url"):
        await q.edit_message_text(f"❌ {res.get('error') or 'Paiement indisponible pour le moment.'} Réessaie avec /order.")
        return
    order = res["order"]
    context.user_data["cart"] = []
    await q.edit_message_text(
        f"🧾 *Commande {order['id']}* — {xof_fmt(order.get('totalXof', 0))}\n\n"
        f"Appuie sur le bouton pour payer avec {JEKO_OPERATORS[op]}.\n"
        f"Tu recevras un message ici dès que le paiement est confirmé ✅",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(f"💳 Payer {xof_fmt(order.get('totalXof', 0))}", url=res["redirect_url"])]]),
    )


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
    await update.message.reply_text(
        "💬 *Support StickerStreet*\n\n"
        "Écris ton message juste ici (texte libre) : il est transmis à l'équipe,\n"
        "et la réponse arrive dans cette conversation (et dans le chat de l'app).",
        parse_mode="Markdown",
        reply_markup=MENU_KB,
    )


async def client_support_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Texte libre d'un client → fil de support (même circuit que le chat de l'app)."""
    text = (update.message.text or "").strip()
    if not text:
        return
    ok, res = api_post_full("/api/chat", {
        "telegram_user_id": update.effective_user.id,
        "client_name": update.effective_user.full_name,
        "text": text,
    })
    if ok:
        await update.message.reply_text("✅ Message transmis au support. On te répond ici dès que possible.", reply_markup=MENU_KB)
    else:
        await update.message.reply_text(f"❌ {res.get('error') or 'Envoi impossible pour le moment.'} Réessaie dans un instant.", reply_markup=MENU_KB)


async def client_support_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Photo / fichier d'un client (ex. son design) → relayé à toute l'équipe par l'API (bot admin)."""
    user = update.effective_user
    if not ADMIN_BOT_ENABLED and str(user.id) in ADMIN_TELEGRAM_IDS:
        return
    msg = update.message
    media = msg.document or (msg.photo[-1] if msg.photo else None)
    filename = getattr(msg.document, "file_name", None) or f"photo_{msg.message_id}.jpg"
    mime = getattr(msg.document, "mime_type", None) or "image/jpeg"
    ok = False
    try:
        if getattr(media, "file_size", 0) and media.file_size > 20 * 1024 * 1024:
            raise ValueError("trop lourd")
        tg_file = await context.bot.get_file(media.file_id)
        blob = bytes(await tg_file.download_as_bytearray())
        r = requests.post(
            f"{API_URL}/api/support/file",
            headers={"X-Admin-Key": ADMIN_API_KEY},
            data={"telegram_user_id": user.id, "client_name": user.full_name},
            files={"file": (filename, blob, mime)},
            timeout=60,
        )
        ok = r.ok and r.json().get("ok")
    except Exception as e:
        logger.warning(f"Relais fichier client impossible: {e}")
    await msg.reply_text(
        "✅ Fichier transmis à l'équipe, on revient vers toi ici." if ok
        else "❌ Transfert impossible (max 20 Mo). Réessaie ou envoie-le par l'app.",
        reply_markup=MENU_KB,
    )


async def profile_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Affiche le profil client enregistré (coordonnées de livraison)."""
    p = api_get(f"/api/profile?telegram_user_id={update.effective_user.id}")
    if not p:
        await update.message.reply_text(
            "👤 Tu n'as pas encore de profil.\nEnvoie /register pour enregistrer nom, téléphone et adresse de livraison.",
            reply_markup=MENU_KB,
        )
        return
    await update.message.reply_text(
        "👤 *Mon profil*\n\n"
        f"Nom : {p.get('name') or '—'}\n"
        f"Téléphone : {p.get('phone') or '—'}\n"
        f"Adresse : {p.get('address') or '—'}\n\n"
        "Pour modifier : /register",
        reply_markup=MENU_KB,
    )


async def open_app(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Bouton inline (et non bouton de clavier) : seul ce type transmet la connexion Telegram à l'app
    await update.message.reply_text(
        "📱 La boutique s'ouvre ici, connexion automatique :",
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🛍️ Ouvrir StickerStreet", web_app=WebAppInfo(url=WEBAPP_URL))]]),
    )


async def admin_summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/admin : résumé des commandes (réservé aux ADMIN_TELEGRAM_ID)."""
    if str(update.effective_user.id) not in ADMIN_TELEGRAM_IDS:
        return
    if ADMIN_BOT_ENABLED:
        await update.message.reply_text("🛠 La gestion se fait maintenant dans le bot « StickerStreet Admin ».")
        return
    orders = api_get("/api/orders") or []
    today = __import__("datetime").date.today().isoformat()
    awaiting = [o for o in orders if o.get("payment_status") == "awaiting"]
    review = [o for o in orders if o.get("payment_status") == "review"]
    to_make = [o for o in orders if o.get("status") in ("confirmed", "production")]
    paid_today = sum(int(o.get("totalXof") or 0) for o in orders
                     if o.get("payment_status") == "paid" and str(o.get("paid_at", "")).startswith(today))
    lines = [
        "🛠 *Admin StickerStreet*\n",
        f"📦 Commandes : {len(orders)}",
        f"⏳ En attente de paiement : {len(awaiting)}",
        f"⚠️ Paiements à vérifier : {len(review)}",
        f"🖨 À produire (confirmées / en production) : {len(to_make)}",
        f"💰 Encaissé aujourd'hui (Jèko) : {xof_fmt(paid_today)}",
    ]
    if to_make:
        lines.append("\n*À produire :*")
        lines += [f"• {o['id']} — {xof_fmt(o.get('totalXof', 0))} — {o.get('client_name') or '—'}" for o in to_make[:8]]
    lines.append("\n💬 Messages clients : réponds (glisse vers la gauche) à leur notification 📩.")
    lines.append(f"🖥 Panel complet : {WEBAPP_URL} (profil → Panel admin)")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown", disable_web_page_preview=True)


async def pre_checkout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Avant paiement Stars : la facture doit exister côté API et le montant correspondre."""
    q = update.pre_checkout_query
    pending = api_get(f"/api/invoice/stars/{q.invoice_payload}") if q.invoice_payload else None
    if not pending:
        await q.answer(ok=False, error_message="Facture expirée. Relance le paiement depuis l'app.")
        return
    if q.currency != "XTR" or int(q.total_amount) != int(pending.get("stars") or 0):
        await q.answer(ok=False, error_message="Montant incohérent. Relance le paiement depuis l'app.")
        return
    await q.answer(ok=True)


async def successful_payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Après paiement Stars réussi, crée la commande via l'API."""
    payment = update.message.successful_payment
    payload = payment.invoice_payload
    if not payload:
        await update.message.reply_text("❌ Paiement reçu mais payload manquant. Contacte le support.")
        return
    order = api_post("/api/orders/from-invoice", {
        "invoice_id": payload,
        "telegram_user_id": update.effective_user.id,
        "paid_stars": payment.total_amount,
        "telegram_payment_charge_id": payment.telegram_payment_charge_id,
    })
    if order:
        await update.message.reply_text(
            f"🎉 *Paiement Stars reçu !*\n\n"
            f"Commande *{order['id']}* créée.\n"
            f"Montant : {payment.total_amount} ★\n\n"
            f"Tu recevras ta commande sous peu. Contacte le support en cas de question.",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text("❌ Erreur lors de la création de la commande. Réessaie ou contacte le support.")


_CLIENT_TAG = re.compile(r"#U(\d+)")


async def admin_chat_reply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """L'admin répond (swipe → Répondre) à une notification de chat : la réponse va au bon client."""
    text = (update.message.text or "").strip()
    if not text:
        return
    replied = update.message.reply_to_message
    match = _CLIENT_TAG.search((replied.text or replied.caption or "") if replied else "")
    if not match:
        await update.message.reply_text(
            "↩️ Pour répondre à un client, *réponds* (glisse vers la gauche) à sa notification 📩.",
            parse_mode="Markdown",
        )
        return
    client_id = int(match.group(1))
    ok = api_post("/api/chat/reply", {"telegram_user_id": client_id, "text": text})
    if ok is None:
        await update.message.reply_text("❌ Erreur envoi. Vérifie que l'API est accessible.")
        return
    try:
        await context.bot.send_message(client_id, f"💬 Support StickerStreet :\n\n{text}")
        await update.message.reply_text("✅ Réponse envoyée (chat de l'app + Telegram du client).")
    except Exception:
        await update.message.reply_text("✅ Réponse visible dans le chat de l'app (le client n'a pas démarré le bot).")


async def _fallback_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Message non texte (photo, sticker…) — redirige vers les commandes."""
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
    elif data == "order_cancel_keep":
        await update.callback_query.edit_message_text("Panier conservé. Utilise /order quand tu es prêt.")
        await update.callback_query.answer()
    elif data.startswith("jpay_"):
        await jeko_pay_callback(update, context)
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
    """Configure le menu des commandes (clients + admin) et le bouton Menu qui ouvre la webapp."""
    try:
        await app.bot.set_my_commands(CLIENT_COMMANDS, scope=BotCommandScopeDefault())
        for admin_id in ([] if ADMIN_BOT_ENABLED else _admin_user_ids):
            await app.bot.set_my_commands(
                [BotCommand("admin", "🛠 Résumé des commandes (admin)"), *CLIENT_COMMANDS],
                scope=BotCommandScopeChat(chat_id=admin_id),
            )
    except Exception as e:
        logger.warning(f"Commandes non configurées: {e}")
    try:
        await app.bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="🛒 StickerStreet", web_app=WebAppInfo(url=WEBAPP_URL)))
    except Exception as e:
        logger.warning(f"Menu button non configuré: {e}")


BTN_CATALOG, BTN_CART, BTN_ORDERS = "🛍️ Catalogue", "🛒 Mon panier", "📦 Mes commandes"
BTN_PROFILE, BTN_SUPPORT, BTN_APP = "👤 Mon profil", "💬 Support", "📱 Ouvrir l'app"
MENU_KB = ReplyKeyboardMarkup(
    [[BTN_CATALOG, BTN_CART], [BTN_ORDERS, BTN_PROFILE], [BTN_SUPPORT, BTN_APP]],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="Écris au support ou choisis un bouton",
)
# Anciens libellés : encore affichés chez les clients qui n'ont pas relancé /start
LEGACY_BUTTONS = {"🛒 Commander": BTN_CART, "🆘 Support": BTN_SUPPORT}
MENU_BUTTONS = [BTN_CATALOG, BTN_CART, BTN_ORDERS, BTN_PROFILE, BTN_SUPPORT, BTN_APP, *LEGACY_BUTTONS]


async def menu_button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    t = (update.message.text or "").strip()
    t = LEGACY_BUTTONS.get(t, t)
    handler = {
        BTN_CATALOG: catalog, BTN_CART: order_start, BTN_ORDERS: my_orders,
        BTN_PROFILE: profile_cmd, BTN_SUPPORT: support, BTN_APP: open_app,
    }.get(t)
    if handler:
        return await handler(update, context)


CLIENT_COMMANDS = [
    BotCommand("start", "Accueil et menu"),
    BotCommand("catalog", "Voir le catalogue"),
    BotCommand("order", "Mon panier et paiement"),
    BotCommand("orders", "Suivre mes commandes"),
    BotCommand("profil", "Mes coordonnées de livraison"),
    BotCommand("register", "Enregistrer / modifier mon profil"),
    BotCommand("support", "Écrire au support"),
    BotCommand("app", "Ouvrir la boutique"),
    BotCommand("cancel", "Annuler l'inscription en cours"),
]


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
    app.add_handler(MessageHandler(filters.Text(MENU_BUTTONS), menu_button_handler))
    app.add_handler(PreCheckoutQueryHandler(pre_checkout))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment))
    app.add_handler(conv_register)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("catalog", catalog))
    app.add_handler(CommandHandler("order", order_start))
    app.add_handler(CommandHandler("orders", my_orders))
    app.add_handler(CommandHandler("support", support))
    app.add_handler(CommandHandler(["profil", "profile"], profile_cmd))
    app.add_handler(CommandHandler("app", open_app))
    app.add_handler(CommandHandler(["aide", "help"], start))
    app.add_handler(CommandHandler("admin", admin_summary))
    if _admin_user_ids and not ADMIN_BOT_ENABLED:  # repli tant que le bot admin n'existe pas
        app.add_handler(MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.User(user_id=_admin_user_ids),
            admin_chat_reply,
        ))
    # Texte libre d'un client = message au support (l'admin, lui, est capté juste au-dessus)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, client_support_message))
    app.add_handler(MessageHandler(filters.ChatType.PRIVATE & (filters.PHOTO | filters.Document.ALL), client_support_file))
    app.add_handler(MessageHandler(filters.ChatType.PRIVATE & ~filters.COMMAND & ~filters.SUCCESSFUL_PAYMENT & ~filters.TEXT, _fallback_text))
    app.add_handler(CallbackQueryHandler(callback_handler))

    print("🤖 Bot StickerStreet en cours d'exécution...")
    # Vide la file Telegram au démarrage (utile après conflit webhook / autre instance)
    app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)


if __name__ == "__main__":
    main()
