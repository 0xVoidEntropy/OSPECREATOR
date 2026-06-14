# OSPE Study Helper — Deployment Guide

**Made by Dr. Alhassan #44**

---

## Step 1 — Create a Supabase Project (free)

1. Go to [supabase.com](https://supabase.com) → Sign up → New Project
2. Pick a name (e.g. `ospe-study`) and set a database password
3. Wait ~1 minute for the project to be ready
4. Go to **Settings → API** and copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key (needed once for setup)

---

## Step 2 — Deploy to Vercel (free)

1. Push this repo to GitHub (if not already)
2. Go to [vercel.com](https://vercel.com) → New Project → import repo
3. Add **Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL    = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...
   ```
4. Click **Deploy** and wait ~2 minutes

---

## Step 3 — Run Auto-Setup (one time only)

Visit: `https://your-app.vercel.app/setup`

1. Enter your Supabase **service_role** key
2. Click **Run Setup**
3. Done! ✅ All tables, policies, and questions are created automatically

---

## Step 4 — Enable Email Signup

In Supabase → **Authentication → Providers → Email**:
- Toggle ON ✅
- Optionally turn OFF "Confirm email" so students can log in instantly

---

That's it! Share the URL with your colleagues. They self-register and start studying.
