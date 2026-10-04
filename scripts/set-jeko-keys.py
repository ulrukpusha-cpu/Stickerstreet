#!/usr/bin/env python3
"""
Enregistre les clés Jèko dans api/.env sans les afficher, les vérifie auprès de Jèko, puis redémarre l'API.
Usage : python3 /var/www/stickerstreet/scripts/set-jeko-keys.py
Clés : Cockpit Jèko (https://cockpit.jeko.africa) → Paramètres → API & Webhooks.
"""
import getpass, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request

ENV = os.environ.get("ENV_FILE", "/var/www/stickerstreet/api/.env")
BASE = os.environ.get("JEKO_API_BASE", "https://api.jeko.africa").rstrip("/")

text = open(ENV, encoding="utf-8").read()


def current(key):
    m = re.search(rf"^{key}=(.*)$", text, flags=re.M)
    return m.group(1).strip().strip("\"'") if m else ""


def ask(label, key, secret=True):
    have = current(key)
    hint = " (Entrée = garder la valeur actuelle)" if have else ""
    prompt = f"{label}{hint} : "
    value = (getpass.getpass(prompt) if secret else input(prompt)).strip()
    return value or have


print("Saisie des clés Jèko — rien ne s'affiche pendant la frappe, c'est normal.\n")
api_key = ask("Clé API (X-API-KEY)", "JEKO_API_KEY")
key_id = ask("ID de la clé (X-API-KEY-ID)", "JEKO_API_KEY_ID")
secret = ask("Secret du webhook", "JEKO_WEBHOOK_SECRET")
if not (api_key and key_id and secret):
    sys.exit("❌ Les trois valeurs sont obligatoires. Rien n'a été modifié.")

print("\n… vérification des clés auprès de Jèko")
req = urllib.request.Request(f"{BASE}/partner_api/stores", headers={"X-API-KEY": api_key, "X-API-KEY-ID": key_id, "Accept": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.loads(r.read().decode() or "[]")
except urllib.error.HTTPError as e:
    sys.exit(f"❌ Jèko refuse ces clés (HTTP {e.code}). Vérifie le copier-coller. Rien n'a été modifié.")
except Exception as e:
    sys.exit(f"❌ Jèko injoignable ({type(e).__name__}). Rien n'a été modifié.")
stores = res if isinstance(res, list) else (res.get("data") or res.get("stores") or res.get("items") or [])
if not stores:
    sys.exit("❌ Clés valides mais aucun magasin sur ce compte Jèko : crée-en un dans le Cockpit. Rien n'a été modifié.")
print("✅ Clés acceptées par Jèko\n")
# Jamais de choix automatique : un compte Jèko peut contenir la boutique d'une autre activité
# (ex. Bipbiprecharge). Encaisser StickerStreet dessus mélangerait l'argent et les historiques.
print("Boutiques de ce compte Jèko :")
for i, st in enumerate(stores, 1):
    print(f"  {i}. {st.get('name') or '(sans nom)'}  [{st.get('id')}]")
choice = input("\nNuméro de la boutique STICKERSTREET (Entrée = annuler) : ").strip()
if not (choice.isdigit() and 0 < int(choice) <= len(stores)):
    sys.exit("Annulé : rien n'a été modifié. Crée d'abord la boutique StickerStreet dans le Cockpit Jèko si elle n'existe pas.")
store = stores[int(choice) - 1]
name = str(store.get("name") or "")
if "sticker" not in name.lower():
    confirm = input(f"⚠️  « {name or store.get('id')} » ne ressemble pas à StickerStreet. Les paiements de la boutique y seront encaissés.\n"
                    "   Tape OUI en majuscules pour confirmer quand même : ").strip()
    if confirm != "OUI":
        sys.exit("Annulé : rien n'a été modifié.")
store_id = str(store.get("id") or "")
print(f"✅ Boutique : {name or store_id}")


def set_env(key, value):
    global text
    line = f'{key}="{value}"'
    if re.search(rf"^{key}=", text, flags=re.M):
        text = re.sub(rf"^{key}=.*$", lambda _: line, text, flags=re.M)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"


backup = f"{ENV}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
shutil.copy2(ENV, backup)
os.chmod(backup, 0o600)
for k, v in (("JEKO_API_KEY", api_key), ("JEKO_API_KEY_ID", key_id), ("JEKO_WEBHOOK_SECRET", secret), ("JEKO_STORE_ID", store_id)):
    set_env(k, v)
open(ENV, "w", encoding="utf-8").write(text)
os.chmod(ENV, 0o600)
print(f"✅ {ENV} mis à jour (sauvegarde : {backup} — à supprimer une fois que tout marche)")

subprocess.run(["pm2", "restart", "stickerstreet-api", "--update-env"], check=False, stdout=subprocess.DEVNULL)
time.sleep(3)
try:
    cfg = json.loads(urllib.request.urlopen("http://127.0.0.1:5000/api/payments/config", timeout=10).read())
    print("✅ API redémarrée — Jèko", "ACTIVÉ" if cfg["jeko"]["enabled"] else "toujours désactivé (PUBLIC_APP_URL manquant ?)")
except Exception as e:
    print(f"⚠️ API redémarrée mais ne répond pas encore ({e})")

public = current("PUBLIC_APP_URL") or "https://stickerstreet.ci"
print(f"""
Dernière étape dans le Cockpit Jèko → Paramètres → API & Webhooks → « Webhooks par magasin » → Ajouter :
   Magasin : StickerStreet
   URL     : {public}/api/webhooks/jeko
⚠️ Ne touche PAS au « Webhook business (global) » : il sert à Bipbiprecharge (une seule souscription possible).
(Quand stickerstreet.ci sera en ligne, remplace l'URL par https://stickerstreet.ci/api/webhooks/jeko)""")
