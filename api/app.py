"""
API Flask StickerStreet - Backend partagé entre la webapp et le bot Telegram

Authentification :
- Clients : jeton de session signé (Authorization: Bearer <token>) délivré par
  /api/auth/telegram-miniapp (initData signé) ou /api/auth/telegram (Login Widget).
- Admin : X-Admin-Key (bot / navigateur admin, jamais embarqué dans le bundle)
  ou session d'un utilisateur Telegram listé dans ADMIN_TELEGRAM_ID.
"""
import base64
import fcntl
import hashlib
import hmac
import html
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime

from flask import Flask, abort, jsonify, request, send_file
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

try:
    from .db import is_database_enabled, load_data as db_load_data, save_data as db_save_data
except ImportError:
    from db import is_database_enabled, load_data as db_load_data, save_data as db_save_data

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    _HAS_LIMITER = True
except ImportError:
    _HAS_LIMITER = False

app = Flask(__name__)
# nginx (127.0.0.1) est le seul proxy devant l'API : on lui fait confiance pour l'IP client.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

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
    if origin in _cors_origins:
        return None
    # Same-origin (webapp servie par le même nginx que l'API)
    if origin == request.host_url.rstrip("/"):
        return None
    return jsonify({"error": "Origin non autorisée"}), 403


@app.after_request
def _security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return resp


TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
# Admins : un seul ID ou plusieurs séparés par des virgules (ex: 123,456,789)
_admin_ids = os.environ.get("ADMIN_TELEGRAM_ID", "")
ADMIN_TELEGRAM_IDS = [str(x).strip() for x in _admin_ids.split(",") if x.strip()]
ADMIN_API_KEY = (os.environ.get("ADMIN_API_KEY", "") or "").strip().strip('"').strip("'")

# Secret de session : SESSION_SECRET, sinon dérivé du token bot (change si le token est révoqué).
_session_secret = (os.environ.get("SESSION_SECRET", "") or "").strip()
if not _session_secret and TELEGRAM_BOT_TOKEN:
    _session_secret = hmac.new(TELEGRAM_BOT_TOKEN.encode(), b"stickerstreet-session", hashlib.sha256).hexdigest()
SESSION_MAX_AGE = int(os.environ.get("SESSION_MAX_AGE", str(7 * 86400)) or 7 * 86400)
_session_serializer = URLSafeTimedSerializer(_session_secret, salt="ss-session") if _session_secret else None

# En local : ../shared/data.json | Sur Railway : data.json dans api/
_SHARED = os.path.join(os.path.dirname(__file__), "..", "shared", "data.json")
_LOCAL = os.path.join(os.path.dirname(__file__), "data.json")
# Priorité: DATA_FILE env (ex: volume persistant Railway), sinon api/data.json, sinon shared/data.json
DATA_FILE = (os.environ.get("DATA_FILE", "") or "").strip() or (_LOCAL if os.path.exists(_LOCAL) else _SHARED)
_LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(DATA_FILE)), ".stickerstreet-data.lock")

VERCEL_BLOB_UPLOAD_URL = os.environ.get("VERCEL_BLOB_UPLOAD_URL", "https://blob.vercel-storage.com").strip()
VERCEL_BLOB_BASE_URL = os.environ.get("VERCEL_BLOB_BASE_URL", "").strip()
BLOB_READ_WRITE_TOKEN = (os.environ.get("BLOB_READ_WRITE_TOKEN", "") or "").strip().strip('"').strip("'")
PENDING_INVOICE_TTL_SECONDS = int(os.environ.get("PENDING_INVOICE_TTL_SECONDS", "86400") or "86400")
_LOCAL_UPLOAD_DIR = (os.environ.get("LOCAL_UPLOAD_DIR", "") or "").strip()
LOCAL_UPLOAD_ROOT = os.path.abspath(
    _LOCAL_UPLOAD_DIR or os.path.join(os.path.dirname(__file__), "local_uploads")
)
_PUBLIC_UPLOAD_BASE = (os.environ.get("PUBLIC_BASE_URL", "") or "").strip().rstrip("/")

MAX_ITEMS_PER_ORDER = 50
MAX_QTY_PER_ITEM = 10000
MAX_TEXT_LEN = 2000
# Paiements « hors facture » acceptés par POST /api/orders (Jèko et Stars ont leurs propres endpoints)
ORDER_PAYMENT_METHODS = {"ton"}

# Jèko (agrégateur Mobile Money CI) — https://developer.jeko.africa
JEKO_API_BASE = (os.environ.get("JEKO_API_BASE", "") or "https://api.jeko.africa").strip().rstrip("/")
JEKO_API_KEY = (os.environ.get("JEKO_API_KEY", "") or "").strip()
JEKO_API_KEY_ID = (os.environ.get("JEKO_API_KEY_ID", "") or "").strip()
JEKO_STORE_ID = (os.environ.get("JEKO_STORE_ID", "") or "").strip()
JEKO_WEBHOOK_SECRET = (os.environ.get("JEKO_WEBHOOK_SECRET", "") or "").strip()
JEKO_OPERATORS = {"wave": "Wave", "orange": "Orange Money", "mtn": "MTN MoMo", "moov": "Moov Money", "djamo": "Djamo"}
# URL publique de la webapp (retour client après paiement Jèko) : ngrok aujourd'hui, stickerstreet.ci ensuite
PUBLIC_APP_URL = (os.environ.get("PUBLIC_APP_URL", "") or "").strip().rstrip("/")
PRODUCT_CATEGORIES = {"stickers", "flyers", "cartes", "posters", "tshirts", "art", "photo"}


def _default_data():
    return {
        "products": [],
        "orders": [],
        "statuses": {},
        "momo": [],
        "clients": [],
        "chats": {},
        "banners": [],
        "invoices": [],
        "pending_invoices": {},
    }


def _read_seed_data():
    seed_path = _LOCAL if os.path.exists(_LOCAL) else _SHARED
    if os.path.exists(seed_path):
        with open(seed_path, "r", encoding="utf-8") as src:
            return json.load(src)
    return _default_data()


def _ensure_data_file():
    """Crée DATA_FILE si absent, en copiant un seed existant."""
    if os.path.exists(DATA_FILE):
        return
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    _write_file_atomic(_read_seed_data() or _default_data())


def _write_file_atomic(data):
    directory = os.path.dirname(os.path.abspath(DATA_FILE))
    fd, tmp = tempfile.mkstemp(prefix=".data-", suffix=".json", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def load_data():
    # Pas de repli silencieux vers le fichier quand la base est configurée :
    # lire Neon et écrire le fichier (ou l'inverse) désynchronise les données.
    if is_database_enabled():
        return db_load_data(_read_seed_data)
    _ensure_data_file()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    if is_database_enabled():
        db_save_data(data)
        return
    _ensure_data_file()
    _write_file_atomic(data)


@contextmanager
def data_tx():
    """Lecture-modification-écriture sous verrou exclusif (partagé entre workers gunicorn)."""
    with open(_LOCK_FILE, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            data = load_data()
            yield data
            save_data(data)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


@app.errorhandler(Exception)
def _unhandled(e):
    if isinstance(e, HTTPException):
        return e
    app.logger.exception("Erreur non gérée")
    return jsonify({"error": "Erreur serveur, réessaie dans un instant"}), 500


# ==================== Authentification ====================

def _issue_session(user_id):
    if not _session_serializer:
        return None
    return _session_serializer.dumps({"uid": str(user_id)})


def _session_user_id():
    """ID Telegram (str) du porteur du jeton de session, ou None."""
    if not _session_serializer:
        return None
    raw = (request.headers.get("Authorization") or "").strip()
    if not raw.lower().startswith("bearer "):
        return None
    token = raw.split(" ", 1)[1].strip()
    try:
        payload = _session_serializer.loads(token, max_age=SESSION_MAX_AGE)
    except BadSignature:
        return None
    uid = str((payload or {}).get("uid") or "").strip()
    return uid or None


def _has_admin_key():
    if not ADMIN_API_KEY:
        return False
    incoming = (request.headers.get("X-Admin-Key") or "").strip()
    return bool(incoming) and hmac.compare_digest(incoming, ADMIN_API_KEY)


def _is_admin():
    if _has_admin_key():
        return True
    uid = _session_user_id()
    return bool(uid and uid in ADMIN_TELEGRAM_IDS)


def _require_admin_api_key():
    """Endpoints admin : clé admin ou session d'un admin Telegram. Refus par défaut."""
    if _is_admin():
        return None
    return jsonify({"error": "Accès admin refusé"}), 401


def _require_bot_key():
    """Endpoints réservés au bot (serveur à serveur)."""
    if _has_admin_key():
        return None
    return jsonify({"error": "Accès refusé"}), 401


def _acting_user_id(body_uid=None):
    """Utilisateur ciblé : session du client, ou telegram_user_id fourni par un appelant admin (bot)."""
    uid = _session_user_id()
    if uid:
        if body_uid is not None and _is_admin():
            return str(body_uid)
        return uid
    if body_uid is not None and _has_admin_key():
        return str(body_uid)
    return None


def _same_user(a, b):
    return a is not None and b is not None and str(a) == str(b)


def _uid_value(uid):
    """Stocke les IDs Telegram en int quand c'est possible (compat données existantes)."""
    try:
        return int(uid)
    except (TypeError, ValueError):
        return uid


def _clip(value, limit=200):
    return str(value or "").strip()[:limit]


# ==================== Catalogue ====================

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


def _is_local_upload_url(url):
    try:
        return "/api/uploads/" in urllib.parse.urlparse((url or "").strip()).path
    except Exception:
        return False


def _local_relpath_from_url(url):
    try:
        p = urllib.parse.urlparse((url or "").strip())
        marker = "/api/uploads/"
        idx = p.path.find(marker)
        if idx < 0:
            return None
        rest = p.path[idx + len(marker) :].lstrip("/")
        if not rest or ".." in rest:
            return None
        return rest.replace("\\", "/")
    except Exception:
        return None


def _safe_join_local_upload(relpath):
    root = LOCAL_UPLOAD_ROOT
    path = os.path.abspath(os.path.join(root, (relpath or "").replace("\\", "/")))
    if path != root and not path.startswith(root + os.sep):
        return None
    return path


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


def _delete_local_upload_url(url):
    rel = _local_relpath_from_url(url)
    if not rel:
        return False
    path = _safe_join_local_upload(rel)
    if not path or not os.path.isfile(path):
        return False
    try:
        os.remove(path)
        return True
    except Exception as e:
        app.logger.warning(f"Local upload delete failed for {url}: {e}")
        return False


def _delete_stored_image_url(url):
    if _is_blob_url(url):
        return _delete_blob_url(url)
    if _is_local_upload_url(url):
        return _delete_local_upload_url(url)
    return False


def _collect_product_blob_urls(product):
    urls = []
    if isinstance(product, dict):
        for v in (product.get("visuals") or []):
            if isinstance(v, str) and (_is_blob_url(v) or _is_local_upload_url(v)):
                urls.append(v.strip())
        img = product.get("img")
        if isinstance(img, str) and (_is_blob_url(img) or _is_local_upload_url(img)):
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


def _upload_public_base():
    # URL relative par défaut : fonctionne quel que soit l'hôte (nginx :3006, ngrok, localhost).
    return _PUBLIC_UPLOAD_BASE


# Types d'image acceptés : détectés sur le contenu, jamais sur le nom/type envoyés par le client.
_IMAGE_MIME_BY_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}


def _sniff_image(blob):
    """Retourne (extension, mime) si le contenu est une image PNG/JPEG/GIF/WebP, sinon (None, None)."""
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png", "image/png"
    if blob.startswith(b"\xff\xd8\xff"):
        return ".jpg", "image/jpeg"
    if blob[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif", "image/gif"
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return ".webp", "image/webp"
    return None, None


def _save_bytes_local(blob, folder, ext):
    """Enregistre l'image sur disque si Vercel Blob n'est pas configuré."""
    folder = _sanitize_blob_folder(folder)
    key = hashlib.md5(blob).hexdigest()[:10]
    fname = f"{int(time.time() * 1000)}_{key}{ext}"
    relpath = f"{folder}/{fname}".replace("\\", "/")
    dest_dir = os.path.join(LOCAL_UPLOAD_ROOT, folder)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, fname)
    with open(dest, "wb") as f:
        f.write(blob)
    base = _upload_public_base()
    url = f"{base}/api/uploads/{relpath}"
    return {"url": url, "pathname": relpath}


@app.route("/api/upload/blob", methods=["POST"])
@limiter.limit("15 per minute")
def upload_blob_file():
    """Upload image : Vercel Blob si token configuré, sinon stockage local + URL /api/uploads/…"""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Fichier requis"}), 400

    blob = file.read()
    if not blob:
        return jsonify({"error": "Fichier vide"}), 400
    if len(blob) > 8 * 1024 * 1024:
        return jsonify({"error": "Image trop lourde (max 8MB)"}), 400
    ext, mime = _sniff_image(blob)
    if not ext:
        return jsonify({"error": "Seules les images PNG, JPEG, GIF ou WebP sont autorisées"}), 400

    folder = request.form.get("folder", "uploads")

    try:
        if BLOB_READ_WRITE_TOKEN:
            uploaded = _upload_bytes_to_blob(blob=blob, folder=folder, original_name=f"image{ext}", content_type=mime)
        else:
            uploaded = _save_bytes_local(blob=blob, folder=folder, ext=ext)
        return jsonify(uploaded)
    except urllib.error.HTTPError as e:
        app.logger.warning(f"Blob upload HTTP {e.code}")
        return jsonify({"error": f"Upload Blob échoué ({e.code})"}), 502
    except Exception as e:
        app.logger.warning(f"Upload failed: {e}")
        label = "Upload Blob échoué" if BLOB_READ_WRITE_TOKEN else "Enregistrement local échoué"
        return jsonify({"error": label}), 502


@app.route("/api/uploads/<path:relpath>", methods=["GET"])
def serve_local_upload(relpath):
    """Sert les fichiers uploadés localement (sans Vercel Blob) — images uniquement."""
    if ".." in relpath:
        abort(404)
    relpath = relpath.replace("\\", "/").lstrip("/")
    mime = _IMAGE_MIME_BY_EXT.get(os.path.splitext(relpath)[1].lower())
    if not mime:
        abort(404)
    path = _safe_join_local_upload(relpath)
    if not path or not os.path.isfile(path):
        abort(404)
    resp = send_file(path, mimetype=mime, max_age=86400)
    resp.headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    return resp


def _sanitize_product_payload(body, existing=None):
    """Valide et nettoie un payload produit."""
    cat = (body.get("cat") or (existing or {}).get("cat") or "").strip().lower()
    if cat not in PRODUCT_CATEGORIES:
        return None, f"Catégorie invalide ({', '.join(sorted(PRODUCT_CATEGORIES))})"

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
    if any(v["xof"] <= 0 for v in prices_by_size.values()):
        return None, "Prix XOF invalide pour une taille"

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
    if link and urllib.parse.urlparse(link).scheme not in ("http", "https"):
        return None, "Lien bannière invalide (http/https uniquement)"
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
    return jsonify([{**b, "section": b.get("section", "home")} for b in data.get("banners", [])])


@app.route("/api/banners", methods=["POST"])
def create_banner():
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    cleaned, err = _sanitize_banner_payload(body)
    if err:
        return jsonify({"error": err}), 400
    with data_tx() as data:
        data.setdefault("banners", [])
        nums = [int(b.get("id", 0)) for b in data["banners"] if str(b.get("id", "")).isdigit()]
        cleaned["id"] = max(nums, default=0) + 1
        data["banners"].append(cleaned)
    return jsonify(cleaned), 201


@app.route("/api/banners/<int:bid>", methods=["PATCH"])
def update_banner(bid):
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    with data_tx() as data:
        data.setdefault("banners", [])
        banner = next((b for b in data["banners"] if b.get("id") == bid), None)
        if not banner:
            return jsonify({"error": "Bannière introuvable"}), 404
        cleaned, err = _sanitize_banner_payload(body, existing=banner)
        if err:
            return jsonify({"error": err}), 400
        banner.update(cleaned)
    return jsonify(banner)


@app.route("/api/banners/<int:bid>", methods=["DELETE"])
def delete_banner(bid):
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    with data_tx() as data:
        data.setdefault("banners", [])
        target = next((b for b in data["banners"] if b.get("id") == bid), None)
        if not target:
            return jsonify({"error": "Bannière introuvable"}), 404
        data["banners"] = [b for b in data["banners"] if b.get("id") != bid]

        banner_url = str((target or {}).get("image", "")).strip()
        if _is_blob_url(banner_url) or _is_local_upload_url(banner_url):
            still_used = any(str((b or {}).get("image", "")).strip() == banner_url for b in data["banners"])
            if not still_used:
                still_used = any(banner_url in _collect_product_blob_urls(p) for p in data.get("products", []))
            if not still_used:
                _delete_stored_image_url(banner_url)
    return jsonify({"ok": True, "deleted_id": bid})


@app.route("/api/products", methods=["POST"])
def create_product():
    """Ajoute un produit."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    cleaned, err = _sanitize_product_payload(body)
    if err:
        return jsonify({"error": err}), 400
    with data_tx() as data:
        nums = [int(p.get("id", 0)) for p in data["products"] if str(p.get("id", "")).isdigit()]
        cleaned["id"] = max(nums, default=0) + 1
        data["products"].append(cleaned)
    return jsonify(cleaned), 201


@app.route("/api/products/<int:pid>", methods=["PATCH"])
def update_product(pid):
    """Modifie un produit."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    with data_tx() as data:
        product = next((x for x in data["products"] if x["id"] == pid), None)
        if not product:
            return jsonify({"error": "Produit introuvable"}), 404
        cleaned, err = _sanitize_product_payload(body, existing=product)
        if err:
            return jsonify({"error": err}), 400
        product.update(cleaned)
    return jsonify(product)


@app.route("/api/products/<int:pid>", methods=["DELETE"])
def delete_product(pid):
    """Supprime un produit."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    with data_tx() as data:
        target = next((p for p in data["products"] if p.get("id") == pid), None)
        if not target:
            return jsonify({"error": "Produit introuvable"}), 404
        data["products"] = [p for p in data["products"] if p.get("id") != pid]

        candidate_urls = _collect_product_blob_urls(target)
        still_used = set()
        for p in data["products"]:
            still_used.update(_collect_product_blob_urls(p))
        for b in data.get("banners", []):
            bu = str((b or {}).get("image", "")).strip()
            if _is_blob_url(bu) or _is_local_upload_url(bu):
                still_used.add(bu)
        for u in candidate_urls:
            if u not in still_used:
                _delete_stored_image_url(u)
    return jsonify({"ok": True, "deleted_id": pid})


# ==================== Commandes ====================

def _norm_size(s):
    return str(s or "").replace("×", "x").replace(" ", "").lower()[:20]


def _price_items(data, raw_items):
    """
    Reconstruit les lignes de commande depuis le catalogue serveur.
    Le client n'envoie que {id, sz, qty} : noms et prix envoyés par le client sont ignorés.
    """
    if not isinstance(raw_items, list) or not raw_items:
        return None, "Items requis"
    if len(raw_items) > MAX_ITEMS_PER_ORDER:
        return None, f"Trop d'articles (max {MAX_ITEMS_PER_ORDER})"
    catalog = {p.get("id"): p for p in data.get("products", [])}
    out = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            return None, "Article invalide"
        try:
            pid = int(raw.get("id"))
            qty = int(raw.get("qty", 1))
        except (TypeError, ValueError):
            return None, "Article invalide"
        product = catalog.get(pid)
        if not product:
            return None, f"Produit {pid} introuvable"
        if qty < 1 or qty > MAX_QTY_PER_ITEM:
            return None, "Quantité invalide"
        sizes = product.get("sizes") or []
        wanted = raw.get("sz")
        size = sizes[0] if sizes and not wanted else None
        if wanted:
            # Le bot remplace « × » par « x » dans ses callback_data
            size = next((s for s in sizes if _norm_size(s) == _norm_size(wanted)), None)
        if sizes and not size:
            return None, f"Taille invalide pour {product.get('name')}"
        unit = (product.get("pricesBySize") or {}).get(size) or {}
        xof = int(unit.get("xof", product.get("xof", 0)) or 0)
        if xof <= 0:
            return None, f"Prix indisponible pour {product.get('name')}"
        out.append({
            "id": pid,
            "name": product.get("name"),
            "emoji": product.get("emoji", "📦"),
            "img": product.get("img"),
            "qty": qty,
            "sz": size or "",
            "price": round(float(unit.get("price", product.get("price", 0)) or 0), 2),
            "ton": round(float(unit.get("ton", product.get("ton", 0)) or 0), 4),
            "xof": xof,
        })
    return out, None


def _client_fields(body):
    return {
        "client_name": _clip(body.get("client_name"), 120) or None,
        "client_phone": _clip(body.get("client_phone"), 40) or None,
        "client_address": _clip(body.get("client_address"), 300) or None,
    }


def _append_order(data, items, extra):
    """Crée la commande + facture (à appeler sous data_tx). Retourne (order, invoice_filename, invoice_pdf)."""
    nums = [int(o["id"].split("-")[1]) for o in data["orders"] if "-" in o.get("id", "") and o["id"].split("-")[1].isdigit()]
    order = {
        "id": f"ORD-{max(nums, default=1000) + 1}",
        "items": items,
        "total": round(sum(i["price"] * i["qty"] for i in items), 2),
        "totalXof": int(sum(i["xof"] * i["qty"] for i in items)),
        "status": "pending",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        **extra,
    }
    data["orders"].insert(0, order)
    invoice_filename, invoice_pdf, invoice_number = _create_invoice_pdf_and_store(data, order)
    order["invoice_number"] = invoice_number
    return order, invoice_filename, invoice_pdf


@app.route("/api/orders", methods=["GET"])
def get_orders():
    """Admin : toutes les commandes (filtre optionnel ?telegram_user_id=). Client : ses commandes."""
    data = load_data()
    orders = data["orders"]
    if _is_admin() and request.args.get("mine") != "1":
        tg_id = request.args.get("telegram_user_id")
        if tg_id:
            orders = [o for o in orders if _same_user(o.get("telegram_user_id"), tg_id)]
        return jsonify(orders)
    uid = _session_user_id()
    if not uid:
        return jsonify({"error": "Connexion Telegram requise"}), 401
    return jsonify([o for o in orders if _same_user(o.get("telegram_user_id"), uid)])


@app.route("/api/orders", methods=["POST"])
@limiter.limit("20 per minute")
def create_order():
    """Créer une commande (webapp ou bot). Prix recalculés côté serveur."""
    body = request.get_json(silent=True) or {}
    payment = str(body.get("payment_method") or "").strip().lower()
    if payment not in ORDER_PAYMENT_METHODS:
        return jsonify({"error": "Moyen de paiement invalide (Mobile Money : /api/payments/jeko, Stars : /api/invoice/stars)"}), 400
    uid = _acting_user_id(body.get("telegram_user_id"))
    extra = {
        "telegram_user_id": _uid_value(uid) if uid else None,
        "payment_method": payment,
        **_client_fields(body),
    }
    if payment == "ton":
        extra["ton_tx_boc"] = _clip(body.get("ton_tx_boc"), 4096) or None
        extra["payment_note"] = "Paiement TON à vérifier on-chain avant confirmation"
    with data_tx() as data:
        _cleanup_expired_pending_invoices(data)
        items, err = _price_items(data, body.get("items"))
        if err:
            return jsonify({"error": err}), 400
        order, invoice_filename, invoice_pdf = _append_order(data, items, extra)

    _notify_admin_new_order(order, payment=_payment_label(order))
    _send_telegram_document(invoice_pdf, invoice_filename, caption=f"🧾 Facture {order['invoice_number']} — {order['id']}")
    return jsonify(order), 201


def _payment_label(order):
    if order.get("payment_method") == "jeko":
        return f"Jèko · {JEKO_OPERATORS.get(order.get('payment_operator'), order.get('payment_operator') or 'Mobile Money')}"
    return {
        "momo": "Mobile Money (manuel)",
        "wave": "Wave (manuel)",
        "djamo": "Djamo (manuel)",
        "ton": "TON (à vérifier)",
        "stars": "Stars ★",
    }.get(order.get("payment_method"), order.get("payment_method") or "—")


def _notify_admin_new_order(order, payment=None):
    """Envoie une alerte aux admins Telegram pour une nouvelle commande."""
    e = lambda v: html.escape(str(v if v not in (None, "") else "—"))
    items_txt = "\n".join(
        f"• {e(i.get('emoji', '📦'))} {e(i.get('name', '?'))} ({e(i.get('sz'))}) × {int(i.get('qty', 1))} — "
        + f"{int(i.get('xof', 0)) * int(i.get('qty', 1)):,} F".replace(",", " ")
        for i in order.get("items", [])
    )
    total_xof = order.get("totalXof") or 0
    pay_line = f"\n💳 Paiement : {e(payment)}\n" if payment else "\n"
    msg = (
        f"🔔 <b>Nouvelle commande {e(order.get('id', ''))}</b>\n\n"
        f"👤 {e(order.get('client_name'))}"
        + (f" (TG {e(order.get('telegram_user_id'))})" if order.get("telegram_user_id") else "")
        + "\n"
        f"📞 {e(order.get('client_phone'))}\n"
        f"📍 {e(order.get('client_address'))}{pay_line}\n"
        f"{items_txt}\n\n"
        + f"💰 Total : {total_xof:,} F".replace(",", " ")
    )
    if order.get("payment_note"):
        msg += f"\n⚠️ {e(order['payment_note'])}"
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


def _invoice_lines(order, invoice_number):
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
        f"Paiement: {_payment_label(order)}",
        "",
        "Merci pour votre confiance.",
    ]
    return lines


def _create_invoice_pdf_and_store(data, order):
    data.setdefault("invoices", [])
    invoice_number = f"INV-{datetime.now().strftime('%Y%m%d')}-{len(data['invoices']) + 1:04d}"
    pdf_bytes = _build_simple_pdf(_invoice_lines(order, invoice_number))
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
    uploaded = None
    if BLOB_READ_WRITE_TOKEN:
        try:
            uploaded = _upload_bytes_to_blob(
                blob=pdf_bytes,
                folder="invoices",
                original_name=filename,
                content_type="application/pdf",
            )
        except Exception as e:
            app.logger.warning(f"Invoice Blob upload failed: {e}")
    if uploaded:
        invoice_entry["pdf_url"] = uploaded.get("url")
        invoice_entry["pdf_pathname"] = uploaded.get("pathname")
    else:
        invoice_entry["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")
    data["invoices"].insert(0, invoice_entry)
    return filename, pdf_bytes, invoice_number


def _build_invoice_pdf_only(order, invoice_number=None):
    """Construit le PDF de facture sans l'enregistrer (pour renvoi à la validation)."""
    inv_num = invoice_number or order.get("invoice_number") or f"INV-VALID-{order.get('id', '')}"
    pdf_bytes = _build_simple_pdf(_invoice_lines(order, inv_num))
    filename = f"{inv_num}_{order.get('id', 'order')}.pdf"
    return filename, pdf_bytes


def _get_invoice_pdf_for_order(data, order):
    """Retourne (filename, pdf_bytes) pour une commande."""
    order_id = order.get("id")
    for inv in data.get("invoices", []):
        if inv.get("order_id") == order_id:
            if inv.get("pdf_base64"):
                try:
                    pdf_bytes = base64.b64decode(inv["pdf_base64"])
                    return (inv.get("filename") or f"invoice_{order_id}.pdf", pdf_bytes)
                except Exception:
                    pass
            if inv.get("pdf_url") and _is_blob_url(inv["pdf_url"]):
                try:
                    with urllib.request.urlopen(inv["pdf_url"], timeout=10) as resp:
                        pdf_bytes = resp.read()
                    return (inv.get("filename") or f"invoice_{order_id}.pdf", pdf_bytes)
                except Exception:
                    pass
            break
    return _build_invoice_pdf_only(order)


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
            app.logger.warning(f"Telegram sendDocument failed for {chat_id}: {type(e).__name__}")


def _cleanup_expired_pending_invoices(data):
    """Nettoie les factures Stars en attente expirées (à appeler sous data_tx)."""
    data.setdefault("pending_invoices", {})
    now_ts = int(time.time())
    ttl = max(60, int(PENDING_INVOICE_TTL_SECONDS))
    stale_ids = [
        inv_id for inv_id, payload in data["pending_invoices"].items()
        if int((payload or {}).get("created_at_ts") or 0) <= 0
        or (now_ts - int((payload or {}).get("created_at_ts") or 0)) > ttl
    ]
    for inv_id in stale_ids:
        data["pending_invoices"].pop(inv_id, None)


@app.route("/api/orders/<order_id>/status", methods=["PATCH"])
def update_order_status(order_id):
    """Mettre à jour le statut d'une commande"""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    status = body.get("status")
    with data_tx() as data:
        if status not in data.get("statuses", {}):
            return jsonify({"error": "Statut invalide"}), 400
        order = next((o for o in data["orders"] if o["id"] == order_id), None)
        if not order:
            return jsonify({"error": "Commande introuvable"}), 404
        order["status"] = status
        order["updated_at"] = datetime.now().isoformat(timespec="seconds")
        invoice = _get_invoice_pdf_for_order(data, order) if status == "confirmed" else None
    if invoice:
        filename, pdf_bytes = invoice
        _send_telegram_document(pdf_bytes, filename, caption=f"✅ Facture validée — {order.get('id', '')}")
    if order.get("telegram_user_id"):
        st = (data.get("statuses") or {}).get(status) or {}
        _send_telegram_to(order["telegram_user_id"], f"{st.get('icon', '📦')} Ta commande <b>{html.escape(order['id'])}</b> est maintenant : <b>{html.escape(st.get('label', status))}</b>")
    return jsonify(order)


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

_ton_cache = {"usd": 0.0, "ts": 0.0}


def _fetch_ton_usd():
    """Récupère le prix TON en USD via CoinGecko (cache 5 min). Retourne 0 si échec."""
    if _ton_cache["usd"] > 0 and time.time() - _ton_cache["ts"] < 300:
        return _ton_cache["usd"]
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=ton&vs_currencies=usd"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        v = float(data.get("ton", {}).get("usd", 0))
        if v > 0:
            _ton_cache.update(usd=v, ts=time.time())
        return v
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


def _xof_to_stars(total_xof):
    total_stars = 0.0
    ton_usd = _get_ton_usd()
    if ton_usd > 0 and XOF_PER_USD > 0 and STARS_PER_TON > 0:
        total_stars = (float(total_xof) / XOF_PER_USD) / ton_usd * STARS_PER_TON
    if total_stars < 0.01 and XOF_PER_STAR_FALLBACK >= 1:
        total_stars = float(total_xof) / XOF_PER_STAR_FALLBACK
    return max(1, int(round(total_stars)))


@app.route("/api/invoice/stars", methods=["POST"])
@limiter.limit("10 per minute")
def create_invoice_stars():
    """Crée un lien de facture Telegram Stars. Montant calculé côté serveur depuis le catalogue."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "Bot non configuré"}), 500
    uid = _session_user_id()
    if not uid:
        return jsonify({"error": "Ouvre l'app depuis Telegram pour payer en Stars"}), 401
    body = request.get_json(silent=True) or {}
    with data_tx() as data:
        _cleanup_expired_pending_invoices(data)
        items, err = _price_items(data, body.get("items"))
        if err:
            return jsonify({"error": err}), 400
        total_xof = sum(i["xof"] * i["qty"] for i in items)
        stars_int = _xof_to_stars(total_xof)
        inv_id = f"inv_{int(time.time() * 1000)}_{os.urandom(6).hex()}"
        data["pending_invoices"][inv_id] = {
            "items": items,
            "stars": stars_int,
            "total_xof": total_xof,
            "telegram_user_id": _uid_value(uid),
            **_client_fields(body),
            "created_at_ts": int(time.time()),
        }

    api_payload = {
        "title": "StickerStreet — Commande",
        "description": f"{len(items)} article(s) — {total_xof:,} F".replace(",", " ")[:255],
        "payload": inv_id,
        "currency": "XTR",
        "prices": [{"label": "Stars", "amount": stars_int}],
    }
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/createInvoiceLink"
        req = urllib.request.Request(url, data=json.dumps(api_payload).encode("utf-8"), method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
        if result.get("ok") and result.get("result"):
            return jsonify({"url": result["result"], "stars": stars_int, "total_xof": total_xof})
        return jsonify({"error": result.get("description", "Erreur inconnue Telegram")}), 502
    except urllib.error.HTTPError as e:
        try:
            err_msg = json.loads(e.read().decode()).get("description", "Erreur Telegram")
        except Exception:
            err_msg = "Erreur Telegram"
        return jsonify({"error": err_msg}), 502
    except Exception as e:
        app.logger.warning(f"createInvoiceLink error: {type(e).__name__}")
        return jsonify({"error": "Impossible de créer la facture"}), 502


@app.route("/api/invoice/stars/<inv_id>", methods=["GET"])
def get_pending_invoice(inv_id):
    """Utilisé par le bot au pre_checkout pour vérifier la facture et son montant."""
    auth_err = _require_bot_key()
    if auth_err:
        return auth_err
    pending = (load_data().get("pending_invoices") or {}).get(inv_id)
    if not pending:
        return jsonify({"error": "Facture introuvable ou expirée"}), 404
    return jsonify({"invoice_id": inv_id, "stars": pending.get("stars"), "telegram_user_id": pending.get("telegram_user_id")})


@app.route("/api/orders/from-invoice", methods=["POST"])
@limiter.limit("20 per minute")
def create_order_from_invoice():
    """Crée une commande à partir d'un invoice_id (appelé par le bot après paiement Stars)."""
    auth_err = _require_bot_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    inv_id = body.get("invoice_id") or body.get("invoice_payload")
    paid = body.get("paid_stars")
    with data_tx() as data:
        _cleanup_expired_pending_invoices(data)
        if not inv_id or inv_id not in data["pending_invoices"]:
            return jsonify({"error": "Facture introuvable ou expirée"}), 404
        pending = data["pending_invoices"].pop(inv_id)
        extra = {
            "telegram_user_id": _uid_value(body.get("telegram_user_id") or pending.get("telegram_user_id")),
            "client_name": pending.get("client_name"),
            "client_phone": pending.get("client_phone"),
            "client_address": pending.get("client_address"),
            "payment_method": "stars",
            "paid_stars": paid,
            "expected_stars": pending.get("stars"),
            "telegram_charge_id": _clip(body.get("telegram_payment_charge_id"), 200) or None,
        }
        try:
            if int(paid) < int(pending.get("stars") or 0):
                extra["payment_note"] = f"Montant payé ({paid}★) inférieur au montant attendu ({pending.get('stars')}★)"
        except (TypeError, ValueError):
            extra["payment_note"] = "Montant payé non transmis par le bot"
        order, invoice_filename, invoice_pdf = _append_order(data, pending["items"], extra)

    _notify_admin_new_order(order, payment=f"Stars ★ ({paid})")
    _send_telegram_document(invoice_pdf, invoice_filename, caption=f"🧾 Facture {order['invoice_number']} — {order['id']}")
    return jsonify(order), 201


# ==================== Paiement Jèko ====================

def _jeko_enabled():
    return bool(JEKO_API_KEY and JEKO_API_KEY_ID and JEKO_WEBHOOK_SECRET and PUBLIC_APP_URL)


def _jeko_call(method, path, body=None, timeout=20):
    """Appel authentifié à l'API Jèko. Retourne (status_http, json)."""
    req = urllib.request.Request(
        f"{JEKO_API_BASE}{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        method=method,
        headers={"X-API-KEY": JEKO_API_KEY, "X-API-KEY-ID": JEKO_API_KEY_ID, "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


_jeko_store_cache = {"id": JEKO_STORE_ID}


def _jeko_store_id():
    """JEKO_STORE_ID, sinon le premier magasin du compte (GET /partner_api/stores)."""
    if _jeko_store_cache["id"]:
        return _jeko_store_cache["id"]
    code, res = _jeko_call("GET", "/partner_api/stores")
    stores = res if isinstance(res, list) else (res.get("data") or res.get("stores") or res.get("items") or [])
    if code == 200 and stores:
        _jeko_store_cache["id"] = str(stores[0].get("id") or "")
    return _jeko_store_cache["id"]


def _find_jeko_order(data, reference=None, request_id=None):
    for o in data.get("orders", []):
        if o.get("payment_method") != "jeko":
            continue
        if (reference and o.get("jeko_reference") == reference) or (request_id and o.get("jeko_payment_request_id") == request_id):
            return o
    return None


def _jeko_amount_matches(order, amount):
    """Le montant notifié doit correspondre au total (Jèko compte en centimes ; on tolère les deux unités)."""
    try:
        amount = int(round(float(amount)))
    except (TypeError, ValueError):
        return False
    expected = int(order.get("totalXof") or 0)
    return amount in (expected * 100, expected)


def _mark_jeko_paid(order, transaction_id=None, amount=None):
    """Passe la commande en payée (à appeler sous data_tx). Retourne True si l'état a changé."""
    if order.get("payment_status") == "paid":
        return False
    if amount is not None and not _jeko_amount_matches(order, amount):
        order["payment_status"] = "review"
        order["payment_note"] = f"Montant Jèko reçu ({amount}) différent du total ({order.get('totalXof')} F) : à vérifier"
        return True
    order["payment_status"] = "paid"
    order["paid_at"] = datetime.now().isoformat(timespec="seconds")
    if transaction_id:
        order["jeko_transaction_id"] = transaction_id
    if order.get("status") == "pending":
        order["status"] = "confirmed"
    order.pop("payment_note", None)
    return True


def _after_jeko_update(order):
    """Notifications hors verrou après un changement d'état de paiement."""
    if order.get("payment_status") == "paid":
        _notify_admin_new_order(order, payment=f"✅ PAYÉ — {_payment_label(order)}")
        data = load_data()
        filename, pdf_bytes = _get_invoice_pdf_for_order(data, order)
        _send_telegram_document(pdf_bytes, filename, caption=f"🧾 Facture payée — {order['id']}")
        if order.get("telegram_user_id"):
            _send_telegram_to(order["telegram_user_id"], f"✅ Paiement reçu pour ta commande <b>{html.escape(order['id'])}</b> ({order.get('totalXof')} F). On lance l'impression !")
    elif order.get("payment_status") == "review":
        _send_telegram(f"⚠️ <b>Paiement Jèko à vérifier</b> — {html.escape(order['id'])}\n{html.escape(order.get('payment_note', ''))}")


@app.route("/api/payments/config", methods=["GET"])
def payments_config():
    """Moyens de paiement disponibles (la webapp masque Jèko tant que les clés ne sont pas configurées)."""
    return jsonify({
        "jeko": {"enabled": _jeko_enabled(), "operators": [{"id": k, "label": v} for k, v in JEKO_OPERATORS.items()]},
        "stars": {"enabled": bool(TELEGRAM_BOT_TOKEN)},
    })


@app.route("/api/payments/jeko", methods=["POST"])
@limiter.limit("10 per minute")
def create_jeko_payment():
    """Crée la commande + une demande de paiement Jèko, et renvoie l'URL de paiement."""
    if not _jeko_enabled():
        return jsonify({"error": "Paiement Mobile Money indisponible pour le moment"}), 503
    body = request.get_json(silent=True) or {}
    operator = str(body.get("payment_method") or "").strip().lower()
    if operator not in JEKO_OPERATORS:
        return jsonify({"error": "Choisis un opérateur : " + ", ".join(JEKO_OPERATORS.values())}), 400
    store_id = _jeko_store_id()
    if not store_id:
        return jsonify({"error": "Boutique Jèko introuvable (JEKO_STORE_ID)"}), 503

    data = load_data()
    items, err = _price_items(data, body.get("items"))
    if err:
        return jsonify({"error": err}), 400
    total_xof = sum(i["xof"] * i["qty"] for i in items)
    reference = f"SS-{int(time.time())}-{os.urandom(6).hex()}"
    back = f"{PUBLIC_APP_URL}/#/orders?paiement=retour&ref={reference}"
    code, res = _jeko_call("POST", "/partner_api/payment_requests", {
        "storeId": store_id,
        "amountCents": int(total_xof) * 100,
        "currency": "XOF",
        "reference": reference,
        "paymentDetails": {"type": "redirect", "data": {
            "paymentMethod": operator,
            "successUrl": back,
            "errorUrl": f"{PUBLIC_APP_URL}/#/cart?paiement=echec&ref={reference}",
        }},
    })
    redirect_url = (res or {}).get("redirectUrl")
    if code not in (200, 201) or not redirect_url:
        app.logger.warning(f"Jèko payment_requests HTTP {code}: {str(res)[:300]}")
        return jsonify({"error": "Jèko n'a pas pu créer le paiement. Réessaie dans un instant."}), 502

    uid = _acting_user_id(body.get("telegram_user_id"))
    extra = {
        "telegram_user_id": _uid_value(uid) if uid else None,
        "payment_method": "jeko",
        "payment_operator": operator,
        "payment_status": "awaiting",
        "jeko_reference": reference,
        "jeko_payment_request_id": res.get("id"),
        **_client_fields(body),
    }
    with data_tx() as data:
        items, err = _price_items(data, body.get("items"))
        if err:
            return jsonify({"error": err}), 400
        order, _, _ = _append_order(data, items, extra)
    return jsonify({"order": order, "redirect_url": redirect_url, "reference": reference}), 201


@app.route("/api/payments/jeko/<reference>", methods=["GET"])
def jeko_payment_status(reference):
    """État du paiement (la référence aléatoire sert de jeton). Interroge Jèko si le webhook tarde."""
    order = _find_jeko_order(load_data(), reference=reference)
    if not order:
        return jsonify({"error": "Paiement introuvable"}), 404
    if order.get("payment_status") == "awaiting" and order.get("jeko_payment_request_id") and _jeko_enabled():
        code, res = _jeko_call("GET", f"/partner_api/payment_requests/{order['jeko_payment_request_id']}", timeout=10)
        remote = str((res or {}).get("status") or "").lower() if code == 200 else ""
        if remote in ("success", "error"):
            changed = False
            with data_tx() as data:
                o = _find_jeko_order(data, reference=reference)
                if o and o.get("payment_status") == "awaiting":
                    if remote == "success":
                        changed = _mark_jeko_paid(o, amount=res.get("amountCents") or res.get("amount"))
                    else:
                        o["payment_status"] = "failed"
                order = o or order
            if changed:
                _after_jeko_update(order)
    return jsonify({"order_id": order["id"], "payment_status": order.get("payment_status"), "status": order.get("status"), "totalXof": order.get("totalXof")})


@app.route("/api/webhooks/jeko", methods=["POST"])
def jeko_webhook():
    """Notification Jèko signée (Jeko-Signature = HMAC-SHA256 hex du corps brut avec le secret webhook)."""
    raw = request.get_data(cache=False)
    if not JEKO_WEBHOOK_SECRET:
        return jsonify({"error": "Webhook non configuré"}), 503
    expected = hmac.new(JEKO_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    received = (request.headers.get("Jeko-Signature") or "").strip().lower()
    if not received or not hmac.compare_digest(expected, received):
        return jsonify({"error": "Signature invalide"}), 401
    event = (request.headers.get("Jeko-Event") or "").strip()
    try:
        tx = json.loads(raw.decode("utf-8") or "{}")
    except ValueError:
        return jsonify({"error": "JSON invalide"}), 400
    event = event or str(tx.get("event") or "")
    if event and event != "TRANSACTION_COMPLETED":
        return jsonify({"ok": True, "ignored": event})
    tx = tx.get("data") if isinstance(tx.get("data"), dict) else tx
    details = tx.get("transactionDetails") or {}
    status = str(tx.get("status") or "").lower()
    changed, order = False, None
    with data_tx() as data:
        order = _find_jeko_order(data, reference=details.get("reference") or tx.get("reference"),
                                 request_id=details.get("paymentRequestId") or tx.get("paymentRequestId"))
        if not order:
            app.logger.warning(f"Webhook Jèko sans commande associée (tx {tx.get('id')})")
            return jsonify({"ok": True, "unknown": True})
        if tx.get("id") and order.get("jeko_transaction_id") == tx.get("id"):
            return jsonify({"ok": True, "duplicate": True})
        if status == "success":
            changed = _mark_jeko_paid(order, transaction_id=tx.get("id"), amount=tx.get("amount"))
        elif status == "error" and order.get("payment_status") == "awaiting":
            order["payment_status"] = "failed"
            changed = False
    if changed:
        _after_jeko_update(order)
    return jsonify({"ok": True})


# ==================== Clients / sessions ====================

def _upsert_client(data, user_id, name, username):
    data.setdefault("clients", [])
    existing = next((c for c in data["clients"] if _same_user(c.get("telegram_user_id"), user_id)), None)
    if existing:
        existing["name"] = existing.get("name") or name
        existing["telegram_username"] = username
        existing["updated_at"] = datetime.now().isoformat()
        return existing, False
    client = {
        "id": f"CLI-{len(data['clients']) + 1}",
        "telegram_user_id": _uid_value(user_id),
        "telegram_username": username,
        "name": name,
        "phone": "",
        "address": "",
        "created_at": datetime.now().isoformat(),
    }
    data["clients"].append(client)
    return client, True


def _session_response(user_id, name, username):
    with data_tx() as data:
        client, created = _upsert_client(data, user_id, name, username)
    return jsonify({
        "telegram_user_id": user_id,
        "name": name,
        "username": username,
        "client": client,
        "token": _issue_session(user_id),
        "is_admin": str(user_id) in ADMIN_TELEGRAM_IDS,
    }), (201 if created else 200)


@app.route("/api/auth/telegram", methods=["POST"])
@limiter.limit("10 per minute")
def auth_telegram():
    """Valide les données du Telegram Login Widget et ouvre une session."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "Bot non configuré"}), 500
    body = request.get_json(silent=True) or {}
    user_id = body.get("id")
    auth_date = body.get("auth_date")
    hash_val = body.get("hash")
    if not user_id or not hash_val or not auth_date:
        return jsonify({"error": "Données incomplètes"}), 400

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(body.items()) if k != "hash")
    secret = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    computed = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, str(hash_val)):
        return jsonify({"error": "Hash invalide"}), 400
    try:
        if abs(time.time() - int(auth_date)) > 86400:
            return jsonify({"error": "Session expirée"}), 400
    except (TypeError, ValueError):
        return jsonify({"error": "auth_date invalide"}), 400

    first_name = body.get("first_name", "")
    last_name = body.get("last_name", "")
    username = body.get("username", "")
    name = f"{first_name} {last_name}".strip() or username or f"User{user_id}"
    return _session_response(user_id, name, username)


def _validate_init_data(init_data):
    """Valide initData des Mini Apps Telegram et retourne le user (dict) ou None."""
    if not TELEGRAM_BOT_TOKEN or not init_data or not init_data.strip():
        return None
    try:
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
        if not auth_date or abs(time.time() - int(auth_date)) > 86400:
            return None  # Replay: 24h
        user_json = params_single.get("user")
        if not user_json:
            return None
        return json.loads(user_json)
    except (json.JSONDecodeError, ValueError, KeyError):
        return None


@app.route("/api/auth/telegram-miniapp", methods=["POST"])
@limiter.limit("10 per minute")
def auth_telegram_miniapp():
    """Connexion automatique (Mini App) : initData signé obligatoire."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "Bot non configuré"}), 500
    body = request.get_json(silent=True) or {}
    user = _validate_init_data(str(body.get("init_data") or "").strip())
    if not user or not user.get("id"):
        return jsonify({"error": "init_data requis ou invalide"}), 401
    user_id = user.get("id")
    username = user.get("username", "")
    name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or username or f"User{user_id}"
    return _session_response(user_id, name, username)


@app.route("/api/admin/me", methods=["GET"])
@limiter.limit("10 per minute")
def admin_me():
    """Vérifie une clé admin (navigateur) ou une session admin Telegram."""
    if _is_admin():
        return jsonify({"admin": True})
    return jsonify({"admin": False}), 401


@app.route("/api/register", methods=["POST"])
def register_client():
    """Inscription / mise à jour du profil client (bot avec clé, ou client connecté)."""
    body = request.get_json(silent=True) or {}
    tg_id = _acting_user_id(body.get("telegram_user_id"))
    if not tg_id:
        return jsonify({"error": "Connexion Telegram requise"}), 401
    name = _clip(body.get("name"), 120)
    if not name:
        return jsonify({"error": "Nom requis"}), 400
    with data_tx() as data:
        client, created = _upsert_client(data, tg_id, name, body.get("username") or "")
        client["name"] = name
        client["phone"] = _clip(body.get("phone"), 40)
        client["address"] = _clip(body.get("address"), 300)
    return jsonify(client), (201 if created else 200)


@app.route("/api/profile", methods=["GET"])
def get_profile():
    """Profil du client connecté (ou de telegram_user_id pour le bot)."""
    tg_id = _acting_user_id(request.args.get("telegram_user_id"))
    if not tg_id:
        return jsonify({"error": "Connexion Telegram requise"}), 401
    data = load_data()
    client = next((c for c in data.get("clients", []) if _same_user(c.get("telegram_user_id"), tg_id)), None)
    if not client:
        return jsonify({"error": "Profil non trouvé"}), 404
    return jsonify(client)


@app.route("/api/profile", methods=["PATCH"])
def update_profile():
    """Met à jour le profil du client connecté (nom, téléphone, adresse)."""
    body = request.get_json(silent=True) or {}
    tg_id = _acting_user_id(body.get("telegram_user_id"))
    if not tg_id:
        return jsonify({"error": "Connexion Telegram requise"}), 401
    with data_tx() as data:
        client = next((c for c in data.get("clients", []) if _same_user(c.get("telegram_user_id"), tg_id)), None)
        if not client:
            return jsonify({"error": "Profil non trouvé"}), 404
        limits = {"name": 120, "phone": 40, "address": 300}
        for field, limit in limits.items():
            if body.get(field) is not None:
                client[field] = _clip(body[field], limit)
        client["updated_at"] = datetime.now().isoformat()
    return jsonify(client)


@app.route("/api/health", methods=["GET"])
def health():
    warnings = []
    if not ADMIN_API_KEY:
        warnings.append("ADMIN_API_KEY non configuré — seuls les admins Telegram ont accès au panel")
    if not BLOB_READ_WRITE_TOKEN:
        warnings.append("BLOB_READ_WRITE_TOKEN manquant — images enregistrées sur disque")
    if not TELEGRAM_BOT_TOKEN:
        warnings.append("TELEGRAM_BOT_TOKEN manquant — notifications et connexion Telegram désactivées")
    if not _HAS_LIMITER:
        warnings.append("flask-limiter non installé — rate limiting désactivé")
    if _cors_origins == ["*"]:
        warnings.append("ALLOWED_ORIGINS non défini — CORS ouvert à tous les domaines")
    if not _jeko_enabled():
        warnings.append("Jèko non configuré (JEKO_API_KEY, JEKO_API_KEY_ID, JEKO_WEBHOOK_SECRET, PUBLIC_APP_URL) — paiement Mobile Money masqué")
    return jsonify({
        "status": "ok",
        "service": "stickerstreet-api",
        "storage": "neon" if is_database_enabled() else "file",
        "warnings": warnings,
    })


def _telegram_send_message(chat_id, text):
    req_data = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        data=req_data, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    urllib.request.urlopen(req, timeout=5)


def _send_telegram(text):
    """Envoie un message aux admins via Telegram."""
    if not TELEGRAM_BOT_TOKEN or not ADMIN_TELEGRAM_IDS:
        return
    for chat_id in ADMIN_TELEGRAM_IDS:
        try:
            _telegram_send_message(chat_id, text)
        except Exception as e:
            app.logger.warning(f"Telegram send failed for {chat_id}: {type(e).__name__}")


def _send_telegram_to(chat_id, text):
    """Message à un client (best effort : il doit avoir démarré le bot)."""
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return
    try:
        _telegram_send_message(chat_id, text)
    except Exception as e:
        app.logger.info(f"Telegram message to client {chat_id} failed: {type(e).__name__}")


# ==================== Chat support (un fil par client) ====================

def _welcome_message():
    return {"from": "bot", "text": "Salut ! 👋 Bienvenue chez StickerStreet. Dis-moi ce qu'il te faut !", "time": datetime.now().strftime("%H:%M")}


@app.route("/api/chat", methods=["GET"])
def get_chat():
    """Messages du fil de support du client connecté."""
    uid = _session_user_id()
    if not uid:
        return jsonify({"error": "Connexion Telegram requise pour le chat"}), 401
    messages = (load_data().get("chats") or {}).get(uid) or []
    return jsonify(messages or [_welcome_message()])


@app.route("/api/chat", methods=["POST"])
@limiter.limit("30 per minute")
def post_chat():
    """Le client envoie un message → stockage + notification admin Telegram."""
    uid = _session_user_id()
    if not uid:
        return jsonify({"error": "Connexion Telegram requise pour le chat"}), 401
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()[:MAX_TEXT_LEN]
    if not text:
        return jsonify({"error": "Message vide"}), 400
    with data_tx() as data:
        thread = data.setdefault("chats", {}).setdefault(uid, [])
        thread.append({"from": "user", "text": text, "time": datetime.now().strftime("%H:%M"), "ts": int(time.time())})
        del thread[:-200]
        messages = list(thread)
        client = next((c for c in data.get("clients", []) if _same_user(c.get("telegram_user_id"), uid)), {}) or {}

    who = html.escape(client.get("name") or f"User{uid}")
    # Le tag #U<id> permet au bot de retrouver le client quand l'admin répond à ce message.
    _send_telegram(f"📩 <b>{who}</b> (WebApp) #U{uid}\n\n{html.escape(text)}\n\n<i>↩️ Réponds à ce message pour répondre au client.</i>")
    return jsonify(messages)


@app.route("/api/chat/reply", methods=["POST"])
def post_chat_reply():
    """L'admin répond via le bot → ajout du message dans le fil du client."""
    auth_err = _require_admin_api_key()
    if auth_err:
        return auth_err
    body = request.get_json(silent=True) or {}
    uid = str(body.get("telegram_user_id") or "").strip()
    text = (body.get("text") or "").strip()[:MAX_TEXT_LEN]
    if not uid:
        return jsonify({"error": "telegram_user_id requis"}), 400
    if not text:
        return jsonify({"error": "Message vide"}), 400
    with data_tx() as data:
        thread = data.setdefault("chats", {}).setdefault(uid, [])
        thread.append({"from": "bot", "text": text, "time": datetime.now().strftime("%H:%M"), "ts": int(time.time())})
        del thread[:-200]
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="127.0.0.1", port=port, debug=debug)
