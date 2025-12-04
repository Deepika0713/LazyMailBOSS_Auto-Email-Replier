# Easy Cloud Deployment Guide

The simplest ways to deploy LazyMailBOSS to the cloud.

## 🚀 Railway (Easiest - Recommended)

**Cost:** Free tier available, then ~$5/month

### Steps:
1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) and sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your LazyMailBOSS repository
5. Railway auto-detects the Dockerfile and deploys
6. Add environment variable:
   - Click on your service → "Variables" tab
   - Add `ENCRYPTION_KEY` (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
7. Your app is live! Railway provides a URL like `lazymail-boss-production.up.railway.app`

**Features:**
- Auto-deploys on git push
- Free SSL certificate
- Persistent storage included
- Easy logs and metrics

---

## 🎨 Render (Also Very Easy)

**Cost:** Free tier available (spins down after inactivity), paid starts at $7/month

### Steps:
1. Push your code to GitHub
2. Go to [render.com](https://render.com) and sign in with GitHub
3. Click "New +" → "Web Service"
4. Connect your LazyMailBOSS repository
5. Render auto-detects Docker
6. Configure:
   - **Name:** lazymail-boss
   - **Environment:** Docker
   - **Plan:** Free or Starter ($7/mo for always-on)
7. Add environment variable:
   - In "Environment" section, add `ENCRYPTION_KEY`
   - Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
8. Click "Create Web Service"
9. Your app deploys automatically!

**Note:** Free tier spins down after 15 min of inactivity (takes ~30s to wake up)

---

## ☁️ Google Cloud Run (Serverless)

**Cost:** Very generous free tier, then pay-per-use (~$1-5/month for light usage)

### Steps:
```bash
# 1. Install Google Cloud CLI (if not installed)
# Visit: https://cloud.google.com/sdk/docs/install

# 2. Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Build and deploy (one command!)
gcloud run deploy lazymail-boss \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  --port 3000
```

**Features:**
- Scales to zero (no cost when not in use)
- Auto-scales on demand
- Free SSL
- Fast global deployment

---

## 🐳 DigitalOcean App Platform

**Cost:** $5/month (no free tier)

### Steps:
1. Push code to GitHub
2. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
3. Click "Create App" → "GitHub"
4. Select your repository
5. DigitalOcean detects Dockerfile automatically
6. Configure:
   - **Name:** lazymail-boss
   - **Plan:** Basic ($5/mo)
   - **HTTP Port:** 3000
7. Add environment variables:
   - `ENCRYPTION_KEY` (generate with crypto command)
8. Click "Create Resources"

**Features:**
- Simple pricing
- Good performance
- Easy to understand

---

## 🔵 Heroku (Classic Choice)

**Cost:** $5-7/month (no free tier anymore)

### Steps:
```bash
# 1. Install Heroku CLI
# Visit: https://devcenter.heroku.com/articles/heroku-cli

# 2. Login
heroku login

# 3. Create app
heroku create your-lazymail-boss

# 4. Set to use Docker
heroku stack:set container

# 5. Add encryption key
heroku config:set ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 6. Deploy
git push heroku main

# 7. Open your app
heroku open
```

---

## 📊 Comparison

| Platform | Free Tier | Ease | Best For |
|----------|-----------|------|----------|
| **Railway** | ✅ Yes | ⭐⭐⭐⭐⭐ | Developers, best overall |
| **Render** | ✅ Yes (sleeps) | ⭐⭐⭐⭐⭐ | Side projects |
| **Cloud Run** | ✅ Yes (generous) | ⭐⭐⭐⭐ | Serverless fans |
| **DigitalOcean** | ❌ No | ⭐⭐⭐⭐ | Simple & reliable |
| **Heroku** | ❌ No | ⭐⭐⭐⭐ | Classic choice |

---

## 🔑 Important: Generate Encryption Key

Before deploying, generate a secure encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `ENCRYPTION_KEY` environment variable.

---

## 📝 After Deployment

1. Visit your app URL
2. Configure email settings in the dashboard
3. Set up your reply template
4. Start monitoring!

---

## 🆘 Troubleshooting

**App won't start:**
- Check logs in your platform's dashboard
- Verify `ENCRYPTION_KEY` is set
- Ensure port 3000 is configured

**Database not persisting:**
- Railway: Automatically handled
- Render: Add persistent disk (see render.yaml)
- Cloud Run: Consider Cloud SQL or Firestore for production
- Others: Check volume/disk configuration

**Email not working:**
- Configure email settings in the dashboard after deployment
- Use app-specific passwords for Gmail
- Check firewall/network settings allow IMAP/SMTP

---

## 💡 Recommendation

**Start with Railway** - it's the easiest, has a generous free tier, and handles everything automatically. If you need more control later, you can always migrate.
