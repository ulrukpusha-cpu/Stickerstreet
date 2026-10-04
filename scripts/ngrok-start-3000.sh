#!/bin/bash
# Lance ngrok vers le port 3005 (webapp StickerStreet). Ne pas utiliser 3000 (BIPBIPWEB).
# Usage: ./ngrok-start-3000.sh

set -e

echo "Arrêt du tunnel existant..."
SESSION_ID=$(ngrok api tunnels list 2>/dev/null | grep -o '"id": "ts_[^"]*"' | head -1 | sed 's/"id": "//;s/"//')
if [ -n "$SESSION_ID" ]; then
  ngrok api tunnel-sessions stop "$SESSION_ID" 2>/dev/null || true
fi

echo "Démarrage de ngrok sur le port 3005 (StickerStreet webapp)..."
pkill -f "ngrok http" 2>/dev/null || true
nohup ngrok http 3005 > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
sleep 3

if ! kill -0 $NGROK_PID 2>/dev/null; then
  echo "Échec du démarrage. Log:"
  cat /tmp/ngrok.log
  exit 1
fi

# Vérifier que c’est bien notre tunnel (forwards_to 3005)
TUNNELS=$(ngrok api tunnels list 2>/dev/null)
URL=$(echo "$TUNNELS" | grep -o '"public_url": "https://[^"]*"' | head -1 | sed 's/"public_url": "//;s/"//')
FORWARDS=$(echo "$TUNNELS" | grep -o '"forwards_to": "[^"]*"' | head -1)

if echo "$FORWARDS" | grep -q 3005; then
  echo "OK. StickerStreet webapp exposée sur: $URL"
else
  echo "Attention: tunnel actif (forwards_to: $FORWARDS). URL: $URL"
fi
