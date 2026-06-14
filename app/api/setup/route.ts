import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// This endpoint requires the service role key to bypass RLS and create tables
// Call it once after deploying: GET /api/setup?key=YOUR_SERVICE_ROLE_KEY
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

  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  if (!projectRef) {
    return NextResponse.json({ error: 'Could not parse project ref from URL' }, { status: 400 })
  }

  const runSQL = async (label: string, query: string) => {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query }),
      })
      if (res.ok) {
        steps.push(`✓ ${label}`)
        return true
      } else {
        const body = await res.json().catch(() => ({}))
        // If it's a "already exists" error, treat as success
        const msg = JSON.stringify(body)
        if (msg.includes('already exists')) {
          steps.push(`✓ ${label} (already existed)`)
          return true
        }
        errors.push(`✗ ${label}: ${msg.slice(0, 300)}`)
        return false
      }
    } catch (e) {
      errors.push(`✗ ${label}: ${String(e)}`)
      return false
    }
  }

  // Create tables
  await runSQL('Create subjects table', `
    create table if not exists subjects (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      description text,
      color text default '#0891b2',
      icon text default '🔬',
      created_at timestamptz default now()
    )
  `)

  await runSQL('Create questions table', `
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

  await runSQL('Create user_progress table', `
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

  await runSQL('Create lectures table', `
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

  // Enable RLS + policies
  await runSQL('Enable RLS on all tables', `
    alter table subjects enable row level security;
    alter table questions enable row level security;
    alter table user_progress enable row level security;
    alter table lectures enable row level security;
  `)

  await runSQL('Create RLS policies', `
    drop policy if exists "subjects_public_read" on subjects;
    drop policy if exists "questions_public_read" on questions;
    drop policy if exists "lectures_public_read" on lectures;
    drop policy if exists "lectures_auth_insert" on lectures;
    drop policy if exists "progress_user_select" on user_progress;
    drop policy if exists "progress_user_insert" on user_progress;
    drop policy if exists "progress_user_update" on user_progress;

    drop policy if exists "questions_auth_update" on questions;

    create policy "subjects_public_read" on subjects for select using (true);
    create policy "questions_public_read" on questions for select using (true);
    create policy "questions_auth_update" on questions for update using (auth.uid() is not null);
    create policy "lectures_public_read" on lectures for select using (true);
    create policy "lectures_auth_insert" on lectures for insert with check (auth.uid() = uploaded_by);
    create policy "progress_user_select" on user_progress for select using (auth.uid() = user_id);
    create policy "progress_user_insert" on user_progress for insert with check (auth.uid() = user_id);
    create policy "progress_user_update" on user_progress for update using (auth.uid() = user_id);
  `)

  // Seed subjects
  await runSQL('Seed subjects', `
    insert into subjects (id, name, description, color, icon) values
      ('11111111-1111-1111-1111-111111111111', 'Anatomy', 'Gross anatomy, radiological anatomy, surface anatomy', '#0891b2', '🦴'),
      ('22222222-2222-2222-2222-222222222222', 'Histology', 'Microscopic anatomy and tissue identification', '#7c3aed', '🔬'),
      ('33333333-3333-3333-3333-333333333333', 'Pathology', 'Disease morphology, gross and microscopic pathology', '#dc2626', '🧫'),
      ('44444444-4444-4444-4444-444444444444', 'Biochemistry', 'Clinical biochemistry, metabolic pathways, lab values', '#059669', '⚗️'),
      ('55555555-5555-5555-5555-555555555555', 'Microbiology', 'Bacteriology, virology, mycology, gram stains', '#d97706', '🦠'),
      ('66666666-6666-6666-6666-666666666666', 'Physiology', 'Normal physiological function and clinical correlation', '#0284c7', '❤️'),
      ('77777777-7777-7777-7777-777777777777', 'Radiology', 'Radiological interpretation and imaging modalities', '#9333ea', '🩻')
    on conflict do nothing
  `)

  // Seed questions (batch 1)
  await runSQL('Seed anatomy questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('11111111-1111-1111-1111-111111111111', 1,
    'Station 1 — Vertebra Image
1. What vertebra is this?
2. What is the marked structure X?
3. Mention 3 sites where X is NOT present?
4. What is Y?
5. What region of the vertebra has a foramen in structure Y?',
    '1. Cervical vertebra (likely C3-C6)
2. X = Transverse foramen (foramen transversarium) — found only in cervical vertebrae
3. NOT present in: Thoracic, Lumbar, Sacral vertebrae
4. Y = Transverse process
5. The costal element (anterior root) of cervical vertebrae contains the transverse foramen',
    'Transverse foramina are UNIQUE to cervical vertebrae — transmit vertebral artery (except C7). Thoracic = costal facets. Lumbar = large, no foramina in transverse processes.',
    'medium', ARRAY['vertebrae','cervical','anatomy']),

    ('11111111-1111-1111-1111-111111111111', 2,
    'Station 2 — Gluteal/thigh nerve image
1. What is nerve X?
2. Name 2 muscles X innervates?
3. What is nerve Y?
4. What nerve is injured by IM injection in region Z?',
    '1. X = Sciatic nerve (largest nerve in body)
2. Biceps femoris, Semitendinosus (also Semimembranosus, Adductor magnus posterior)
3. Y = Superior or Inferior gluteal nerve
4. Sciatic nerve — safe IM zone = upper outer quadrant of buttock',
    'Sciatic nerve exits BELOW piriformis through greater sciatic foramen. Safe IM = upper outer quadrant. Divides into tibial + common peroneal at popliteal fossa.',
    'medium', ARRAY['sciatic nerve','gluteal','IM injection']),

    ('11111111-1111-1111-1111-111111111111', 3,
    'Station 3 — Knee joint aspiration
1. What fluid is aspirated?
2. What is X?
3. What is Y?
4. Why is Y more liable to tear than X?',
    '1. Synovial fluid (from knee joint/suprapatellar bursa)
2. X = Anterior cruciate ligament (ACL) or Medial collateral ligament (MCL)
3. Y = Medial meniscus
4. Medial meniscus is fixed to MCL (less mobile). Unhappy triad: ACL + MCL + Medial meniscus',
    'Unhappy triad = ACL + MCL + Medial meniscus. Medial meniscus FIXED to MCL → vulnerable. Lateral meniscus = MORE MOBILE → less torn.',
    'hard', ARRAY['knee','meniscus','ligament','synovial']),

    ('11111111-1111-1111-1111-111111111111', 4,
    'Station 4 — Lung anatomy
1. What lobe is X?
2. Bronchopulmonary segments of X?
3. Child swallowed coin through trachea — Y or Z bronchus more likely? Why?',
    '1. X = Right middle lobe (or right lower lobe)
2. Right middle lobe: Medial + Lateral segments. Right lower lobe: Superior, Medial basal, Anterior basal, Lateral basal, Posterior basal
3. Right main bronchus (Y) — wider, shorter, more vertical (~25° vs 45° left). Directly in line with trachea.',
    'RIGHT bronchus = Wider + Shorter + More Vertical → foreign bodies go RIGHT. Mnemonic: "RIGHT is right for foreign bodies."',
    'medium', ARRAY['bronchus','lung lobes','foreign body','segments']),

    ('11111111-1111-1111-1111-111111111111', 5,
    'Station 5 — Heart
1. What groove is X?
2. Name artery and vein in X?
3. Physiological state of mitral (Y) and tricuspid (Z) in systole?',
    '1. X = Coronary sulcus (atrioventricular groove)
2. Right: RCA + Small cardiac vein. Left: Left circumflex + Great cardiac vein
3. BOTH CLOSED during systole → produces S1 heart sound',
    'SYSTOLE: AV valves CLOSE (S1), semilunar valves OPEN. DIASTOLE: semilunar valves CLOSE (S2), AV valves OPEN.',
    'medium', ARRAY['heart','coronary sulcus','cardiac valves','systole']),

    ('11111111-1111-1111-1111-111111111111', 6,
    'Station 6 — Abdominal image
1. What vessel is X?
2. What organ is Y? Mention its parts?
3. What is area Z and its contents?',
    '1. X = Portal vein
2. Y = Liver: Right lobe, Left lobe, Caudate lobe, Quadrate lobe (Couinaud: 8 segments)
3. Z = Porta hepatis: Portal vein (posterior), Hepatic artery (left), Common bile duct (right)',
    'Porta hepatis contents: CBD (right) + Hepatic artery (left) + Portal vein (posterior). Mnemonic: VAN — Vein, Artery, caNal (bile duct).',
    'hard', ARRAY['liver','portal vein','porta hepatis','abdomen']),

    ('11111111-1111-1111-1111-111111111111', 7,
    'Station 7 — Surface anatomy
1. Underlying structures of X?
2. Arterial supply of X?',
    '1. Femoral triangle contents (NAVY lateral→medial): Nerve (femoral), Artery (femoral), Vein (femoral), Y-fronts (femoral canal/empty)
Or cubital fossa: brachialis, median nerve, brachial artery, biceps tendon
2. Femoral artery (from external iliac) or Brachial artery',
    'Femoral triangle: NAVY (Nerve-Artery-Vein lateral to medial). Boundaries: inguinal ligament (top), sartorius (lateral), adductor longus (medial).',
    'medium', ARRAY['surface anatomy','femoral triangle','cubital fossa'])
    on conflict do nothing
  `)

  await runSQL('Seed biochemistry questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('44444444-4444-4444-4444-444444444444', 8,
    'Station 8 — Lipid Profile
50-year-old male: TC=290, TG=200, HDL=30, LDL=HIGH mg/dL
1. Comment on each value?
2. Normal values of LDL and TC?
3. Calculate VLDL?',
    '1. TC=290 → HIGH (normal <200). HDL=30 → LOW risk factor (normal M>40, F>50). LDL=HIGH (optimal <100). TG=200 → Borderline high (normal <150)
2. TC normal: <200 mg/dL. LDL optimal: <100 mg/dL
3. VLDL = TG÷5 = 200÷5 = 40 mg/dL (ELEVATED, normal 2-30)',
    'Friedewald: LDL = TC - HDL - VLDL, VLDL = TG/5 (valid only when TG<400). Normal: TC<200, LDL<100, HDL>40M/>50F, TG<150, VLDL 2-30.',
    'medium', ARRAY['lipid profile','cholesterol','VLDL','cardiovascular risk']),

    ('44444444-4444-4444-4444-444444444444', 9,
    'Station 9 — DM Diagnosis
OGTT: FBG=140 mg/dL, 2hr post=230 mg/dL, HbA1c=7.2%
1. Diagnosis?
2. What does HbA1c indicate?
3. Normal 2hr OGTT value?',
    '1. Type 2 Diabetes Mellitus (FBG≥126, 2hr OGTT≥200, HbA1c≥6.5% — all criteria met)
2. HbA1c = average blood glucose over past 2-3 MONTHS (RBC lifespan ~120 days). Non-enzymatic glycation of hemoglobin
3. Normal 2hr OGTT: <140 mg/dL. Pre-DM: 140-199. DM: ≥200',
    'DM diagnosis: FBG≥126 OR 2hr OGTT≥200 OR HbA1c≥6.5% OR random glucose≥200+symptoms. HbA1c = 3-month glucose average.',
    'medium', ARRAY['diabetes','HbA1c','OGTT','glucose'])
    on conflict do nothing
  `)

  await runSQL('Seed histology questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('22222222-2222-2222-2222-222222222222', 10,
    'Station 10 — Lymph Node
1. What is L?
2. Cells normally present in L?
3. What is C?',
    '1. L = Lymphoid follicle (secondary, with germinal center) in cortex
2. Germinal center cells: B lymphocytes (centroblasts/centrocytes), Follicular dendritic cells, Tingible body macrophages, CD4+ T helper cells
3. C = Capsule (dense collagenous; sends trabeculae inward)',
    'Lymph node zones: Cortex (B cells/follicles) → Paracortex (T cells/HEVs) → Medulla (plasma cells/macrophages). Secondary follicles = germinal centers = active response.',
    'medium', ARRAY['lymph node','histology','germinal center','B cells']),

    ('22222222-2222-2222-2222-222222222222', 11,
    'Station 11 — Histology slide
A. Identify the structure.
B. Yellow star: identify and name cells present.
C. Identify X and its function.',
    'A. Spleen (white + red pulp) OR Lymph node
B. Yellow star = White pulp (spleen) or Germinal center (lymph node). Cells: B cells, T cells, macrophages, dendritic cells
C. X = Red pulp (spleen): filters blood, removes old RBCs, stores platelets/monocytes. Or Paracortex (LN): T cell activation, HEVs',
    'Spleen: White pulp = lymphoid (immune). Red pulp = sinusoids (filter blood). Surrounded by marginal zone.',
    'medium', ARRAY['spleen','histology','white pulp','red pulp']),

    ('22222222-2222-2222-2222-222222222222', 12,
    'Station 12 — Blood vessel
A. Identify vessel type.
B. Layer marked Z?
C. Structure A?
D. Layer in box?',
    'A. Medium muscular artery (thick wall, round lumen)
B. Z = Tunica media (circular smooth muscle + elastic fibers)
C. A = Internal elastic lamina (IEL) — wavy line between intima and media
D. Box = Tunica adventitia (loose connective tissue, vasa vasorum)',
    'Layers (lumen outward): Intima (endothelium+IEL) → Media (smooth muscle) → Adventitia (connective tissue). Arteries: thick wall, round lumen. Veins: thin wall, irregular lumen.',
    'easy', ARRAY['blood vessel','histology','tunica','artery']),

    ('22222222-2222-2222-2222-222222222222', 13,
    'Station 13 — Epithelium
A. Identify the structure.
B. Star structure?
C. Two cells in the epithelium?',
    'A. Trachea (pseudostratified ciliated columnar epithelium + C-shaped hyaline cartilage)
B. Star = Hyaline cartilage rings OR submucosal seromucinous glands
C. 1) Ciliated columnar cells (move mucus). 2) Goblet cells (secrete mucus). Also: basal cells, brush cells, Kulchitsky cells',
    'Respiratory epithelium = PCCE (Pseudostratified Ciliated Columnar Epithelium). All cells touch basement membrane. Goblet cells = mucus. Cilia beat UPWARD.',
    'easy', ARRAY['trachea','respiratory epithelium','histology','goblet cells'])
    on conflict do nothing
  `)

  await runSQL('Seed pathology DM questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('33333333-3333-3333-3333-333333333333', 14,
    'Lab 1 — DM Kidney (PAS stain)
Pink hyaline nodules at periphery of glomeruli.
1. What type of glomerulosclerosis?
2. Morphological features?
3. Two types of diabetic nephropathy?',
    '1. Nodular glomerulosclerosis (Kimmelstiel-Wilson lesion) — PATHOGNOMONIC of DM
2. Pink PAS-positive nodules (laminated matrix + trapped mesangial cells) at glomerular periphery
3. a) Diffuse (mesangiosclerosis): ↑mesangial matrix, BM thickening — common, non-specific
   b) Nodular (Kimmelstiel-Wilson): discrete nodules — less common but DIAGNOSTIC',
    'Kimmelstiel-Wilson = pathognomonic of DM. PAS-positive mesangial nodules. Distinguish from MPGN (tram-track) and amyloid (Congo red+).',
    'hard', ARRAY['diabetic nephropathy','Kimmelstiel-Wilson','glomerulosclerosis','PAS stain']),

    ('33333333-3333-3333-3333-333333333333', 15,
    'Lab 1 — DM Pancreas
1. Changes in Type I DM pancreas?
2. Changes in Type II DM pancreas?
3. Stain for amyloid? Characteristic finding?',
    '1. Type I: ↓number and size of islets, insulitis (T lymphocyte infiltration), selective β-cell destruction
2. Type II: amyloid deposition (IAPP/amylin) replacing β-cells (hyalinization), no significant insulitis
3. Congo Red stain: amyloid = RED. Under polarized light = apple-GREEN BIREFRINGENCE (pathognomonic)',
    'Type I = Insulitis (autoimmune T-cell attack). Type II = Amyloid (IAPP). Congo Red → red/green birefringence = AMYLOID hallmark.',
    'hard', ARRAY['diabetes','pancreas','insulitis','amyloid','Congo red']),

    ('33333333-3333-3333-3333-333333333333', 16,
    'Lab 1 — DM Retina
1. Two types of diabetic retinopathy?
2. Four features of non-proliferative?
3. Four features of proliferative?
4. What causes neovascularization?',
    '1. Non-proliferative (background) and Proliferative
2. Non-proliferative: microaneurysms (earliest), dot-blot hemorrhages, hard exudates (lipid), cotton-wool spots (microinfarcts)
3. Proliferative: neovascularization, large hemorrhages, fibrosis, retinal detachment
4. Retinal ischemia → VEGF release → fragile new vessels → hemorrhage',
    'Non-proliferative = vascular permeability. Proliferative = VEGF neovascularization → fragile vessels → sudden vision loss. Tx: anti-VEGF, laser.',
    'hard', ARRAY['diabetic retinopathy','VEGF','neovascularization','microaneurysms'])
    on conflict do nothing
  `)

  await runSQL('Seed pathology RA questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('33333333-3333-3333-3333-333333333333', 17,
    'Lab 2 — RA Joints
1. Synovial changes in RA?
2. What is pannus? Cells forming it?
3. What are rice bodies?
4. What is fibrous ankylosis?',
    '1. Synovium: edematous, thickened, hyperplastic, frond-like (villous) projections. Lymphoid aggregates, neutrophils in fluid, juxta-articular erosions
2. Pannus = destructive granulation tissue (lymphocytes, plasma cells, macrophages, fibroblasts). Destroys cartilage + bone. Mainly PIP + MCP joints
3. Rice bodies = floating organized FIBRIN aggregates shed from inflamed synovium
4. Fibrous ankylosis = pannus bridges articular surfaces → joint fusion (end-stage RA)',
    'RA progression: Synovitis → Pannus → Cartilage destruction → Fibrous ankylosis. Pannus = MOST IMPORTANT feature. Most common joints: PIP > MCP.',
    'hard', ARRAY['rheumatoid arthritis','pannus','synovitis','ankylosis']),

    ('33333333-3333-3333-3333-333333333333', 18,
    'Lab 2 — Rheumatoid Nodule
1. Histological appearance?
2. Clinical location?
3. What are the palisading cells?',
    '1. Central FIBRINOID NECROSIS of collagen → surrounded by PALISADING HISTIOCYTES → outer chronic inflammatory cells + fibrosis
2. Subcutaneously over bony prominences. Most common: ELBOW (olecranon). Also wrists, fingers, Achilles. Size 1-2cm. RF-positive RA
3. Palisading macrophages (histiocytes) — long axes perpendicular to necrotic center (picket fence arrangement)',
    'Rheumatoid nodule: fibrinoid necrosis (center) + palisading macrophages (middle) + lymphocytes (outside). ELBOW most common. NOT a granuloma (no giant cells).',
    'medium', ARRAY['rheumatoid nodule','fibrinoid necrosis','palisading histiocytes']),

    ('33333333-3333-3333-3333-333333333333', 19,
    'Lab 2 — RA Kidney
1. Kidney disorders associated with RA?
2. Membranous nephropathy histology?
3. Tram-track appearance — what and where?',
    '1. Membranous nephropathy (MOST COMMON), Secondary amyloidosis, FSGS, MPGN, Rheumatoid vasculitis, Analgesic nephropathy (NSAIDs)
2. PAS: diffuse GBM thickening. IF: granular IgG+C3 along GBM. EM: subepithelial deposits. Non-proliferative
3. Tram-track = MPGN: mesangial interposition into GBM → double contour on silver stain',
    'Membranous nephropathy = GBM thickening (PAS) + granular IF = nephrotic syndrome prototype. MPGN = tram-track. Amyloidosis = Congo Red+. Analgesics (NSAIDs) → analgesic nephropathy.',
    'hard', ARRAY['RA kidney','membranous nephropathy','MPGN','tram-track'])
    on conflict do nothing
  `)

  await runSQL('Seed pathology pneumonia questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('33333333-3333-3333-3333-333333333333', 20,
    'Lab 3 — Lobar Pneumonia Stages
Name and describe the 4 stages in order.',
    '1. CONGESTION (Day 1-2): heavy red lobe, vascular congestion, serous exudate + few neutrophils, still crepitant
2. RED HEPATIZATION (Day 3-4): firm airless RED lobe like liver; alveoli packed with RBCs + neutrophils + fibrin
3. GREY HEPATIZATION (Day 5-7): grey-yellow dry firm lobe; RBCs lysed, alveoli filled with macrophages + fibrin
4. RESOLUTION (Week 2): enzymatic digestion of exudate, macrophages clear debris, normal architecture restored',
    'Mnemonic: Can Red Gorillas Run? = Congestion → Red hepatization → Grey hepatization → Resolution. Red = RBCs fill alveoli. Grey = macrophages replace RBCs.',
    'medium', ARRAY['lobar pneumonia','hepatization','stages']),

    ('33333333-3333-3333-3333-333333333333', 21,
    'Lab 3 — Lobar vs Bronchopneumonia
Compare: age, patient type, gender, organisms, distribution, boundaries, laterality.',
    'LOBAR: age 20-50, primary/healthy, males>females, Strep. pneumoniae (95%)/Klebsiella, entire lobe, diffuse, limited by anatomic boundaries, usually UNILATERAL
BRONCHOPNEUMONIA: extremes of age, secondary/debilitated, both genders, Staph/Strep/H.influenzae/Pseudomonas, PATCHY around airways, NOT limited by boundaries, usually BILATERAL',
    'Lobar = ONE lobe, young healthy, Pneumococcus, unilateral. Broncho = PATCHY around airways, elderly/infant, multiple bugs, bilateral.',
    'medium', ARRAY['lobar pneumonia','bronchopneumonia','comparison']),

    ('33333333-3333-3333-3333-333333333333', 22,
    'Lab 3 — Interstitial Pneumonia
1. Histological features?
2. How does it differ from lobar/bronchopneumonia?
3. Causative organisms?',
    '1. Alveolar spaces EMPTY or proteinaceous fluid (few/no inflammatory cells). Septal thickening with mononuclear infiltrate. Hyaline membranes in severe cases
2. vs Lobar: no hepatization, no neutrophilic exudate; vs Broncho: not airway-centered, mononuclear not neutrophilic
3. Viruses (influenza, RSV, CMV, COVID-19), Mycoplasma pneumoniae (most common atypical), Chlamydophila, PCP, Legionella',
    'Interstitial = ATYPICAL pneumonia. Inflammation in WALLS (septa), not spaces. Mycoplasma = walking pneumonia. Dry cough, mild fever, bilateral ground-glass on CT.',
    'hard', ARRAY['interstitial pneumonia','atypical','Mycoplasma'])
    on conflict do nothing
  `)

  await runSQL('Seed microbiology, physiology, radiology questions', `
    insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values
    ('55555555-5555-5555-5555-555555555555', 23,
    'Microbiology — Gram Stain
Figure A: gram stain. Figure B: blood agar.
A. Species name (no abbreviation)?
B. Gram stain result?
C. Media name and hemolysis type?',
    'Scenario 1 — Streptococcus pneumoniae: Gram POSITIVE lancet diplococci. Blood agar → ALPHA hemolysis (green, partial)
Scenario 2 — Staphylococcus aureus: Gram POSITIVE cocci in clusters. Blood agar → BETA hemolysis (clear, complete)
Scenario 3 — Streptococcus pyogenes: Gram POSITIVE cocci in chains. Blood agar → BETA hemolysis
Hemolysis: α=incomplete/green, β=complete/clear, γ=none',
    'Alpha=Almost (incomplete, green). Beta=Better (complete, clear). Gamma=Gone (none). Pneumococcus=alpha+lancet diplococci+optochin sensitive. Staph aureus=beta+coagulase+.',
    'medium', ARRAY['gram stain','hemolysis','streptococcus','staphylococcus','blood agar']),

    ('66666666-6666-6666-6666-666666666666', 24,
    'Physiology Station
Interpret clinical values. Common OSPE topics: ECG, spirometry, ABG, renal function.',
    'ECG: PR=0.12-0.20s, QRS<0.12s, Rate=300÷RR-intervals
Spirometry: FEV1/FVC normal>0.75. Obstructive (asthma/COPD): ↓FEV1/FVC. Restrictive (fibrosis): normal ratio, ↓FVC
ABG: pH 7.35-7.45, PaCO2 35-45, HCO3 22-26. Resp acidosis: ↓pH+↑CO2. Met acidosis: ↓pH+↓HCO3
Renal: Cr 0.6-1.2, BUN 7-20. BUN:Cr>20=pre-renal',
    'ABG approach: 1)pH normal? 2)CO2 or HCO3 explain it? 3)Compensation present? Spirometry: GOLD = FEV1% for COPD severity.',
    'medium', ARRAY['physiology','ECG','spirometry','ABG','renal']),

    ('77777777-7777-7777-7777-777777777777', 25,
    'Radiology Station
Identify imaging modality and describe findings.',
    'CXR approach (ABCDE): Airway (trachea midline?), Bones (fractures?), Cardiac (CTR<0.5), Diaphragm (sharp angles?), Everything else (lung fields)
Key findings: Consolidation+air bronchogram=pneumonia. Pleural effusion=blunted costophrenic angle. Pneumothorax=hyperlucent+no lung markings. CTR>0.5=cardiomegaly
CT: Hyperdense=acute blood. Hypodense=infarct/edema. PE=filling defect in pulmonary artery',
    'CXR mnemonic ABCDE. Consolidation + air bronchogram = pneumonia. Meniscus sign = pleural effusion. Pneumothorax = absent lung markings.',
    'medium', ARRAY['radiology','CXR','chest X-ray','CT scan'])
    on conflict do nothing
  `)

  // Seed images — real Wikimedia Commons medical images matched to each question
  await runSQL('Seed question images', `
    -- ANATOMY
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Cervical_vertebra_english.png/800px-Cervical_vertebra_english.png'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=1;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Sciatic_nerve.jpg/800px-Sciatic_nerve.jpg'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=2;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Knee_diagram.svg/800px-Knee_diagram.svg.png'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=3;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Respiratory_system_complete_en.svg/800px-Respiratory_system_complete_en.svg.png'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=4;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/800px-Diagram_of_the_human_heart_%28cropped%29.svg.png'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=5;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Portal_hypertension.svg/800px-Portal_hypertension.svg.png'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=6;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Femoral_triangle.svg/800px-Femoral_triangle.svg.png'
    where subject_id='11111111-1111-1111-1111-111111111111' and station_number=7;

    -- HISTOLOGY
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Lymph_node_histology.jpg/800px-Lymph_node_histology.jpg'
    where subject_id='22222222-2222-2222-2222-222222222222' and station_number=10;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Spleen_histology.jpg/800px-Spleen_histology.jpg'
    where subject_id='22222222-2222-2222-2222-222222222222' and station_number=11;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Artery_wall_histology.jpg/800px-Artery_wall_histology.jpg'
    where subject_id='22222222-2222-2222-2222-222222222222' and station_number=12;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Trachea_cross_section.jpg/800px-Trachea_cross_section.jpg'
    where subject_id='22222222-2222-2222-2222-222222222222' and station_number=13;

    -- PATHOLOGY - DM
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Diabetic_glomerulosclerosis_%284%29_Periodic_acid%E2%80%93Schiff.jpg/800px-Diabetic_glomerulosclerosis_%284%29_Periodic_acid%E2%80%93Schiff.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=14;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Amyloid_deposits_in_islets_of_Langerhans_%28Congo_red%29.jpg/800px-Amyloid_deposits_in_islets_of_Langerhans_%28Congo_red%29.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=15;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Proliferative_diabetic_retinopathy.jpg/800px-Proliferative_diabetic_retinopathy.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=16;

    -- PATHOLOGY - RA
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Rheumatoid_arthritis_joint_pathology.jpg/800px-Rheumatoid_arthritis_joint_pathology.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=17;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Rheumatoid_nodule_-_very_high_mag.jpg/800px-Rheumatoid_nodule_-_very_high_mag.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=18;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Membranous_nephropathy_-_high_mag.jpg/800px-Membranous_nephropathy_-_high_mag.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=19;

    -- PATHOLOGY - Pneumonia
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Lobar_pneumonia_red_hepatization.jpg/800px-Lobar_pneumonia_red_hepatization.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=20;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Bronchopneumonia_-_low_mag.jpg/800px-Bronchopneumonia_-_low_mag.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=21;

    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Interstitial_pneumonia.jpg/800px-Interstitial_pneumonia.jpg'
    where subject_id='33333333-3333-3333-3333-333333333333' and station_number=22;

    -- MICROBIOLOGY
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Streptococcus_pneumoniae_01.jpg/800px-Streptococcus_pneumoniae_01.jpg'
    where subject_id='55555555-5555-5555-5555-555555555555' and station_number=23;

    -- RADIOLOGY
    update questions set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Pneumonia_x-ray.jpg/800px-Pneumonia_x-ray.jpg'
    where subject_id='77777777-7777-7777-7777-777777777777' and station_number=25;
  `)

  // Try to create storage bucket for lectures
  try {
    const bucketRes = await fetch(`${url}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ id: 'lectures', name: 'lectures', public: true }),
    })
    if (bucketRes.ok) {
      steps.push('✓ Created lectures storage bucket')
    } else {
      const body = await bucketRes.text()
      if (body.includes('already exists')) {
        steps.push('✓ Lectures storage bucket already exists')
      } else {
        errors.push(`⚠ Storage bucket: ${body.slice(0, 200)}`)
      }
    }
  } catch (e) {
    errors.push(`⚠ Storage bucket: ${String(e)}`)
  }

  return NextResponse.json({
    success: errors.filter(e => e.startsWith('✗')).length === 0,
    message: errors.filter(e => e.startsWith('✗')).length === 0
      ? '🎉 Setup complete! Your OSPE Study Helper is ready.'
      : 'Setup completed with some warnings. Check errors below.',
    steps,
    errors,
    next: 'Go to your app URL to start studying!',
  }, { status: 200 })
}
