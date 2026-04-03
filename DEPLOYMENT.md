# RNB Events Website - Deployment Guide

## Domain: https://rnb716events.com/

This website can be prepared for multiple platforms, but your domain can point to only one live host at a time. Use one platform as the primary production host.

---

## Option 1: GitHub Pages

### Steps:
1. **Create GitHub Repository**
   - Go to https://github.com/new
   - Name: `rnb-events` (or any name)
   - Make it public
   - Don't initialize with README

2. **Push Code to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/rnb-events.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: Deploy from branch
   - Branch: main / (root)
   - Save

4. **Update Domain DNS**
   - In your Canva domain settings, add these DNS records:
   ```
   Type: A
   Name: @
   Value: 185.199.108.153
   
   Type: A
   Name: @
   Value: 185.199.109.153
   
   Type: A
   Name: @
   Value: 185.199.110.153
   
   Type: A
   Name: @
   Value: 185.199.111.153
   
   Type: CNAME
   Name: www
   Value: YOUR_USERNAME.github.io
   ```

5. **Configure Custom Domain in GitHub**
   - Go to Settings → Pages
   - Custom domain: rnb716events.com
   - Enforce HTTPS: ✓

6. **Keep the `CNAME` file in the repo**
   - This project includes a `CNAME` file with `rnb716events.com`
   - GitHub Pages uses it to keep the custom domain attached after deploys

---

## Option 2: Netlify (Recommended Primary Host)

### Steps:
1. **Sign Up**
   - Go to https://netlify.com
   - Sign up with GitHub (easiest) or email

2. **Deploy Site**
   - Click "Add new site" → "Deploy manually"
   - Drag and drop your "RNB EVENTS" folder
   - Wait for deployment (30 seconds)

3. **Configure Custom Domain**
   - Go to Site settings → Domain management
   - Add custom domain: rnb716events.com
   - Netlify will provide DNS settings

4. **Update Domain DNS in Canva**
   - In Canva domain settings, change DNS to:
   ```
   Type: CNAME
   Name: www
   Value: YOUR-SITE-NAME.netlify.app
   
   Type: A
   Name: @
   Value: 75.2.60.5
   ```
   (Netlify will provide exact values)

5. **Enable HTTPS**
   - Netlify automatically provisions SSL certificate
   - Enable HTTPS redirect in settings

6. **Recommended production setup**
   - Use Netlify as the live host for `rnb716events.com`
   - Keep GitHub Pages and Vercel as backup/staging targets if you want

---

## Option 3: Vercel

### Steps:
1. **Sign Up**
   - Go to https://vercel.com
   - Sign up with GitHub or email

2. **Deploy Site**
   - Click "Add New" → "Project"
   - Import Git Repository (push to GitHub first)
   - OR use "Deploy" button and upload folder
   - Click Deploy

3. **Configure Custom Domain**
   - Go to Project Settings → Domains
   - Add: rnb716events.com
   - Vercel will provide DNS settings

4. **Update Domain DNS**
   - In Canva domain settings:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

---

## Recommended: Netlify

**Why Netlify?**
- ✅ Easiest manual deployment (drag & drop)
- ✅ Automatic HTTPS
- ✅ Fast global CDN
- ✅ Free tier is generous
- ✅ Great for static sites like this
- ✅ Automatic form handling (if you add forms later)
- ✅ Simplest custom-domain handoff from Canva DNS

---

## Quick Start (Netlify)

1. Go to https://app.netlify.com/drop
2. Drag the "RNB EVENTS" folder from your desktop
3. Wait 30 seconds
4. Click "Domain settings"
5. Add custom domain: rnb716events.com
6. Update DNS in Canva with Netlify's provided records
7. Done! ✨

**DNS propagation takes 24-48 hours, but often works within 1-2 hours.**

---

## Practical Recommendation

If you want to "do all of them," use this order:

1. Deploy to Netlify and connect `rnb716events.com` there as the live site.
2. Push the same codebase to GitHub for backup and GitHub Pages readiness.
3. Import the repo into Vercel as a second backup deployment.

That gives you:
- Netlify as production
- GitHub as source control + optional Pages deployment
- Vercel as backup hosting

Only one of those should control the domain DNS at a time.

---

## Files Included

- `netlify.toml` - Netlify configuration
- `vercel.json` - Vercel configuration
- `CNAME` - GitHub Pages custom domain file
- `.gitignore` - Files to exclude from git

---

## Support

For deployment issues:
- Netlify Docs: https://docs.netlify.com
- Vercel Docs: https://vercel.com/docs
- GitHub Pages: https://docs.github.com/pages

---

## Current Features

✅ Responsive design
✅ Video backgrounds
✅ Image carousels
✅ Calendly booking integration
✅ Contact information
✅ All pages: Home, Love Book, Crafting Moments, Service, About Us
