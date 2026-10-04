#!/usr/bin/env bash
# Passe stickerstreet.ci en HTTPS et remplace l'URL ngrok partout.
# À lancer une fois le domaine publié par le registre .ci :
#   bash /var/www/stickerstreet/scripts/activer-domaine.sh
set -euo pipefail

DOMAIN="stickerstreet.ci"
WWW="www.$DOMAIN"
IP="163.245.209.14"
APP=/var/www/stickerstreet
SITE=/etc/nginx/sites-available/stickerstreet-domain
URL="https://$DOMAIN"

say() { printf '\n▶ %s\n' "$*"; }

say "1. Vérification DNS (résolveurs publics)"
for name in "$DOMAIN" "$WWW"; do
  got=$(dig +short "$name" A @8.8.8.8 | tail -1)
  if [ "$got" != "$IP" ]; then
    echo "❌ $name ne pointe pas encore vers $IP (réponse : '${got:-rien}')."
    echo "   Le registre .ci n'a pas encore publié le domaine : réessaie plus tard. Rien n'a été modifié."
    exit 1
  fi
  echo "✅ $name → $IP"
done

say "2. certbot (snap isolé : la version apt plante à cause de cryptography/pyOpenSSL)"
if ! command -v certbot >/dev/null; then
  snap install --classic certbot >/dev/null
  ln -sf /snap/bin/certbot /usr/local/bin/certbot
fi
certbot --version

say "3. Certificat Let's Encrypt (webroot, compte existant du serveur)"
certbot certonly --webroot -w /var/www/html -d "$DOMAIN" -d "$WWW" \
  --non-interactive --keep-until-expiring \
  --deploy-hook "systemctl reload nginx"

say "4. Configuration nginx HTTPS"
cp "$SITE" "$SITE.http-only.bak"
cat > "$SITE" <<NGINX
# stickerstreet.ci — HTTPS (webapp :3005 + API :5000). Généré par scripts/activer-domaine.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $WWW;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    return 301 https://$DOMAIN\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX
if ! nginx -t 2>/dev/null; then
  echo "❌ Config nginx invalide : retour à la version HTTP."
  cp "$SITE.http-only.bak" "$SITE"
  nginx -t && systemctl reload nginx
  exit 1
fi
systemctl reload nginx
echo "✅ nginx rechargé en HTTPS"

say "5. URL publique de l'app : ngrok → $URL"
python3 - "$APP" "$URL" <<'PY'
import json, re, sys
app, url = sys.argv[1], sys.argv[2]
def set_env(path, key, value):
    s = open(path, encoding="utf-8").read()
    s = re.sub(rf"^{key}=.*$", f"{key}={value}", s, flags=re.M) if re.search(rf"^{key}=", s, flags=re.M) else s.rstrip("\n") + f"\n{key}={value}\n"
    open(path, "w", encoding="utf-8").write(s)
# CORS : on ajoute le domaine sans retirer ngrok (toujours utilisé pour les démos)
env = f"{app}/api/.env"
s = open(env, encoding="utf-8").read()
m = re.search(r"^ALLOWED_ORIGINS=(.*)$", s, flags=re.M)
origins = [o for o in (m.group(1).split(",") if m else []) if o]
for o in (url, url.replace("https://", "https://www.")):
    if o not in origins:
        origins.insert(0, o)
set_env(env, "ALLOWED_ORIGINS", ",".join(origins))
set_env(f"{app}/webapp/.env", "VITE_APP_URL", url)
set_env(env, "PUBLIC_APP_URL", url)  # retours de paiement Jèko
set_env(f"{app}/bot/.env", "STICKERSTREET_WEBAPP", url)
mf = f"{app}/webapp/public/tonconnect-manifest.json"
d = json.load(open(mf, encoding="utf-8"))
d.update(url=url, iconUrl=f"{url}/icon-192.png", termsOfUseUrl=url, privacyPolicyUrl=url)
json.dump(d, open(mf, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("✅ api/.env (CORS + PUBLIC_APP_URL), webapp/.env, bot/.env, tonconnect-manifest.json")
PY

say "6. Rebuild webapp + redémarrage API et bot"
(cd "$APP/webapp" && npm run build >/dev/null 2>&1) && echo "✅ webapp reconstruite"
pm2 restart stickerstreet-api stickerstreet-bot --update-env >/dev/null && sleep 4

say "7. Vérifications"
curl -s -o /dev/null -w "  $URL → %{http_code}\n" "$URL/"
curl -s -o /dev/null -w "  $URL/api/products → %{http_code}\n" "$URL/api/products"
curl -s -o /dev/null -w "  http://$DOMAIN → %{http_code} (redirection attendue 301)\n" "http://$DOMAIN/"
curl -s -o /dev/null -w "  https://$WWW → %{http_code} (redirection attendue 301)\n" "https://$WWW/"
echo
echo "🎉 $URL est en ligne. Reste à faire dans Telegram (@BotFather) :"
echo "   /setdomain → @StickerStreetbot → $DOMAIN   (bouton « Se connecter avec Telegram » du site)"
