#!/bin/bash
set -e

echo "OmniCompany Phase 5+6 Deployment"
echo "=================================="

# Configuration
GITHUB_REPO="${GITHUB_REPO:-https://github.com/YOUR_ORG/omnichannel.git}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
HETZNER_IP="${HETZNER_IP:-}"
HETZNER_USER="${HETZNER_USER:-root}"
HETZNER_SSH_KEY="${HETZNER_SSH_KEY:-~/.ssh/hetzner}"

if [ -z "$HETZNER_IP" ]; then
  echo "Error: HETZNER_IP not set"
  exit 1
fi

echo "GitHub: $GITHUB_REPO"
echo "Hetzner: $HETZNER_USER@$HETZNER_IP"
echo ""

# Push to GitHub
echo "Pushing to GitHub..."
cd /root/OmniCompany
git remote add origin "$GITHUB_REPO" 2>/dev/null || git remote set-url origin "$GITHUB_REPO"
git branch -M "$GITHUB_BRANCH"
git push -u origin "$GITHUB_BRANCH"
echo "✓ Pushed"

# Deploy to Hetzner
echo ""
echo "Deploying to Hetzner..."
ssh -i "$HETZNER_SSH_KEY" "${HETZNER_USER}@${HETZNER_IP}" bash << 'EOF'
set -e
APP_PATH="/opt/omnichannel"
REPO="https://github.com/YOUR_ORG/omnichannel.git"

mkdir -p "$APP_PATH"
cd "$APP_PATH"

if [ -d ".git" ]; then
  git fetch origin
  git pull origin main
else
  git clone -b main "$REPO" .
fi

cd dashboard
npm install --legacy-peer-deps
npm run build

cd /opt/omnichannel
pm2 delete omnichannel || true
pm2 start "cd dashboard && npm start" --name omnichannel --env "NODE_ENV=production"
pm2 save

echo "✓ Deployment complete"
echo "Verify: curl http://YOUR_IP:3000/api/health"
EOF

echo ""
echo "✓ Deployment complete"
echo "Monitor at: http://$HETZNER_IP:3000/monitoring"
