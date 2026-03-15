#!/bin/bash
# Cloudflare Tunnel Setup Helper for UI_K
# Run this on Mac 2 (The Vault)

set -e

echo "=== UI_K Cloudflare Tunnel Setup ==="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    brew install cloudflared
fi

echo "cloudflared version: $(cloudflared --version)"
echo ""

# Login to Cloudflare
echo "Step 1: Authenticate with Cloudflare"
echo "This will open a browser window to authenticate."
cloudflared tunnel login

echo ""
echo "Step 2: Create tunnel"
read -p "Enter tunnel name (e.g., uik): " TUNNEL_NAME
cloudflared tunnel create "$TUNNEL_NAME"

echo ""
echo "Step 3: Route DNS"
read -p "Enter your domain (e.g., uik.yourdomain.com): " DOMAIN
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"

echo ""
echo "Step 4: Create config file"
TUNNEL_ID=$(cloudflared tunnel info "$TUNNEL_NAME" 2>&1 | grep -oE '[0-9a-f-]{36}' | head -1)

mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: ~/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF

echo "Config written to ~/.cloudflared/config.yml"
echo ""
echo "Step 5: Start tunnel (test)"
echo "Run: cloudflared tunnel run $TUNNEL_NAME"
echo ""
echo "Step 6: Set up Cloudflare Access (manual)"
echo "1. Go to https://one.dash.cloudflare.com/"
echo "2. Access > Applications > Add Application"
echo "3. Self-hosted, domain: $DOMAIN"
echo "4. Add policy: Allow emails you specify"
echo "5. Copy the Application Audience (AUD) tag"
echo "6. Add to .env: CLOUDFLARE_AUD=<your-aud-tag>"
echo "7. Add to .env: CLOUDFLARE_TEAM_DOMAIN=<your-team>.cloudflareaccess.com"
echo ""
echo "Done! Tunnel is configured."
