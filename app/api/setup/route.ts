import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const serviceKey = searchParams.get('key')

  if (!serviceKey) {
    return NextResponse.json({ error: 'Missing ?key= parameter (your Supabase service_role key)' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || url === 'https://placeholder.supabase.co') {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is not configured' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const steps: string[] = []
  const errors: string[] = []

  // Run SQL via PostgREST /rest/v1/rpc/exec_sql if available, otherwise
  // use the Supabase pg-meta endpoint which accepts service_role key
  const runSQL = async (label: string, query: string) => {
    try {
      // Use pg-meta SQL endpoint — works with service_role key (not Management API)
      const res = await fetch(`${url}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ query }),
      })
      // The above won't work for DDL — use the correct endpoint below
      throw new Error('use_pg_meta')
    } catch {
      // Use the correct Supabase SQL execution endpoint
      try {
        const res = await fetch(`${url}/pg-meta/v1/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ query }),
        })
        if (res.ok) {
          steps.push(`✓ ${label}`)
          return true
        }
        const body = await res.text()
        if (body.includes('already exists')) {
          steps.push(`✓ ${label} (already existed)`)
          return true
        }
        // Fall through to direct Supabase client approach
        throw new Error(body)
      } catch (e2) {
        errors.push(`✗ ${label}: ${String(e2).slice(0, 300)}`)
        return false
      }
    }
  }

  // Better approach: use the Supabase database REST API for DDL
  // The correct endpoint for executing raw SQL with service role is:
  // POST {url}/rest/v1/rpc/exec_sql  -- only if function exists
  // So instead we use the pg-meta API that ships with every Supabase project
  const execSQL = async (label: string, query: string): Promise<boolean> => {
    try {
      const res = await fetch(`${url}/pg/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query }),
      })
      const text = await res.text()
      if (res.ok) {
        steps.push(`✓ ${label}`)
        return true
      }
      if (text.includes('already exists')) {
        steps.push(`✓ ${label} (already existed)`)
        return true
      }
      // Try alternative endpoint
      const res2 = await fetch(`${url}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query }),
      })
      if (res2.ok) {
        steps.push(`✓ ${label}`)
        return true
      }
      errors.push(`✗ ${label}: HTTP ${res.status} — ${text.slice(0, 200)}`)
      return false
    } catch (e) {
      errors.push(`✗ ${label}: ${String(e).slice(0, 200)}`)
      return false
    }
  }

  // The actual working approach for Supabase: use the database REST endpoint
  // Supabase exposes /rest/v1/ for table operations but NOT raw SQL.
  // For raw SQL we need the pg-meta endpoint OR we use direct table inserts.
  //
  // Solution: Create tables using the Supabase Management API-compatible endpoint
  // OR use supabase.rpc() with a pre-existing exec_sql function.
  //
  // BEST APPROACH: Use fetch to the Supabase database directly via the
  // correct API — the database REST endpoint that Supabase Studio uses:
  // https://{ref}.supabase.co/rest/v1/ doesn't support DDL
  // But: POST to the internal pg endpoint DOES work with service key.

  // Create tables via SQL using the correct Supabase API path
  const sql = async (label: string, query: string): Promise<boolean> => {
    // Supabase's internal SQL API (used by Studio) — works with service_role
    const endpoints = [
      `${url}/pg/query`,
      `${url}/pg-meta/v1/query`,
      `${url}/api/pg-meta/v1/query`,
    ]
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ query }),
        })
        const text = await res.text()
        if (res.ok) { steps.push(`✓ ${label}`); return true }
        if (text.includes('already exists')) { steps.push(`✓ ${label} (already existed)`); return true }
      } catch { /* try next */ }
    }
    // Last resort: use the Supabase database API via the Management console endpoint
    // with the bearer token being the service role key
    try {
      const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
      if (projectRef) {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ query }),
        })
        const text = await res.text()
        if (res.ok) { steps.push(`✓ ${label}`); return true }
        if (text.includes('already exists')) { steps.push(`✓ ${label} (already existed)`); return true }
        // This endpoint requires a PAT, not service_role — expected to fail
      }
    } catch { /* ignore */ }

    errors.push(`✗ ${label}: Could not execute SQL. Please run this in Supabase SQL Editor.`)
    return false
  }

  // Try to create tables using Supabase JS client workarounds
  // For CREATE TABLE: attempt via a stored procedure if it exists
  // For data inserts: use admin client directly (this DOES work with service_role)

  // Step 1: Try table creation (may fail without PAT — handled gracefully)
  await sql('Create subjects table', `
    create table if not exists subjects (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      description text,
      color text default '#0891b2',
      icon text default '🔬',
      created_at timestamptz default now()
    )
  `)

  await sql('Create questions table', `
    create table if not exists questions (
      id uuid primary key default gen_random_uuid(),
      subject_id uuid references subjects(id) on delete cascade,
      station_number int,
      question_text text not null,
      answer text,
      hint text,
      image_url text,
      difficulty text default 'medium' check (difficulty in ('easy','medium','hard')),
      tags text[] default '{}',
      created_at timestamptz default now()
    )
  `)

  await sql('Create user_progress table', `
    create table if not exists user_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      question_id uuid references questions(id) on delete cascade,
      answered boolean default false,
      correct boolean,
      attempts int default 0,
      last_attempted timestamptz,
      created_at timestamptz default now(),
      unique(user_id, question_id)
    )
  `)

  await sql('Create lectures table', `
    create table if not exists lectures (
      id uuid primary key default gen_random_uuid(),
      subject_id uuid references subjects(id) on delete cascade,
      title text not null,
      file_url text,
      file_type text,
      uploaded_by uuid references auth.users(id),
      created_at timestamptz default now()
    )
  `)

  await sql('Create lecture_pages table', `
    create table if not exists lecture_pages (
      id uuid primary key default gen_random_uuid(),
      lecture_id uuid references lectures(id) on delete cascade,
      subject_id uuid references subjects(id) on delete cascade,
      page_number int not null,
      image_url text not null,
      text_content text default '',
      created_at timestamptz default now()
    )
  `)

  await sql('Add image_crop column if missing', `
    alter table questions add column if not exists image_crop jsonb;
  `)

  await sql('Enable RLS on all tables', `
    alter table subjects enable row level security;
    alter table questions enable row level security;
    alter table user_progress enable row level security;
    alter table lectures enable row level security;
    alter table lecture_pages enable row level security;
  `)

  await sql('Create RLS policies', `
    drop policy if exists "subjects_public_read" on subjects;
    drop policy if exists "questions_public_read" on questions;
    drop policy if exists "questions_auth_update" on questions;
    drop policy if exists "lectures_public_read" on lectures;
    drop policy if exists "lectures_auth_insert" on lectures;
    drop policy if exists "progress_user_select" on user_progress;
    drop policy if exists "progress_user_insert" on user_progress;
    drop policy if exists "progress_user_update" on user_progress;
    drop policy if exists "lecture_pages_public_read" on lecture_pages;
    drop policy if exists "lecture_pages_auth_insert" on lecture_pages;

    create policy "subjects_public_read" on subjects for select using (true);
    create policy "questions_public_read" on questions for select using (true);
    create policy "questions_auth_update" on questions for update using (auth.uid() is not null);
    create policy "lectures_public_read" on lectures for select using (true);
    create policy "lectures_auth_insert" on lectures for insert with check (auth.uid() = uploaded_by);
    create policy "progress_user_select" on user_progress for select using (auth.uid() = user_id);
    create policy "progress_user_insert" on user_progress for insert with check (auth.uid() = user_id);
    create policy "progress_user_update" on user_progress for update using (auth.uid() = user_id);
    create policy "lecture_pages_public_read" on lecture_pages for select using (true);
    create policy "lecture_pages_auth_insert" on lecture_pages for insert with check (auth.uid() is not null);
  `)

  // Step 2: Seed data using the admin client (this WORKS with service_role key)
  const subjects = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Anatomy', description: 'Gross anatomy, radiological anatomy, surface anatomy', color: '#0891b2', icon: '🦴' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Histology', description: 'Microscopic anatomy and tissue identification', color: '#7c3aed', icon: '🔬' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'Pathology', description: 'Disease morphology, gross and microscopic pathology', color: '#dc2626', icon: '🧫' },
    { id: '44444444-4444-4444-4444-444444444444', name: 'Biochemistry', description: 'Clinical biochemistry, metabolic pathways, lab values', color: '#059669', icon: '⚗️' },
    { id: '55555555-5555-5555-5555-555555555555', name: 'Microbiology', description: 'Bacteriology, virology, mycology, gram stains', color: '#d97706', icon: '🦠' },
    { id: '66666666-6666-6666-6666-666666666666', name: 'Physiology', description: 'Normal physiological function and clinical correlation', color: '#0284c7', icon: '❤️' },
    { id: '77777777-7777-7777-7777-777777777777', name: 'Radiology', description: 'Radiological interpretation and imaging modalities', color: '#9333ea', icon: '🩻' },
  ]

  const { error: subjErr } = await admin.from('subjects').upsert(subjects, { onConflict: 'id', ignoreDuplicates: true })
  if (subjErr) errors.push(`✗ Seed subjects: ${subjErr.message}`)
  else steps.push('✓ Subjects seeded')


  // Storage buckets
  for (const bucket of ['lectures', 'slide-images']) {
    try {
      const res = await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ id: bucket, name: bucket, public: true }),
      })
      const body = await res.text()
      if (res.ok || body.includes('already exists')) {
        steps.push(`✓ Storage bucket "${bucket}" ready`)
      } else {
        errors.push(`⚠ Bucket "${bucket}": ${body.slice(0, 150)}`)
      }
    } catch (e) {
      errors.push(`⚠ Bucket "${bucket}": ${String(e)}`)
    }
  }

  const sqlFailed = errors.filter(e => e.startsWith('✗')).length > 0
  return NextResponse.json({
    success: !sqlFailed,
    message: sqlFailed
      ? 'Some SQL steps failed. If tables already exist the app should work. See "sqlNote" for manual steps.'
      : '🎉 Setup complete! Your OSPE Study Helper is ready.',
    sqlNote: sqlFailed
      ? 'If you see SQL errors above, go to Supabase → SQL Editor and run the contents of supabase/schema.sql manually. This is a one-time step.'
      : null,
    steps,
    errors,
  }, { status: 200 })
}
