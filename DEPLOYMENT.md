# Deployment Guide — Phase 5 + 6

## Production Deployment

### Quick Start
```bash
cd OmniCompany
git remote add origin https://github.com/YOUR_ORG/OmniCompany.git
git branch -M main
git push -u origin main

# Via Vercel CLI
cd dashboard
vercel --prod
```

### Verify Live
```bash
curl https://your-deployment.vercel.app/api/health
# → { status: "healthy", components: {...}, metrics: {...} }

Browse: https://your-deployment.vercel.app/monitoring
# → Real-time dashboard with health, alerts, metrics
```

### Key Endpoints
- `GET /api/health` - System status
- `POST /api/meetings` - Dispatch meeting skill by keyword
- `GET/POST /api/alerts` - Alert management

### Monitoring Post-Deploy
Dashboard auto-refreshes every 10s. Check:
- System Status (healthy/degraded/unhealthy)
- Meetings API operational
- Company-brain logging active
- Skill registry loaded

### Rollback
```bash
git revert HEAD
git push origin main
# Vercel auto-deploys
```
