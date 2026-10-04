#!/usr/bin/env python3
"""
Remplace le mot de passe Neon dans DATABASE_URL (api/.env), teste la connexion, puis redémarre l'API.
Usage : python3 /var/www/stickerstreet/scripts/set-neon-password.py
Le mot de passe est saisi sans écho : il n'apparaît ni à l'écran ni dans l'historique du shell.
"""
import getpass, os, re, shutil, subprocess, sys, time, urllib.parse

ENV = os.environ.get("ENV_FILE", "/var/www/stickerstreet/api/.env")
text = open(ENV, encoding="utf-8").read()
m = re.search(r'^DATABASE_URL=(["\']?)(postgres(?:ql)?://)([^:/@]+):([^@]*)@(.+?)\1\s*$', text, flags=re.M)
if not m:
    sys.exit("❌ Ligne DATABASE_URL introuvable ou dans un format inattendu dans " + ENV)
scheme, user, rest = m.group(2), m.group(3), m.group(5)

pwd = getpass.getpass(f"Nouveau mot de passe Neon pour {user} (colle-le puis Entrée, rien ne s'affiche) : ").strip()
if not pwd:
    sys.exit("❌ Mot de passe vide, rien n'a été modifié.")
url = f"{scheme}{user}:{urllib.parse.quote(pwd, safe='')}@{rest}"

print("… test de connexion à Neon")
try:
    import psycopg
    with psycopg.connect(url, connect_timeout=15) as c:
        n = c.execute("select count(*) from kv_store").fetchone()[0]
except Exception as e:
    sys.exit(f"❌ Connexion refusée avec ce mot de passe ({type(e).__name__}). Rien n'a été modifié — vérifie le copier-coller.")
print(f"✅ Connexion OK (table kv_store : {n} ligne(s))")

backup = f"{ENV}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
shutil.copy2(ENV, backup)
os.chmod(backup, 0o600)
new_line = f'DATABASE_URL="{url}"'
text = text[:m.start()] + new_line + text[m.end():]
open(ENV, "w", encoding="utf-8").write(text)
os.chmod(ENV, 0o600)
print(f"✅ {ENV} mis à jour (ancienne version : {backup})")

if os.environ.get("NO_RESTART") != "1":
    subprocess.run(["pm2", "restart", "stickerstreet-api", "--update-env"], check=False, stdout=subprocess.DEVNULL)
    time.sleep(3)
    import urllib.request, json
    try:
        prods = json.loads(urllib.request.urlopen("http://127.0.0.1:5000/api/products", timeout=20).read())
        print(f"✅ API redémarrée : {len(prods)} produits lus depuis Neon")
    except Exception as e:
        print(f"⚠️ API redémarrée mais /api/products ne répond pas encore ({e}). Relance : pm2 logs stickerstreet-api")
