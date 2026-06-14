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

  const questions = [
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 1, difficulty: 'medium', tags: ['vertebrae','cervical','anatomy'],
      question_text: `Station 1 — Vertebra Image\n1. What vertebra is this?\n2. What is the marked structure X?\n3. Mention 3 sites where X is NOT present?\n4. What is Y?\n5. What region of the vertebra has a foramen in structure Y?`,
      answer: `1. Cervical vertebra (likely C3-C6)\n2. X = Transverse foramen (foramen transversarium) — found only in cervical vertebrae\n3. NOT present in: Thoracic, Lumbar, Sacral vertebrae\n4. Y = Transverse process\n5. The costal element (anterior root) of cervical vertebrae contains the transverse foramen`,
      hint: 'Transverse foramina are UNIQUE to cervical vertebrae — transmit vertebral artery (except C7). Thoracic = costal facets. Lumbar = large, no foramina in transverse processes.' },
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 2, difficulty: 'medium', tags: ['sciatic nerve','gluteal','IM injection'],
      question_text: `Station 2 — Gluteal/thigh nerve image\n1. What is nerve X?\n2. Name 2 muscles X innervates?\n3. What is nerve Y?\n4. What nerve is injured by IM injection in region Z?`,
      answer: `1. X = Sciatic nerve (largest nerve in body)\n2. Biceps femoris, Semitendinosus\n3. Y = Superior or Inferior gluteal nerve\n4. Sciatic nerve — safe IM zone = upper outer quadrant of buttock`,
      hint: 'Sciatic nerve exits BELOW piriformis through greater sciatic foramen. Safe IM = upper outer quadrant. Divides into tibial + common peroneal at popliteal fossa.' },
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 3, difficulty: 'hard', tags: ['knee','meniscus','ligament','synovial'],
      question_text: `Station 3 — Knee joint\n1. What fluid is aspirated?\n2. What is X?\n3. What is Y?\n4. Why is Y more liable to tear than X?`,
      answer: `1. Synovial fluid\n2. X = ACL or MCL\n3. Y = Medial meniscus\n4. Medial meniscus fixed to MCL (less mobile). Unhappy triad: ACL + MCL + Medial meniscus`,
      hint: 'Unhappy triad = ACL + MCL + Medial meniscus. Medial meniscus FIXED to MCL → vulnerable. Lateral meniscus = MORE MOBILE → less torn.' },
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 4, difficulty: 'medium', tags: ['bronchus','lung lobes','foreign body'],
      question_text: `Station 4 — Lung anatomy\n1. What lobe is X?\n2. Bronchopulmonary segments of X?\n3. Child swallowed coin — Y or Z bronchus more likely? Why?`,
      answer: `1. X = Right middle lobe\n2. Medial + Lateral segments\n3. Right main bronchus — wider, shorter, more vertical. Directly in line with trachea.`,
      hint: 'RIGHT bronchus = Wider + Shorter + More Vertical → foreign bodies go RIGHT.' },
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 5, difficulty: 'medium', tags: ['heart','coronary sulcus','valves'],
      question_text: `Station 5 — Heart\n1. What groove is X?\n2. Name artery and vein in X?\n3. Physiological state of mitral (Y) and tricuspid (Z) in systole?`,
      answer: `1. X = Coronary sulcus (AV groove)\n2. Right: RCA + Small cardiac vein. Left: Left circumflex + Great cardiac vein\n3. BOTH CLOSED during systole → S1 heart sound`,
      hint: 'SYSTOLE: AV valves CLOSE (S1), semilunar valves OPEN. DIASTOLE: semilunar valves CLOSE (S2), AV valves OPEN.' },
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 6, difficulty: 'hard', tags: ['liver','portal vein','porta hepatis'],
      question_text: `Station 6 — Abdominal image\n1. What vessel is X?\n2. What organ is Y? Parts?\n3. What is area Z and its contents?`,
      answer: `1. X = Portal vein\n2. Y = Liver: Right, Left, Caudate, Quadrate lobes\n3. Z = Porta hepatis: Portal vein (posterior), Hepatic artery (left), CBD (right)`,
      hint: 'Porta hepatis: CBD (right) + Hepatic artery (left) + Portal vein (posterior). Mnemonic: VAN — Vein, Artery, caNal.' },
    { subject_id: '11111111-1111-1111-1111-111111111111', station_number: 7, difficulty: 'medium', tags: ['surface anatomy','femoral triangle'],
      question_text: `Station 7 — Surface anatomy\n1. Underlying structures of X?\n2. Arterial supply of X?`,
      answer: `1. Femoral triangle: NAVY (Nerve, Artery, Vein, Y-fronts canal)\n2. Femoral artery (from external iliac)`,
      hint: 'Femoral triangle: NAVY lateral→medial. Boundaries: inguinal ligament (top), sartorius (lateral), adductor longus (medial).' },
    { subject_id: '44444444-4444-4444-4444-444444444444', station_number: 8, difficulty: 'medium', tags: ['lipid profile','cholesterol','VLDL'],
      question_text: `Station 8 — Lipid Profile\n50yo male: TC=290, TG=200, HDL=30 mg/dL\n1. Comment on each value?\n2. Normal LDL and TC?\n3. Calculate VLDL?`,
      answer: `1. TC=290 HIGH (normal<200). HDL=30 LOW (normal M>40). TG=200 Borderline high (normal<150)\n2. TC normal <200. LDL optimal <100\n3. VLDL = TG/5 = 200/5 = 40 mg/dL (ELEVATED, normal 2-30)`,
      hint: 'Friedewald: LDL = TC - HDL - VLDL. VLDL = TG/5 (valid when TG<400).' },
    { subject_id: '44444444-4444-4444-4444-444444444444', station_number: 9, difficulty: 'medium', tags: ['diabetes','HbA1c','OGTT'],
      question_text: `Station 9 — DM Diagnosis\nOGTT: FBG=140, 2hr=230, HbA1c=7.2%\n1. Diagnosis?\n2. What does HbA1c indicate?\n3. Normal 2hr OGTT?`,
      answer: `1. Type 2 Diabetes Mellitus\n2. Average glucose over 2-3 months (RBC lifespan 120 days)\n3. Normal 2hr OGTT <140. Pre-DM 140-199. DM ≥200`,
      hint: 'DM: FBG≥126 OR 2hr OGTT≥200 OR HbA1c≥6.5%. HbA1c = 3-month glucose average.' },
    { subject_id: '22222222-2222-2222-2222-222222222222', station_number: 10, difficulty: 'medium', tags: ['lymph node','histology','germinal center'],
      question_text: `Station 10 — Lymph Node\n1. What is L?\n2. Cells in L?\n3. What is C?`,
      answer: `1. L = Lymphoid follicle (secondary with germinal center)\n2. B lymphocytes, follicular dendritic cells, tingible body macrophages\n3. C = Capsule (dense collagenous)`,
      hint: 'LN zones: Cortex (B cells/follicles) → Paracortex (T cells) → Medulla (plasma cells). Secondary follicles = active response.' },
    { subject_id: '22222222-2222-2222-2222-222222222222', station_number: 11, difficulty: 'medium', tags: ['spleen','histology','white pulp'],
      question_text: `Station 11 — Histology slide\nA. Identify structure.\nB. Yellow star: cells present.\nC. Identify X and function.`,
      answer: `A. Spleen (white + red pulp)\nB. White pulp: B cells, T cells, macrophages, dendritic cells\nC. Red pulp: filters blood, removes old RBCs, stores platelets`,
      hint: 'Spleen: White pulp = lymphoid (immune). Red pulp = sinusoids (filter blood).' },
    { subject_id: '22222222-2222-2222-2222-222222222222', station_number: 12, difficulty: 'easy', tags: ['blood vessel','histology','artery'],
      question_text: `Station 12 — Blood vessel\nA. Vessel type?\nB. Layer Z?\nC. Structure A?\nD. Layer in box?`,
      answer: `A. Medium muscular artery\nB. Z = Tunica media (circular smooth muscle)\nC. A = Internal elastic lamina (IEL)\nD. Box = Tunica adventitia (loose connective tissue)`,
      hint: 'Layers (lumen out): Intima (endothelium+IEL) → Media (smooth muscle) → Adventitia. Arteries: thick wall, round lumen.' },
    { subject_id: '22222222-2222-2222-2222-222222222222', station_number: 13, difficulty: 'easy', tags: ['trachea','epithelium','goblet cells'],
      question_text: `Station 13 — Epithelium\nA. Identify structure.\nB. Star structure?\nC. Two cells in epithelium?`,
      answer: `A. Trachea (pseudostratified ciliated columnar epithelium)\nB. Star = Hyaline cartilage ring\nC. 1) Ciliated columnar cells. 2) Goblet cells`,
      hint: 'Respiratory epithelium = PCCE. Goblet cells = mucus. Cilia beat UPWARD.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 14, difficulty: 'hard', tags: ['diabetic nephropathy','Kimmelstiel-Wilson','PAS'],
      question_text: `Lab 1 — DM Kidney (PAS stain)\nPink hyaline nodules at periphery of glomeruli.\n1. Type of glomerulosclerosis?\n2. Morphological features?\n3. Two types of diabetic nephropathy?`,
      answer: `1. Nodular glomerulosclerosis (Kimmelstiel-Wilson lesion) — PATHOGNOMONIC of DM\n2. PAS-positive nodules (laminated matrix + mesangial cells)\n3. a) Diffuse (mesangiosclerosis) b) Nodular (Kimmelstiel-Wilson)`,
      hint: 'Kimmelstiel-Wilson = pathognomonic of DM. PAS-positive. Distinguish from MPGN (tram-track) and amyloid (Congo red+).' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 15, difficulty: 'hard', tags: ['diabetes','pancreas','insulitis','amyloid'],
      question_text: `Lab 1 — DM Pancreas\n1. Changes in Type I DM pancreas?\n2. Changes in Type II DM pancreas?\n3. Stain for amyloid? Characteristic finding?`,
      answer: `1. Type I: ↓islets, insulitis (T lymphocyte infiltration), β-cell destruction\n2. Type II: amyloid deposition (IAPP), hyalinization, no insulitis\n3. Congo Red → red. Under polarized light → apple-green birefringence`,
      hint: 'Type I = Insulitis (autoimmune). Type II = Amyloid (IAPP). Congo Red → red/green birefringence = AMYLOID hallmark.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 16, difficulty: 'hard', tags: ['diabetic retinopathy','VEGF','neovascularization'],
      question_text: `Lab 1 — DM Retina\n1. Two types of diabetic retinopathy?\n2. Four features of non-proliferative?\n3. Four features of proliferative?\n4. What causes neovascularization?`,
      answer: `1. Non-proliferative and Proliferative\n2. Non-proliferative: microaneurysms, dot-blot hemorrhages, hard exudates, cotton-wool spots\n3. Proliferative: neovascularization, large hemorrhages, fibrosis, retinal detachment\n4. Retinal ischemia → VEGF → fragile new vessels`,
      hint: 'Non-proliferative = permeability. Proliferative = VEGF neovascularization → fragile vessels → sudden vision loss.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 17, difficulty: 'hard', tags: ['rheumatoid arthritis','pannus','synovitis'],
      question_text: `Lab 2 — RA Joints\n1. Synovial changes in RA?\n2. What is pannus? Cells?\n3. What are rice bodies?\n4. What is fibrous ankylosis?`,
      answer: `1. Edematous, thickened, hyperplastic, frond-like synovium; lymphoid aggregates; juxta-articular erosions\n2. Pannus = destructive granulation tissue (lymphocytes, plasma cells, macrophages, fibroblasts)\n3. Rice bodies = floating organized FIBRIN aggregates from inflamed synovium\n4. Pannus bridges articular surfaces → joint fusion`,
      hint: 'RA: Synovitis → Pannus → Cartilage destruction → Fibrous ankylosis. Pannus = most important.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 18, difficulty: 'medium', tags: ['rheumatoid nodule','fibrinoid necrosis'],
      question_text: `Lab 2 — Rheumatoid Nodule\n1. Histological appearance?\n2. Clinical location?\n3. What are palisading cells?`,
      answer: `1. Central fibrinoid necrosis → palisading histiocytes → outer chronic inflammatory cells + fibrosis\n2. Over bony prominences, most common: elbow (olecranon)\n3. Palisading macrophages — axes perpendicular to necrotic center`,
      hint: 'Rheumatoid nodule: fibrinoid necrosis (center) + palisading macrophages (middle) + lymphocytes (outside). NOT a granuloma.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 19, difficulty: 'hard', tags: ['RA kidney','membranous nephropathy','MPGN'],
      question_text: `Lab 2 — RA Kidney\n1. Kidney disorders in RA?\n2. Membranous nephropathy histology?\n3. Tram-track — what and where?`,
      answer: `1. Membranous nephropathy (most common), secondary amyloidosis, FSGS, MPGN, analgesic nephropathy\n2. PAS: GBM thickening. IF: granular IgG+C3. EM: subepithelial deposits\n3. Tram-track = MPGN: mesangial interposition → double contour on silver stain`,
      hint: 'Membranous = GBM thickening + granular IF = nephrotic syndrome. MPGN = tram-track. Amyloid = Congo Red+.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 20, difficulty: 'medium', tags: ['lobar pneumonia','hepatization','stages'],
      question_text: `Lab 3 — Lobar Pneumonia Stages\nName and describe the 4 stages in order.`,
      answer: `1. CONGESTION (Day 1-2): heavy red lobe, vascular congestion, serous exudate\n2. RED HEPATIZATION (Day 3-4): firm red lobe; alveoli packed with RBCs + neutrophils + fibrin\n3. GREY HEPATIZATION (Day 5-7): grey lobe; RBCs lysed, macrophages + fibrin\n4. RESOLUTION (Week 2): enzymatic digestion, macrophages clear debris`,
      hint: 'Mnemonic: Can Red Gorillas Run? = Congestion → Red → Grey → Resolution.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 21, difficulty: 'medium', tags: ['lobar pneumonia','bronchopneumonia'],
      question_text: `Lab 3 — Lobar vs Bronchopneumonia\nCompare age, patient, organisms, distribution, boundaries, laterality.`,
      answer: `LOBAR: age 20-50, primary/healthy, Strep. pneumoniae, entire lobe, unilateral\nBRONCHOPNEUMONIA: extremes of age, secondary/debilitated, mixed organisms, patchy, bilateral`,
      hint: 'Lobar = ONE lobe, young healthy, Pneumococcus, unilateral. Broncho = PATCHY, elderly/infant, bilateral.' },
    { subject_id: '33333333-3333-3333-3333-333333333333', station_number: 22, difficulty: 'hard', tags: ['interstitial pneumonia','atypical','Mycoplasma'],
      question_text: `Lab 3 — Interstitial Pneumonia\n1. Histological features?\n2. How differs from lobar/bronchopneumonia?\n3. Causative organisms?`,
      answer: `1. Empty alveolar spaces, septal thickening with mononuclear infiltrate, hyaline membranes in severe cases\n2. No hepatization, no neutrophilic exudate; mononuclear not neutrophilic; not airway-centered\n3. Viruses (influenza, RSV, CMV, COVID-19), Mycoplasma pneumoniae, Chlamydophila, Legionella`,
      hint: 'Interstitial = ATYPICAL. Inflammation in WALLS not spaces. Mycoplasma = walking pneumonia.' },
    { subject_id: '55555555-5555-5555-5555-555555555555', station_number: 23, difficulty: 'medium', tags: ['gram stain','hemolysis','streptococcus'],
      question_text: `Microbiology — Gram Stain\nFigure A: gram stain. Figure B: blood agar.\nA. Species name?\nB. Gram stain result?\nC. Media name and hemolysis type?`,
      answer: `Streptococcus pneumoniae: Gram POSITIVE lancet diplococci. Blood agar → ALPHA hemolysis (green)\nStaphylococcus aureus: Gram POSITIVE cocci clusters. Blood agar → BETA hemolysis (clear)\nStreptococcus pyogenes: Gram POSITIVE chains. Blood agar → BETA hemolysis`,
      hint: 'Alpha=incomplete/green. Beta=complete/clear. Pneumococcus=alpha+lancet+optochin sensitive.' },
    { subject_id: '66666666-6666-6666-6666-666666666666', station_number: 24, difficulty: 'medium', tags: ['physiology','ECG','spirometry','ABG'],
      question_text: `Physiology Station\nInterpret clinical values: ECG, spirometry, ABG, renal function.`,
      answer: `ECG: PR=0.12-0.20s, QRS<0.12s, Rate=300÷RR intervals\nSpirometry: FEV1/FVC normal>0.75. Obstructive: ↓FEV1/FVC. Restrictive: normal ratio, ↓FVC\nABG: pH 7.35-7.45, PaCO2 35-45, HCO3 22-26`,
      hint: 'ABG: 1)pH 2)CO2 or HCO3 explain it? 3)Compensation? Spirometry: GOLD = FEV1% for COPD.' },
    { subject_id: '77777777-7777-7777-7777-777777777777', station_number: 25, difficulty: 'medium', tags: ['radiology','CXR','chest'],
      question_text: `Radiology Station\nIdentify imaging modality and describe findings.`,
      answer: `CXR ABCDE: Airway (midline?), Bones, Cardiac (CTR<0.5), Diaphragm, Everything else\nConsolidation+air bronchogram=pneumonia. Blunted angle=effusion. Hyperlucent=pneumothorax`,
      hint: 'CXR mnemonic ABCDE. Consolidation + air bronchogram = pneumonia. Meniscus sign = pleural effusion.' },
  ]

  const { error: qErr } = await admin.from('questions').upsert(questions, { ignoreDuplicates: true })
  if (qErr) errors.push(`✗ Seed questions: ${qErr.message}`)
  else steps.push(`✓ ${questions.length} questions seeded`)

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
