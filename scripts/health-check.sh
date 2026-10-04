#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-http://127.0.0.1:5000/api/health}"
WEB_URL="${2:-http://127.0.0.1:3005}"
NGROK_API="${3:-http://127.0.0.1:4040/api/tunnels}"

echo "== StickerStreet health check =="
echo

echo "-- PM2 status --"
pm2 status | sed -n '1,20p'
echo

echo "-- API health (${API_URL}) --"
api_code="$(curl -sS -o /tmp/stickerstreet_api_health.json -w "%{http_code}" "${API_URL}")"
echo "HTTP ${api_code}"
python3 - <<'PY'
import json
from pathlib import Path
p = Path("/tmp/stickerstreet_api_health.json")
if p.exists():
    try:
        print(json.dumps(json.loads(p.read_text()), ensure_ascii=False, indent=2))
    except Exception:
        print(p.read_text())
PY
echo

echo "-- Webapp (${WEB_URL}) --"
curl -sS -I "${WEB_URL}" | sed -n '1,5p'
echo

echo "-- ngrok tunnel (${NGROK_API}) --"
ngrok_json="$(curl -sS "${NGROK_API}")"
python3 -c '
import json,sys
raw = sys.argv[1]
try:
    data = json.loads(raw)
    tunnels = data.get("tunnels", [])
    if not tunnels:
        print("Aucun tunnel actif")
    else:
        for t in tunnels:
            print("- {}: {} -> {}".format(
                t.get("name"),
                t.get("public_url"),
                t.get("config", {}).get("addr"),
            ))
except Exception:
    print(raw)
' "${ngrok_json}"
echo

echo "Check terminé."
