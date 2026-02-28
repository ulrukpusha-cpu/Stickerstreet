"""
API Flask StickerStreet - Backend partagé entre la webapp et le bot Telegram
"""
import hashlib
import hmac
import json
import os
import re
import time
import base64
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    _HAS_LIMITER = True
except ImportError:
    _HAS_LIMITER = False

app = Flask(__name__)

_raw_origins = (os.environ.get("ALLOWED_ORIGINS", "") or "").strip()
# Normaliser sans slash final pour matcher l'en-tête Origin envoyé par le navigateur
_cors_origins = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()] if _raw_origins else ["*"]
CORS(app, resources={r"/api/*": {
    "origins": _cors_origins,
    "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "X-Admin-Key", "Authorization"],
}})

if _HAS_LIMITER:
    limiter = Limiter(
        get_remote_address, app=app,
        default_limits=["120 per minute"],
        storage_uri="memory://",
    )
else:
    class _FakeLimiter:
        def limit(self, *a, **kw):
            def decorator(f): return f
            return decorator
        def exempt(self, f): return f
    limiter = _FakeLimiter()
    app.logger.warning("flask-limiter non installé — rate limiting désactivé")

@app.before_request
def _csrf_origin_check():
    """Bloque les requêtes mutantes dont l'Origin ne fait pas partie des domaines autorisés."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if _cors_origins == ["*"]:
        return None
    origin = (request.headers.get("Origin") or "").strip().rstrip("/")
    if not origin:
        return None
    allowed = [o.rstrip("/") for o in _cors_origins]
    if origin in allowed:
        return None
    return jsonify({"error": "Origin non autorisée"}), 403


TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
# Admins : un seul ID ou plusieurs séparés par des virgules (ex: 123,456,789)
_admin_ids = os.environ.get("ADMIN_TELEGRAM_ID", "")
ADMIN_TELEGRAM_IDS = [str(x).strip() for x in _admin_ids.split(",") if x.strip()]
ADMIN_API_KEY = (os.environ.get("ADMIN_API_KEY", "") or "").strip().strip('"').strip("'")

# En local : ../shared/data.json | Sur Railway : data.json dans api/
_SHARED = os.path.join(os.path.dirname(__file__), "..", "shared", "data.json")
_LOCAL = os.path.join(os.path.dirname(__file__), "data.json")
# Priorité: DATA_FILE env (ex: volume persistant Railway), sinon api/data.json, sinon shared/data.json
DATA_FILE = (os.environ.get("DATA_FILE", "") or "").strip() or (_LOCAL if os.path.exists(_LOCAL) else _SHARED)

VERCEL_BLOB_UPLOAD_URL = os.environ.get("VERCEL_BLOB_UPLOAD_URL", "https://blob.vercel-storage.com").strip()
VERCEL_BLOB_BASE_URL = os.environ.get("VERCEL_BLOB_BASE_URL", "").strip()
BLOB_READ_WRITE_TOKEN = (os.environ.get("BLOB_READ_WRITE_TOKEN", "") or "").strip().strip('"').strip("'")
PENDING_INVOICE_TTL_SECONDS = int(os.environ.get("PENDING_INVOICE_TTL_SECONDS", "86400") or "86400")


def _ensure_data_file():
    """Crée DATA_FILE si absent, en copiant un seed existant."""
    if os.path.exists(DATA_FILE):
        return
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    seed_path = _LOCAL if os.path.exists(_LOCAL) else _SHARED
    if os.path.exists(seed_path):
        with open(seed_path, "r", encoding="utf-8") as src:
            seed = src.read()
        with open(DATA_FILE, "w", encoding="utf-8") as dst:
            dst.write(seed)
    else:
        # Seed minimal pour éviter crash démarrage.
        with open(DATA_FILE, "w", encoding="utf-8") as dst:
            json.dump(
                {
                    "products": [],
                    "orders": [],
                    "statuses": {},
                    "momo": [],
                    "clients": [],
                    "chat": [],
                    "banners": [],
                    "invoices": [],
                    "pending_invoices": {},
                },
                dst,
                ensure_ascii=False,
                indent=2,
            )


def load_data():
    _ensure_data_file()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    _ensure_data_file()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@app.route("/api/products", methods=["GET"])
def get_products():
    """Liste tous les produits"""
    data = load_data()
    return jsonify(data["products"])


@app.route("/api/products/<int:pid>", methods=["GET"])
def get_product(pid):
    """Détails d'un produit"""
    data = load_data()
    p = next((x for x in data["products"] if x["id"] == pid), None)
    if not p:
        return jsonify({"error": "Produit introuvable"}), 404
    return jsonify(p)


def _sanitize_blob_folder(folder):
    """Autorise uniquement [a-z0-9/_-] pour les chemins Blob."""
    s = (folder or "uploads").strip().lower()
    s = re.sub(r"[^a-z0-9/_-]", "-", s)
    s = s.strip("/-")
    return s or "uploads"


def _require_admin_api_key():
    """
    Vérifie la clé admin pour les endpoints sensibles.
    - Si ADMIN_API_KEY n'est pas configuré, la vérification est désactivée (compat).
    - Sinon, il faut X-Admin-Key ou Authorization: Bearer <key>.
    """
    if not ADMIN_API_KEY:
        return None
    raw_auth = (request.headers.get("Authorization") or "").strip()
    bearer = ""
    if raw_auth.lower().startswith("bearer "):
        parts = raw_auth.split(" ", 1)
        bearer = parts[1].strip() if len(parts) > 1 else ""
    header_key = (request.headers.get("X-Admin-Key") or "").strip()
    incoming = header_key or bearer
    if not incoming or not hmac.compare_digest(incoming, ADMIN_API_KEY):
        return jsonify({"error": "Accès admin refusé"}), 401
    return None


def _is_blob_url(url):
    try:
        parsed = urllib.parse.urlparse((url or "").strip())
        return bool(parsed.scheme and parsed.netloc and ".blob.vercel-storage.com" in parsed.netloc)
    except Exception:
        return False


def _blob_pathname_from_url(url):
    try:
        parsed = urllib.parse.urlparse((url or "").strip())
        return parsed.path.lstrip("/")
    except Exception:
        return ""


def _delete_blob_url(url):
    """Supprime un objet Vercel Blob via son URL complète."""
    if not BLOB_READ_WRITE_TOKEN or not _is_blob_url(url):
        return False
    pathname = _blob_pathname_from_url(url)
    if not pathname:
        return False
    delete_url = f"{VERCEL_BLOB_UPLOAD_URL.rstrip('/')}/{pathname}"
    try:
        req = urllib.request.Request(
            delete_url,
            method="DELETE",
            headers={"Authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}"},
        )
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception as e:
        app.logger.warning(f"Blob delete failed for {url}: {e}")
        return False


def _collect_product_blob_urls(product):
    urls = []
    if isinstance(product, dict):
        for v in (product.get("visuals") or []):
            if isinstance(v, str) and _is_blob_url(v):
                urls.append(v.strip())
        img = product.get("img")
        if isinstance(img, str) and _is_blob_url(img):
            urls.append(img.strip())
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _upload_bytes_to_blob(blob, folder, original_name, content_type):
    """Upload binaire vers Vercel Blob et retourne {url, pathname}."""
    if not BLOB_READ_WRITE_TOKEN:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN manquant")
    folder = _sanitize_blob_folder(folder)
    ext = os.path.splitext((original_name or "").strip())[1].lower()
    if not ext:
        ext = ".bin"
    key = hashlib.md5(blob).hexdigest()[:10]
    pathname = f"{folder}/{int(time.time() * 1000)}_{key}{ext}"
    upload_url = f"{VERCEL_BLOB_UPLOAD_URL.rstrip('/')}/{pathname}"

    headers = {
        "Authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}",
        "Content-Type": content_type,
        "x-content-type": content_type,
        "x-access": "public",
        "x-add-random-suffix": "1",
    }
    req = urllib.request.Request(upload_url, data=blob, method="PUT", headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        payload = json.loads(resp.read().decode() or "{}")
    url = payload.get("url") or payload.get("downloadUrl")
    pathname = payload.get("pathname", pathname)
    if not url and VERCEL_BLOB_BASE_URL:
        url = f"{VERCEL_BLOB_BASE_URL.rstrip('/')}/{pathname}"
    if not url:
        raise RuntimeError("Upload réussi mais URL Blob introuvable")
    return {"url": url, "pathname": pathname}


@limiter.limit("15 per minute")
@app.route("/api/upload/blob", methods=["POST"])
def upload_blob_file():
    """Upload un fichier image vers Vercel Blob et retourne l'URL publique."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    if not BLOB_READ_WRITE_TOKEN:
        return jsonify({"error": "BLOB_READ_WRITE_TOKEN manquant"}), 500

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Fichier requis"}), 400

    content_type = (file.content_type or "").strip().lower()
    if not content_type.startswith("image/"):
        return jsonify({"error": "Seules les images sont autorisées"}), 400

    blob = file.read()
    if not blob:
        return jsonify({"error": "Fichier vide"}), 400
    if len(blob) > 8 * 1024 * 1024:
        return jsonify({"error": "Image trop lourde (max 8MB)"}), 400

    try:
        uploaded = _upload_bytes_to_blob(
            blob=blob,
            folder=request.form.get("folder", "uploads"),
            original_name=(file.filename or "image"),
            content_type=content_type,
        )
        return jsonify(uploaded)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode()
        except Exception:
            body = str(e)
        return jsonify({"error": f"Upload Blob échoué ({e.code})", "details": body[:300]}), 502
    except Exception as e:
        return jsonify({"error": "Upload Blob échoué", "details": str(e)}), 502


def _sanitize_product_payload(body, existing=None):
    """Valide et nettoie un payload produit."""
    cat = (body.get("cat") or (existing or {}).get("cat") or "").strip().lower()
    allowed_cats = {"stickers", "flyers", "cartes", "photo"}
    if cat not in allowed_cats:
        return None, "Catégorie invalide (stickers, flyers, cartes, photo)"

    name = (body.get("name") if "name" in body else (existing or {}).get("name", "")).strip()
    if not name:
        return None, "Nom requis"

    desc = (body.get("desc") if "desc" in body else (existing or {}).get("desc", "")).strip()
    if not desc:
        return None, "Description requise"

    sizes_raw = body.get("sizes") if "sizes" in body else (existing or {}).get("sizes", [])
    if isinstance(sizes_raw, str):
        sizes = [x.strip() for x in sizes_raw.split(",") if x.strip()]
    elif isinstance(sizes_raw, list):
        sizes = [str(x).strip() for x in sizes_raw if str(x).strip()]
    else:
        sizes = []
    if not sizes:
        return None, "Au moins une taille est requise"

    def _to_num(val, fallback=0):
        try:
            return float(val)
        except (ValueError, TypeError):
            return float(fallback)

    price = _to_num(body.get("price") if "price" in body else (existing or {}).get("price", 0))
    ton = _to_num(body.get("ton") if "ton" in body else (existing or {}).get("ton", 0))
    xof = int(_to_num(body.get("xof") if "xof" in body else (existing or {}).get("xof", 0)))
    if xof <= 0:
        return None, "Prix XOF invalide"

    emoji = (body.get("emoji") if "emoji" in body else (existing or {}).get("emoji", "📦")).strip() or "📦"
    grad = (body.get("grad") if "grad" in body else (existing or {}).get("grad", "")).strip()
    custom = body.get("custom") if "custom" in body else (existing or {}).get("custom", True)
    custom = bool(custom)

    visuals_raw = body.get("visuals")
    if visuals_raw is None:
        visuals_raw = (existing or {}).get("visuals") or []
    if isinstance(visuals_raw, str):
        visuals_raw = [x.strip() for x in visuals_raw.split(",")]
    visuals = []
    for v in visuals_raw if isinstance(visuals_raw, list) else []:
        s = str(v).strip()
        if s and s not in visuals:
            visuals.append(s)
    # Garantit un minimum de 3 visuels (fallback sur img)
    img_fallback = (body.get("img") if "img" in body else (existing or {}).get("img", "")).strip()
    if img_fallback and img_fallback not in visuals:
        visuals.insert(0, img_fallback)
    while len(visuals) < 3 and visuals:
        visuals.append(visuals[len(visuals) % len(visuals)])
    if not visuals:
        return None, "Ajoute au moins un visuel (URL/image)"

    prices_by_size = {}
    pbs_raw = body.get("pricesBySize")
    if pbs_raw is None:
        pbs_raw = (existing or {}).get("pricesBySize") or {}
    if isinstance(pbs_raw, dict):
        for sz in sizes:
            raw = pbs_raw.get(sz)
            if isinstance(raw, dict):
                sxof = int(_to_num(raw.get("xof"), xof))
                sprice = _to_num(raw.get("price"), price)
                ston = _to_num(raw.get("ton"), ton)
                prices_by_size[sz] = {"xof": sxof, "price": round(sprice, 2), "ton": round(ston, 4)}
            else:
                prices_by_size[sz] = {"xof": xof, "price": round(price, 2), "ton": round(ton, 4)}
    elif isinstance(pbs_raw, list):
        for item in pbs_raw:
            if not isinstance(item, dict):
                continue
            sz = str(item.get("size", "")).strip()
            if not sz or sz not in sizes:
                continue
            prices_by_size[sz] = {
                "xof": int(_to_num(item.get("xof"), xof)),
                "price": round(_to_num(item.get("price"), price), 2),
                "ton": round(_to_num(item.get("ton"), ton), 4),
            }
    for sz in sizes:
        if sz not in prices_by_size:
            prices_by_size[sz] = {"xof": xof, "price": round(price, 2), "ton": round(ton, 4)}

    cleaned = {
        "name": name,
        "cat": cat,
        "price": round(price, 2),
        "ton": round(ton, 4),
        "xof": xof,
        "emoji": emoji,
        "grad": grad,
        "sizes": sizes,
        "desc": desc,
        "custom": custom,
        "img": visuals[0],
        "visuals": visuals[:8],
        "pricesBySize": prices_by_size,
    }
    return cleaned, None


def _sanitize_banner_payload(body, existing=None):
    title = (body.get("title") if "title" in body else (existing or {}).get("title", "")).strip()
    image = (body.get("image") if "image" in body else (existing or {}).get("image", "")).strip()
    link = (body.get("link") if "link" in body else (existing or {}).get("link", "")).strip()
    section = (body.get("section") if "section" in body else (existing or {}).get("section", "home")).strip().lower()
    active = body.get("active") if "active" in body else (existing or {}).get("active", True)
    active = bool(active)
    if not image:
        return None, "Image bannière requise"
    if section not in {"home", "profile"}:
        return None, "Section bannière invalide (home/profile)"
    return {
        "title": title or "Bannière",
        "image": image,
        "link": link,
        "section": section,
        "active": active,
    }, None


@app.route("/api/banners", methods=["GET"])
def get_banners():
    data = load_data()
    data.setdefault("banners", [])
    normalized = []
    changed = False
    for b in data["banners"]:
        if "section" not in b:
            b["section"] = "home"
            changed = True
        normalized.append(b)
    if changed:
        save_data(data)
    return jsonify(normalized)


@app.route("/api/banners", methods=["POST"])
def create_banner():
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    data.setdefault("banners", [])
    body = request.get_json() or {}
    cleaned, err = _sanitize_banner_payload(body)
    if err:
        return jsonify({"error": err}), 400
    nums = [int(b.get("id", 0)) for b in data["banners"] if str(b.get("id", "")).isdigit()]
    cleaned["id"] = max(nums, default=0) + 1
    data["banners"].append(cleaned)
    save_data(data)
    return jsonify(cleaned), 201


@app.route("/api/banners/<int:bid>", methods=["PATCH"])
def update_banner(bid):
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    data.setdefault("banners", [])
    banner = next((b for b in data["banners"] if b.get("id") == bid), None)
    if not banner:
        return jsonify({"error": "Bannière introuvable"}), 404
    body = request.get_json() or {}
    cleaned, err = _sanitize_banner_payload(body, existing=banner)
    if err:
        return jsonify({"error": err}), 400
    banner.update(cleaned)
    save_data(data)
    return jsonify(banner)


@app.route("/api/banners/<int:bid>", methods=["DELETE"])
def delete_banner(bid):
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    data.setdefault("banners", [])
    target = next((b for b in data["banners"] if b.get("id") == bid), None)
    if not target:
        return jsonify({"error": "Bannière introuvable"}), 404
    before = len(data["banners"])
    data["banners"] = [b for b in data["banners"] if b.get("id") != bid]
    if len(data["banners"]) == before:
        return jsonify({"error": "Bannière introuvable"}), 404

    banner_url = str((target or {}).get("image", "")).strip()
    if _is_blob_url(banner_url):
        still_used = any(str((b or {}).get("image", "")).strip() == banner_url for b in data["banners"])
        if not still_used:
            for p in data.get("products", []):
                if banner_url in _collect_product_blob_urls(p):
                    still_used = True
                    break
        if not still_used:
            _delete_blob_url(banner_url)

    save_data(data)
    return jsonify({"ok": True, "deleted_id": bid})


@app.route("/api/products", methods=["POST"])
def create_product():
    """Ajoute un produit."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    body = request.get_json() or {}
    cleaned, err = _sanitize_product_payload(body)
    if err:
        return jsonify({"error": err}), 400
    nums = [int(p.get("id", 0)) for p in data["products"] if str(p.get("id", "")).isdigit()]
    cleaned["id"] = max(nums, default=0) + 1
    data["products"].append(cleaned)
    save_data(data)
    return jsonify(cleaned), 201


@app.route("/api/products/<int:pid>", methods=["PATCH"])
def update_product(pid):
    """Modifie un produit."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    product = next((x for x in data["products"] if x["id"] == pid), None)
    if not product:
        return jsonify({"error": "Produit introuvable"}), 404
    body = request.get_json() or {}
    cleaned, err = _sanitize_product_payload(body, existing=product)
    if err:
        return jsonify({"error": err}), 400
    product.update(cleaned)
    save_data(data)
    return jsonify(product)


@app.route("/api/products/<int:pid>", methods=["DELETE"])
def delete_product(pid):
    """Supprime un produit."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    target = next((p for p in data["products"] if p.get("id") == pid), None)
    if not target:
        return jsonify({"error": "Produit introuvable"}), 404
    before = len(data["products"])
    data["products"] = [p for p in data["products"] if p.get("id") != pid]
    if len(data["products"]) == before:
        return jsonify({"error": "Produit introuvable"}), 404

    candidate_urls = _collect_product_blob_urls(target)
    still_used = set()
    for p in data["products"]:
        for u in _collect_product_blob_urls(p):
            still_used.add(u)
    for b in data.get("banners", []):
        bu = str((b or {}).get("image", "")).strip()
        if _is_blob_url(bu):
            still_used.add(bu)
    for u in candidate_urls:
        if u not in still_used:
            _delete_blob_url(u)

    save_data(data)
    return jsonify({"ok": True, "deleted_id": pid})


@app.route("/api/orders", methods=["GET"])
def get_orders():
    """Liste les commandes (optionnel: ?telegram_user_id=123)"""
    data = load_data()
    tg_id = request.args.get("telegram_user_id", type=int)
    orders = data["orders"]
    if tg_id is not None:
        orders = [o for o in orders if o.get("telegram_user_id") == tg_id]
    return jsonify(orders)


@limiter.limit("20 per minute")
@app.route("/api/orders", methods=["POST"])
def create_order():
    """Créer une commande (depuis webapp ou bot)"""
    data = load_data()
    _cleanup_expired_pending_invoices(data)
    body = request.get_json() or {}
    items = body.get("items", [])
    if not items:
        return jsonify({"error": "Items requis"}), 400

    total = sum(float(i.get("price", 0)) * int(i.get("qty", 1)) for i in items)
    total_xof = sum(float(i.get("xof", 0)) * int(i.get("qty", 1)) for i in items)
    nums = [int(o["id"].split("-")[1]) for o in data["orders"] if "-" in o.get("id", "") and o["id"].split("-")[1].isdigit()]
    order_id = f"ORD-{max(nums, default=1000) + 1}"
    date = datetime.now().strftime("%Y-%m-%d")

    order = {
        "id": order_id,
        "items": items,
        "total": round(total, 2),
        "totalXof": int(total_xof),
        "status": "pending",
        "date": date,
        "telegram_user_id": body.get("telegram_user_id"),
        "client_name": body.get("client_name"),
        "client_phone": body.get("client_phone"),
        "client_address": body.get("client_address"),
    }
    data["orders"].insert(0, order)
    invoice_filename, invoice_pdf, invoice_number = _create_invoice_pdf_and_store(data, order)
    order["invoice_number"] = invoice_number
    save_data(data)

    # Alerte admin : nouvelle commande
    _notify_admin_new_order(order, payment=order.get("payment_method") or "MoMo / TON")
    _send_telegram_document(invoice_pdf, invoice_filename, caption=f"🧾 Facture {invoice_number} — {order.get('id')}")

    return jsonify(order), 201


def _notify_admin_new_order(order, payment=None):
    """Envoie une alerte aux admins Telegram pour une nouvelle commande."""
    items_txt = "\n".join(
        f"• {i.get('emoji', '📦')} {i.get('name', '?')} × {i.get('qty', 1)} — {int(i.get('xof', 0) * int(i.get('qty', 1))):,} F".replace(",", " ")
        for i in order.get("items", [])
    )
    total_xof = order.get("totalXof") or 0
    client = order.get("client_name") or order.get("client_phone") or "—"
    pay_line = f"\n💳 Paiement : {payment}\n" if payment else "\n"
    msg = (
        f"🔔 <b>Nouvelle commande {order.get('id', '')}</b>\n\n"
        f"👤 {client}\n"
        f"📞 {order.get('client_phone', '—')}\n"
        f"📍 {order.get('client_address', '—')}{pay_line}\n"
        f"{items_txt}\n\n"
        f"💰 Total : {total_xof:,} F".replace(",", " ")
    )
    _send_telegram(msg)


def _pdf_escape(text):
    return str(text or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(lines):
    y = 810
    text_ops = []
    for line in lines:
        text_ops.append(f"BT /F1 11 Tf 40 {y} Td ({_pdf_escape(line)}) Tj ET")
        y -= 16
        if y < 40:
            break
    stream_data = "\n".join(text_ops).encode("latin-1", "replace")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"5 0 obj\n<< /Length " + str(len(stream_data)).encode("ascii") + b" >>\nstream\n" + stream_data + b"\nendstream\nendobj\n",
    ]
    pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj
    xref_pos = len(pdf)
    size = len(objects) + 1
    pdf += f"xref\n0 {size}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        pdf += f"{off:010d} 00000 n \n".encode("ascii")
    pdf += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode("ascii")
    return pdf


def _create_invoice_pdf_and_store(data, order):
    data.setdefault("invoices", [])
    invoice_number = f"INV-{datetime.now().strftime('%Y%m%d')}-{len(data['invoices']) + 1:04d}"
    lines = [
        "StickerStreet - Facture",
        f"Numero: {invoice_number}",
        f"Commande: {order.get('id', '-')}",
        f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        f"Client: {order.get('client_name') or '-'}",
        f"Tel: {order.get('client_phone') or '-'}",
        f"Adresse: {order.get('client_address') or '-'}",
        "",
        "Articles:",
    ]
    for item in order.get("items", []):
        qty = int(item.get("qty", 1))
        line_total = int(float(item.get("xof", 0)) * qty)
        size = item.get("sz") or "-"
        lines.append(f"- {item.get('name', '?')} x{qty} ({size}) : {line_total} F")
    lines += [
        "",
        f"Total: {int(order.get('totalXof', 0))} F CFA",
        f"Paiement: {order.get('payment_method', 'MoMo / TON')}",
        "",
        "Merci pour votre confiance.",
    ]
    pdf_bytes = _build_simple_pdf(lines)
    filename = f"{invoice_number}_{order.get('id', 'order')}.pdf"
    invoice_entry = {
        "invoice_number": invoice_number,
        "order_id": order.get("id"),
        "filename": filename,
        "created_at": datetime.now().isoformat(),
        "total_xof": int(order.get("totalXof", 0)),
        "client_name": order.get("client_name"),
    }
    # Migration: on privilégie le stockage fichier (Blob) plutôt que base64.
    try:
        uploaded = _upload_bytes_to_blob(
            blob=pdf_bytes,
            folder="invoices",
            original_name=filename,
            content_type="application/pdf",
        )
        invoice_entry["pdf_url"] = uploaded.get("url")
        invoice_entry["pdf_pathname"] = uploaded.get("pathname")
    except Exception as e:
        app.logger.warning(f"Invoice Blob upload failed: {e}")
        invoice_entry["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")
    data["invoices"].insert(0, invoice_entry)
    return filename, pdf_bytes, invoice_number


def _build_invoice_pdf_only(order, invoice_number=None):
    """Construit le PDF de facture sans l'enregistrer (pour renvoi à la validation)."""
    inv_num = invoice_number or order.get("invoice_number") or f"INV-VALID-{order.get('id', '')}"
    lines = [
        "StickerStreet - Facture",
        f"Numero: {inv_num}",
        f"Commande: {order.get('id', '-')}",
        f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        f"Client: {order.get('client_name') or '-'}",
        f"Tel: {order.get('client_phone') or '-'}",
        f"Adresse: {order.get('client_address') or '-'}",
        "",
        "Articles:",
    ]
    for item in order.get("items", []):
        qty = int(item.get("qty", 1))
        line_total = int(float(item.get("xof", 0)) * qty)
        size = item.get("sz") or "-"
        lines.append(f"- {item.get('name', '?')} x{qty} ({size}) : {line_total} F")
    lines += [
        "",
        f"Total: {int(order.get('totalXof', 0))} F CFA",
        f"Paiement: {order.get('payment_method', 'MoMo / TON')}",
        "",
        "Merci pour votre confiance.",
    ]
    pdf_bytes = _build_simple_pdf(lines)
    filename = f"{inv_num}_{order.get('id', 'order')}.pdf"
    return filename, pdf_bytes


def _get_invoice_pdf_for_order(data, order):
    """Retourne (filename, pdf_bytes) pour une commande, ou (None, None) si indisponible."""
    order_id = order.get("id")
    for inv in data.get("invoices", []):
        if inv.get("order_id") == order_id:
            if inv.get("pdf_base64"):
                try:
                    pdf_bytes = base64.b64decode(inv["pdf_base64"])
                    return (inv.get("filename") or f"invoice_{order_id}.pdf", pdf_bytes)
                except Exception:
                    pass
            if inv.get("pdf_url"):
                try:
                    with urllib.request.urlopen(inv["pdf_url"], timeout=10) as resp:
                        pdf_bytes = resp.read()
                    return (inv.get("filename") or f"invoice_{order_id}.pdf", pdf_bytes)
                except Exception:
                    pass
            break
    filename, pdf_bytes = _build_invoice_pdf_only(order)
    return (filename, pdf_bytes)


def _multipart_build(fields, file_field, filename, file_bytes, content_type):
    boundary = "----StickerStreetBoundary" + hashlib.md5(str(time.time()).encode("utf-8")).hexdigest()
    payload = bytearray()
    for key, value in fields.items():
        payload.extend(f"--{boundary}\r\n".encode("utf-8"))
        payload.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        payload.extend(str(value).encode("utf-8"))
        payload.extend(b"\r\n")
    payload.extend(f"--{boundary}\r\n".encode("utf-8"))
    payload.extend(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8"))
    payload.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
    payload.extend(file_bytes)
    payload.extend(b"\r\n")
    payload.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return boundary, bytes(payload)


def _send_telegram_document(file_bytes, filename, caption=""):
    """Envoie un PDF aux admins Telegram."""
    if not TELEGRAM_BOT_TOKEN or not ADMIN_TELEGRAM_IDS:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument"
    for chat_id in ADMIN_TELEGRAM_IDS:
        try:
            boundary, body = _multipart_build(
                fields={"chat_id": chat_id, "caption": caption[:1024]},
                file_field="document",
                filename=filename,
                file_bytes=file_bytes,
                content_type="application/pdf",
            )
            req = urllib.request.Request(
                url,
                data=body,
                method="POST",
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            )
            urllib.request.urlopen(req, timeout=15)
        except Exception as e:
            app.logger.warning(f"Telegram sendDocument failed for {chat_id}: {e}")


def _cleanup_expired_pending_invoices(data):
    """Nettoie les factures Stars en attente expirées."""
    data.setdefault("pending_invoices", {})
    now_ts = int(time.time())
    ttl = max(60, int(PENDING_INVOICE_TTL_SECONDS))
    stale_ids = []
    for inv_id, payload in data["pending_invoices"].items():
        created_ts = int((payload or {}).get("created_at_ts") or 0)
        if created_ts <= 0 or (now_ts - created_ts) > ttl:
            stale_ids.append(inv_id)
    for inv_id in stale_ids:
        data["pending_invoices"].pop(inv_id, None)
    if stale_ids:
        save_data(data)


@app.route("/api/orders/<order_id>/status", methods=["PATCH"])
def update_order_status(order_id):
    """Mettre à jour le statut d'une commande"""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    data = load_data()
    body = request.get_json() or {}
    status = body.get("status")
    if status not in data.get("statuses", {}):
        return jsonify({"error": "Statut invalide"}), 400

    for o in data["orders"]:
        if o["id"] == order_id:
            o["status"] = status
            save_data(data)
            if status == "confirmed":
                filename, pdf_bytes = _get_invoice_pdf_for_order(data, o)
                if pdf_bytes:
                    _send_telegram_document(
                        pdf_bytes, filename,
                        caption=f"✅ Facture validée — {o.get('id', '')}",
                    )
            return jsonify(o)
    return jsonify({"error": "Commande introuvable"}), 404


@app.route("/api/statuses", methods=["GET"])
def get_statuses():
    data = load_data()
    return jsonify(data["statuses"])


def _env_float(key, default, min_val=0.01):
    """Lit un float depuis l'env, évite 0 ou vide (plantage). Accepte virgule (1,50) ou 'KEY = 1'."""
    try:
        raw = os.environ.get(key, default)
        if raw is None:
            raw = default
        s = str(raw).strip()
        if "=" in s:
            s = s.split("=")[-1].strip()
        if not s:
            return float(default)
        s = s.replace(",", ".")  # format européen 1,50 → 1.50
        v = float(s)
        return v if v >= min_val else float(default)
    except (ValueError, TypeError):
        return float(default)


XOF_PER_USD = _env_float("XOF_PER_USD", "600", 1)
STARS_PER_TON = _env_float("STARS_PER_TON", "95", 1)
XOF_PER_STAR_FALLBACK = _env_float("XOF_PER_STAR_FALLBACK", "600", 1)  # F par Star (secours)
TON_FALLBACK_USD = _env_float("TON_FALLBACK_USD", "7", 0.01)  # $ par TON (secours)


def _fetch_ton_usd():
    """Récupère le prix TON en USD via CoinGecko. Retourne 0 si échec."""
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=ton&vs_currencies=usd"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        return float(data.get("ton", {}).get("usd", 0))
    except Exception:
        return 0


def _get_ton_usd():
    """Prix TON en USD : CoinGecko ou fallback (jamais 0)."""
    v = _fetch_ton_usd()
    fallback = TON_FALLBACK_USD if TON_FALLBACK_USD > 0 else 7.0
    return v if v > 0 else fallback


@app.route("/api/rates/ton", methods=["GET"])
def get_ton_rate():
    """Retourne le prix TON en USD et le montant TON équivalent pour un total XOF donné."""
    total_xof = request.args.get("total_xof", type=float) or 0
    ton_usd = _get_ton_usd()
    if XOF_PER_USD <= 0 or ton_usd <= 0:
        return jsonify({"error": "Taux indisponible", "ton_usd": 0, "amount_ton": 0}), 503
    amount_usd = total_xof / XOF_PER_USD
    amount_ton = amount_usd / ton_usd
    return jsonify({
        "ton_usd": round(ton_usd, 4),
        "xof_per_usd": XOF_PER_USD,
        "amount_ton": round(amount_ton, 6),
        "amount_usd": round(amount_usd, 2),
    })


@limiter.limit("10 per minute")
@app.route("/api/invoice/stars", methods=["POST"])
def create_invoice_stars():
    """Crée un lien de facture Telegram Stars. Conversion XOF → Stars alignée Fragment (via cours TON)."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "Bot non configuré"}), 500
    body = request.get_json() or {}
    items = body.get("items", [])
    total_xof = body.get("total_xof")
    total_stars = 0
    if total_xof is not None and total_xof > 0:
        ton_usd = _get_ton_usd()
        if ton_usd > 0 and XOF_PER_USD > 0 and STARS_PER_TON > 0:
            amount_usd = float(total_xof) / XOF_PER_USD
            amount_ton = amount_usd / ton_usd
            total_stars = amount_ton * STARS_PER_TON
        if total_stars < 0.01 and XOF_PER_STAR_FALLBACK >= 1:
            total_stars = float(total_xof) / XOF_PER_STAR_FALLBACK
    if total_stars < 0.01:
        total_stars = body.get("total_stars") or sum(float(i.get("price", 0)) * int(i.get("qty", 1)) for i in items)
    if total_stars < 0.01:
        return jsonify({"error": "Montant invalide"}), 400
    stars_int = max(1, int(round(total_stars)))
    data = load_data()
    _cleanup_expired_pending_invoices(data)
    data.setdefault("pending_invoices", {})
    inv_id = f"inv_{int(time.time() * 1000)}_{hashlib.md5(json.dumps(items).encode()).hexdigest()[:8]}"
    data["pending_invoices"][inv_id] = {
        "items": items,
        "client_name": body.get("client_name"),
        "client_phone": body.get("client_phone"),
        "client_address": body.get("client_address"),
        "created_at_ts": int(time.time()),
    }
    save_data(data)

    title = "StickerStreet — Commande"
    description = f"{len(items)} article(s) — {stars_int} ★"
    api_payload = {
        "title": title[:32],
        "description": description[:255],
        "payload": inv_id,
        "currency": "XTR",
        "prices": [{"label": "Stars", "amount": stars_int}],
    }
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/createInvoiceLink"
        req_data = json.dumps(api_payload).encode("utf-8")
        req = urllib.request.Request(url, data=req_data, method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
        if result.get("ok") and result.get("result"):
            return jsonify({"url": result["result"]})
        err_msg = result.get("description", "Erreur inconnue Telegram")
        return jsonify({"error": err_msg}), 500
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
            err_msg = body.get("description", str(e))
        except Exception:
            err_msg = str(e)
        return jsonify({"error": err_msg}), 500
    except Exception as e:
        app.logger.warning(f"createInvoiceLink error: {e}")
        return jsonify({"error": str(e) or "Impossible de créer la facture"}), 500


@limiter.limit("20 per minute")
@app.route("/api/orders/from-invoice", methods=["POST"])
def create_order_from_invoice():
    """Crée une commande à partir d'un invoice_id (appelé par le bot après paiement Stars)."""
    data = load_data()
    _cleanup_expired_pending_invoices(data)
    data.setdefault("pending_invoices", {})
    body = request.get_json() or {}
    inv_id = body.get("invoice_id") or body.get("invoice_payload")
    if not inv_id or inv_id not in data["pending_invoices"]:
        return jsonify({"error": "Facture introuvable ou expirée"}), 404
    pending = data["pending_invoices"].pop(inv_id)
    save_data(data)
    items = pending["items"]
    total = sum(float(i.get("price", 0)) * int(i.get("qty", 1)) for i in items)
    total_xof = sum(float(i.get("xof", 0)) * int(i.get("qty", 1)) for i in items)
    nums = [int(o["id"].split("-")[1]) for o in data["orders"] if "-" in o.get("id", "") and o["id"].split("-")[1].isdigit()]
    order_id = f"ORD-{max(nums, default=1000) + 1}"
    order = {
        "id": order_id,
        "items": items,
        "total": round(total, 2),
        "totalXof": int(total_xof),
        "status": "pending",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "telegram_user_id": body.get("telegram_user_id"),
        "client_name": pending.get("client_name"),
        "client_phone": pending.get("client_phone"),
        "client_address": pending.get("client_address"),
        "payment_method": "stars",
    }
    data["orders"].insert(0, order)
    invoice_filename, invoice_pdf, invoice_number = _create_invoice_pdf_and_store(data, order)
    order["invoice_number"] = invoice_number
    save_data(data)

    _notify_admin_new_order(order, payment="Stars ★")
    _send_telegram_document(invoice_pdf, invoice_filename, caption=f"🧾 Facture {invoice_number} — {order.get('id')}")

    return jsonify(order), 201


@app.route("/api/momo", methods=["GET"])
def get_momo():
    data = load_data()
    return jsonify(data["momo"])


@limiter.limit("10 per minute")
@app.route("/api/auth/telegram", methods=["POST"])
def auth_telegram():
    """Valide les données du Telegram Login Widget et enregistre/met à jour le client."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "Bot non configuré"}), 500
    body = request.get_json() or {}
    user_id = body.get("id")
    first_name = body.get("first_name", "")
    last_name = body.get("last_name", "")
    username = body.get("username", "")
    auth_date = body.get("auth_date")
    hash_val = body.get("hash")
    if not user_id or not hash_val or not auth_date:
        return jsonify({"error": "Données incomplètes"}), 400

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(body.items()) if k != "hash")
    secret = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    computed = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, hash_val):
        return jsonify({"error": "Hash invalide"}), 400

    # Limite anti-replay (24h)
    if abs(time.time() - int(auth_date)) > 86400:
        return jsonify({"error": "Session expirée"}), 400

    name = f"{first_name} {last_name}".strip() or username or f"User{user_id}"
    data = load_data()
    data.setdefault("clients", [])
    existing = next((c for c in data["clients"] if c.get("telegram_user_id") == user_id), None)
    if existing:
        existing["name"] = name
        existing["telegram_username"] = username
        existing["updated_at"] = datetime.now().isoformat()
        save_data(data)
        return jsonify({"telegram_user_id": user_id, "name": name, "username": username, "client": existing})
    client = {
        "id": f"CLI-{len(data['clients']) + 1}",
        "telegram_user_id": user_id,
        "telegram_username": username,
        "name": name,
        "phone": "",
        "address": "",
        "created_at": datetime.now().isoformat(),
    }
    data["clients"].append(client)
    save_data(data)
    return jsonify({"telegram_user_id": user_id, "name": name, "username": username, "client": client}), 201


def _validate_init_data(init_data):
    """Valide initData des Mini Apps Telegram et retourne le user (dict) ou None."""
    if not TELEGRAM_BOT_TOKEN or not init_data or not init_data.strip():
        return None
    try:
        # Parse query string (chaque clé peut apparaître une fois)
        params = urllib.parse.parse_qs(init_data, keep_blank_values=True)
        params_single = {k: (v[0] if v else "") for k, v in params.items()}
        hash_received = params_single.pop("hash", None)
        if not hash_received:
            return None
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params_single.items()))
        secret_key = hmac.new(b"WebAppData", TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
        computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(computed, hash_received):
            return None
        auth_date = params_single.get("auth_date")
        if auth_date and abs(time.time() - int(auth_date)) > 86400:
            return None  # Replay: 24h
        user_json = params_single.get("user")
        if not user_json:
            return None
        return json.loads(user_json)
    except (json.JSONDecodeError, ValueError, KeyError):
        return None


@limiter.limit("10 per minute")
@app.route("/api/auth/telegram-miniapp", methods=["POST"])
def auth_telegram_miniapp():
    """Connexion automatique (Mini App). Valide init_data ; si vide, accepte init_data_unsafe_user en secours."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "Bot non configuré"}), 500
    body = request.get_json() or {}
    init_data = body.get("init_data", "").strip()
    user = None
    if init_data:
        user = _validate_init_data(init_data)
    if not user:
        unsafe_user = body.get("init_data_unsafe_user")
        if isinstance(unsafe_user, dict) and unsafe_user.get("id"):
            user = unsafe_user
    if not user:
        return jsonify({"error": "init_data requis ou invalide"}), 400
    user_id = user.get("id")
    first_name = user.get("first_name", "")
    last_name = user.get("last_name", "")
    username = user.get("username", "")
    name = f"{first_name} {last_name}".strip() or username or f"User{user_id}"
    data = load_data()
    data.setdefault("clients", [])
    existing = next((c for c in data["clients"] if str(c.get("telegram_user_id")) == str(user_id)), None)
    if existing:
        existing["name"] = name
        existing["telegram_username"] = username
        existing["updated_at"] = datetime.now().isoformat()
        save_data(data)
        return jsonify({"telegram_user_id": user_id, "name": name, "username": username, "client": existing})
    client = {
        "id": f"CLI-{len(data['clients']) + 1}",
        "telegram_user_id": user_id,
        "telegram_username": username,
        "name": name,
        "phone": "",
        "address": "",
        "created_at": datetime.now().isoformat(),
    }
    data["clients"].append(client)
    save_data(data)
    return jsonify({"telegram_user_id": user_id, "name": name, "username": username, "client": client}), 201


@app.route("/api/register", methods=["POST"])
def register_client():
    """Inscription client depuis le bot Telegram."""
    data = load_data()
    data.setdefault("clients", [])
    body = request.get_json() or {}
    tg_id = body.get("telegram_user_id")
    name = (body.get("name") or "").strip()
    phone = (body.get("phone") or "").strip()
    address = (body.get("address") or "").strip()
    if not tg_id:
        return jsonify({"error": "telegram_user_id requis"}), 400
    if not name:
        return jsonify({"error": "Nom requis"}), 400

    existing = next((c for c in data["clients"] if c.get("telegram_user_id") == tg_id), None)
    if existing:
        existing["name"] = name
        existing["phone"] = phone
        existing["address"] = address
        existing["updated_at"] = datetime.now().isoformat()
        save_data(data)
        return jsonify(existing)
    client = {
        "id": f"CLI-{len(data['clients']) + 1}",
        "telegram_user_id": tg_id,
        "name": name,
        "phone": phone,
        "address": address,
        "created_at": datetime.now().isoformat(),
    }
    data["clients"].append(client)
    save_data(data)
    return jsonify(client), 201


@app.route("/api/profile", methods=["GET"])
def get_profile():
    """Récupère le profil client par telegram_user_id."""
    data = load_data()
    data.setdefault("clients", [])
    tg_id = request.args.get("telegram_user_id", type=int)
    if not tg_id:
        return jsonify({"error": "telegram_user_id requis"}), 400
    client = next((c for c in data["clients"] if c.get("telegram_user_id") == tg_id), None)
    if not client:
        return jsonify({"error": "Profil non trouvé"}), 404
    return jsonify(client)


@app.route("/api/profile", methods=["PATCH"])
def update_profile():
    """Met à jour le profil client (nom, téléphone, adresse)."""
    data = load_data()
    data.setdefault("clients", [])
    body = request.get_json() or {}
    tg_id = body.get("telegram_user_id")
    if not tg_id:
        return jsonify({"error": "telegram_user_id requis"}), 400
    client = next((c for c in data["clients"] if c.get("telegram_user_id") == tg_id), None)
    if not client:
        return jsonify({"error": "Profil non trouvé"}), 404
    if "name" in body and body["name"] is not None:
        client["name"] = str(body["name"]).strip()
    if "phone" in body and body["phone"] is not None:
        client["phone"] = str(body["phone"]).strip()
    if "address" in body and body["address"] is not None:
        client["address"] = str(body["address"]).strip()
    client["updated_at"] = datetime.now().isoformat()
    save_data(data)
    return jsonify(client)


@app.route("/api/health", methods=["GET"])
def health():
    warnings = []
    if not ADMIN_API_KEY:
        warnings.append("ADMIN_API_KEY non configuré — endpoints admin non protégés")
    if not BLOB_READ_WRITE_TOKEN:
        warnings.append("BLOB_READ_WRITE_TOKEN manquant — upload images désactivé")
    if not TELEGRAM_BOT_TOKEN:
        warnings.append("TELEGRAM_BOT_TOKEN manquant — notifications désactivées")
    if not _HAS_LIMITER:
        warnings.append("flask-limiter non installé — rate limiting désactivé")
    if _cors_origins == ["*"]:
        warnings.append("ALLOWED_ORIGINS non défini — CORS ouvert à tous les domaines")
    return jsonify({"status": "ok", "service": "stickerstreet-api", "warnings": warnings})


def _send_telegram(text):
    """Envoie un message à l'admin via Telegram."""
    if not TELEGRAM_BOT_TOKEN or not ADMIN_TELEGRAM_IDS:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        for chat_id in ADMIN_TELEGRAM_IDS:
            req_data = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
            req = urllib.request.Request(url, data=req_data, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"})
            urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        app.logger.warning(f"Telegram send failed: {e}")


@app.route("/api/chat", methods=["GET"])
def get_chat():
    """Récupère tous les messages du support."""
    data = load_data()
    messages = data.get("chat", [])
    if not messages:
        return jsonify([{"from": "bot", "text": "Salut ! 👋 Bienvenue chez StickerStreet. Dis-moi ce qu'il te faut !", "time": datetime.now().strftime("%H:%M")}])
    return jsonify(messages)


@limiter.limit("30 per minute")
@app.route("/api/chat", methods=["POST"])
def post_chat():
    """Le client envoie un message → stockage + notification admin Telegram."""
    data = load_data()
    body = request.get_json() or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Message vide"}), 400

    messages = data.get("chat", [])
    time_str = datetime.now().strftime("%H:%M")

    # Ajouter le message client
    messages.append({"from": "user", "text": text, "time": time_str})
    data["chat"] = messages
    save_data(data)

    # Notifier l'admin sur Telegram
    _send_telegram(f"📩 <b>Client (WebApp) :</b>\n{text}")

    return jsonify(messages)


@app.route("/api/chat/reply", methods=["POST"])
def post_chat_reply():
    """L'admin répond via le bot → ajout du message (appelé par le bot)."""
    data = load_data()
    body = request.get_json() or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Message vide"}), 400

    messages = data.get("chat", [])
    time_str = datetime.now().strftime("%H:%M")
    messages.append({"from": "bot", "text": text, "time": time_str})
    data["chat"] = messages
    save_data(data)

    return jsonify(messages)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
