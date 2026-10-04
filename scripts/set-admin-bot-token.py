#!/usr/bin/env python3
"""
Active le bot équipe « StickerStreet Admin » : saisie masquée du token BotFather, vérification auprès
de Telegram, enregistrement dans bot/.env et api/.env, puis (re)démarrage des services.
Usage : python3 /var/www/stickerstreet/scripts/set-admin-bot-token.py
"""
import getpass, json, os, re, shutil, subprocess, sys, time, urllib.request

APP = "/var/www/stickerstreet"
FILES = [f"{APP}/bot/.env", f"{APP}/api/.env"]


def env_value(path, key):
    m = re.search(rf"^{key}=(.*)$", open(path, encoding="utf-8").read(), flags=re.M)
    return m.group(1).strip().strip("\"'") if m else ""


def get_me(token):
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getMe", timeout=15) as r:
            return json.loads(r.read()).get("result")
    except Exception:
        return None


token = getpass.getpass("Token du bot « StickerStreet Admin » (donné par @BotFather, rien ne s'affiche) : ").strip()
if not re.fullmatch(r"\d{6,12}:[\w-]{30,}", token):
    sys.exit("❌ Ce n'est pas un token BotFather valide. Rien n'a été modifié.")
if token == env_value(f"{APP}/bot/.env", "TELEGRAM_BOT_TOKEN"):
    sys.exit("❌ C'est le token du bot CLIENT @StickerStreetbot : il faut celui du NOUVEAU bot admin. Rien n'a été modifié.")

me = get_me(token)
if not me:
    sys.exit("❌ Telegram refuse ce token (révoqué ou mal copié). Rien n'a été modifié.")
print(f"✅ Bot reconnu : @{me['username']} ({me['first_name']})")

for path in FILES:
    text = open(path, encoding="utf-8").read()
    backup = f"{path}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, backup)
    os.chmod(backup, 0o600)
    line = f'ADMIN_BOT_TOKEN="{token}"'
    if re.search(r"^ADMIN_BOT_TOKEN=", text, flags=re.M):
        text = re.sub(r"^ADMIN_BOT_TOKEN=.*$", lambda _: line, text, flags=re.M)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"
    open(path, "w", encoding="utf-8").write(text)
    os.chmod(path, 0o600)
print("✅ Token enregistré dans bot/.env et api/.env (sauvegardes .bak-* à supprimer une fois que tout marche)")

subprocess.run(["pm2", "restart", "stickerstreet-api", "stickerstreet-bot", "--update-env"], stdout=subprocess.DEVNULL)
running = subprocess.run(["pm2", "describe", "stickerstreet-admin-bot"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
cmd = ["pm2", "restart", "stickerstreet-admin-bot", "--update-env"] if running else \
      ["pm2", "start", f"{APP}/ecosystem.config.cjs", "--only", "stickerstreet-admin-bot"]
subprocess.run(cmd, stdout=subprocess.DEVNULL)
subprocess.run(["pm2", "save"], stdout=subprocess.DEVNULL)
time.sleep(8)
status = subprocess.run(["pm2", "jlist"], capture_output=True, text=True).stdout
state = next((p["pm2_env"]["status"] for p in json.loads(status or "[]") if p["name"] == "stickerstreet-admin-bot"), "?")
print(f"✅ Bot admin : {state}")
print(f"""
Dernière étape : ouvre https://t.me/{me['username']} et appuie sur « Démarrer ».
(Telegram n'autorise un bot à t'écrire qu'après ce premier /start.)
Ensuite : bouton « 👥 Équipe » → « Inviter un employé » pour ajouter ton équipe.""")
