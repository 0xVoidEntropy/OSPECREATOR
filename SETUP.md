# OSPE Study Helper — Setup Guide

**Made by Dr. Alhassan #44**

## Quick Deploy to Vercel

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name (e.g., `ospe-study`) and set a database password
3. Go to **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Set Up Database
In Supabase → **SQL Editor**, paste and run the entire contents of `supabase/schema.sql`.
This creates all tables, RLS policies, and pre-loads all questions from the OSPE labs.

### 3. Set Up Storage (for lecture uploads)
In Supabase → **Storage** → New bucket:
- Name: `lectures`
- Public: ✅ Yes

### 4. Deploy to Vercel
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → import your repo
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. Deploy!

### 5. Enable Email Auth
In Supabase → **Authentication → Providers** → Email:
- Enable email provider
- Turn OFF "Confirm email" for easier signup (optional)

---

## Features

- **7 Subjects**: Anatomy, Histology, Pathology, Biochemistry, Microbiology, Physiology, Radiology
- **25+ Pre-loaded Questions** from 2023 & 2025 OSPE exams + Lab manuals
- **5-minute Station Simulation** with countdown timer
- **Hint & Answer buttons** per question
- **Progress tracking** per student
- **Lecture upload** (PDF, images, PPTX)
- **Self-registration** — no admin action needed
