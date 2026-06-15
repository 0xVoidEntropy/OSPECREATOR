-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Subjects
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text default '#0891b2',
  icon text default '🔬',
  created_at timestamptz default now()
);

-- Questions
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
  image_crop jsonb,
  created_at timestamptz default now()
);

-- User Progress
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
);

-- Lectures
create table if not exists lectures (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) on delete cascade,
  title text not null,
  file_url text,
  file_type text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- RLS Policies
alter table subjects enable row level security;
alter table questions enable row level security;
alter table user_progress enable row level security;
alter table lectures enable row level security;

drop policy if exists "subjects_public_read" on subjects;
drop policy if exists "questions_public_read" on questions;
drop policy if exists "questions_auth_update" on questions;
drop policy if exists "lectures_public_read" on lectures;
drop policy if exists "lectures_auth_insert" on lectures;
drop policy if exists "progress_user_select" on user_progress;
drop policy if exists "progress_user_insert" on user_progress;
drop policy if exists "progress_user_update" on user_progress;

create policy "subjects_public_read" on subjects for select using (true);
create policy "questions_public_read" on questions for select using (true);
create policy "questions_auth_update" on questions for update using (auth.uid() is not null);
create policy "lectures_public_read" on lectures for select using (true);
create policy "lectures_auth_insert" on lectures for insert with check (auth.uid() = uploaded_by);

create policy "progress_user_select" on user_progress for select using (auth.uid() = user_id);
create policy "progress_user_insert" on user_progress for insert with check (auth.uid() = user_id);
create policy "progress_user_update" on user_progress for update using (auth.uid() = user_id);

-- Seed subjects
insert into subjects (id, name, description, color, icon) values
  ('11111111-1111-1111-1111-111111111111', 'Anatomy', 'Gross anatomy, radiological anatomy, surface anatomy', '#0891b2', '🦴'),
  ('22222222-2222-2222-2222-222222222222', 'Histology', 'Microscopic anatomy and tissue identification', '#7c3aed', '🔬'),
  ('33333333-3333-3333-3333-333333333333', 'Pathology', 'Disease morphology, gross and microscopic pathology', '#dc2626', '🧫'),
  ('44444444-4444-4444-4444-444444444444', 'Biochemistry', 'Clinical biochemistry, metabolic pathways, lab values', '#059669', '⚗️'),
  ('55555555-5555-5555-5555-555555555555', 'Microbiology', 'Bacteriology, virology, mycology, gram stains', '#d97706', '🦠'),
  ('66666666-6666-6666-6666-666666666666', 'Physiology', 'Normal physiological function and clinical correlation', '#0284c7', '❤️'),
  ('77777777-7777-7777-7777-777777777777', 'Radiology', 'Radiological interpretation and imaging modalities', '#9333ea', '🩻')
on conflict do nothing;

-- Seed questions
insert into questions (subject_id, station_number, question_text, answer, hint, difficulty, tags) values

-- ANATOMY
('11111111-1111-1111-1111-111111111111', 1,
'Station 1 — Vertebra Image
1. What vertebra is this?
2. What is the marked structure X?
3. Mention 3 sites where X is NOT present?
4. What is Y?
5. What region of the vertebra has a foramen in structure Y?',
'1. Cervical vertebra (likely C3-C6 based on features)
2. X = Transverse foramen (foramen transversarium) — found only in cervical vertebrae
3. X (transverse foramen) is NOT present in: Thoracic vertebrae, Lumbar vertebrae, Sacral vertebrae
4. Y = Transverse process
5. The costal element (anterior root of transverse process) of cervical vertebrae contains the transverse foramen',
'Transverse foramina are unique to cervical vertebrae — they transmit the vertebral artery (except C7 which only transmits veins). Thoracic vertebrae have costal facets. Lumbar vertebrae are large without foramina in transverse processes.',
'medium', ARRAY['vertebrae', 'cervical', 'anatomy']),

('11111111-1111-1111-1111-111111111111', 2,
'Station 2 — Nerve Image of the gluteal/thigh region
1. What is the nerve labeled X?
2. Name 2 muscles that X innervates?
3. What is the nerve labeled Y?
4. What nerve is commonly injured by IM injection in region Z?',
'1. X = Sciatic nerve (largest nerve in the body)
2. Sciatic nerve innervates: Biceps femoris (hamstring), Semitendinosus, Semimembranosus, Adductor magnus (posterior part)
3. Y = Superior gluteal nerve or Inferior gluteal nerve (depending on image position)
4. The sciatic nerve is commonly injured by IM injection in the gluteal region — safe zone is upper outer quadrant',
'The sciatic nerve exits below piriformis (90%) through greater sciatic foramen. IM injections should be given in the upper outer quadrant of the buttock to avoid the sciatic nerve. It divides into tibial and common peroneal nerves at the popliteal fossa.',
'medium', ARRAY['sciatic nerve', 'gluteal', 'IM injection']),

('11111111-1111-1111-1111-111111111111', 3,
'Station 3 — Knee joint aspiration image
1. What fluid is being aspirated?
2. What is X?
3. What is Y?
4. Explain why structure Y is more liable to tear than X?',
'1. Synovial fluid (from the knee joint/suprapatellar bursa)
2. X = Medial collateral ligament (MCL) / or Anterior cruciate ligament (ACL)
3. Y = Medial meniscus (or lateral depending on image)
4. The medial meniscus is more liable to tear than the lateral because:
   - It is firmly attached to the medial collateral ligament (less mobile)
   - The lateral meniscus is more mobile and can move away from injury force
   - Unhappy triad: ACL + MCL + Medial meniscus torn together',
'Remember the unhappy triad (O''Donoghue triad): ACL + MCL + Medial meniscus. The medial meniscus is FIXED to MCL making it vulnerable. The lateral meniscus is MORE MOBILE.',
'hard', ARRAY['knee', 'meniscus', 'ligament', 'synovial']),

('11111111-1111-1111-1111-111111111111', 4,
'Station 4 — Lung anatomy image
1. What lobe is X?
2. Mention the bronchopulmonary segments of X?
3. A child swallowed a coin; if it passes through the trachea, which bronchus (Y or Z) is more likely to receive it? Explain why?',
'1. X = Right middle lobe (or right lower lobe — confirm with image)
2. Right middle lobe has 2 bronchopulmonary segments: Medial segment, Lateral segment
   Right lower lobe has 5 segments: Superior, Medial basal, Anterior basal, Lateral basal, Posterior basal
3. Y = Right main bronchus — more likely to receive the coin because:
   - Wider diameter than left
   - Shorter than left
   - More vertical (less angled from trachea, ~25° vs ~45° on left)
   - Directly in line with trachea',
'Right main bronchus = Wider, Shorter, More Vertical → foreign bodies go RIGHT. Mnemonic: RIGHT is RIGHT (correct path for foreign bodies). Left bronchus is more horizontal to cross the midline.',
'medium', ARRAY['bronchus', 'lung lobes', 'foreign body', 'segments']),

('11111111-1111-1111-1111-111111111111', 5,
'Station 5 — Heart image
1. What groove is X?
2. Name the artery and vein present in X?
3. Y and Z refer to mitral and tricuspid valves (aortic valve is not shown). What is the physiological state of Y and Z in systole?',
'1. X = Coronary sulcus (atrioventricular groove/sulcus)
2. Right coronary artery (RCA) and Small cardiac vein run in the right part; Left circumflex artery and Great cardiac vein run in the left part
3. During systole:
   - Y (Mitral valve / Bicuspid) = CLOSED (prevents backflow to left atrium)
   - Z (Tricuspid valve) = CLOSED (prevents backflow to right atrium)
   - Both AV valves close at the START of systole producing S1 heart sound',
'During SYSTOLE: ventricles contract → AV valves (mitral + tricuspid) CLOSE → Semilunar valves (aortic + pulmonary) OPEN. S1 = AV valves closing. S2 = Semilunar valves closing (start of diastole).',
'medium', ARRAY['heart', 'coronary sulcus', 'cardiac valves', 'systole']),

('11111111-1111-1111-1111-111111111111', 6,
'Station 6 — Abdominal/portal image
1. What vessel is X?
2. What is the organ marked Y? Mention its parts?
3. What is the area marked Z? Mention its contents?',
'1. X = Portal vein (or hepatic artery / inferior vena cava depending on image)
2. Y = Liver — Parts: Right lobe, Left lobe, Caudate lobe (posterior), Quadrate lobe (inferior)
   Functional division: Left functional lobe (segments 1-4) and Right functional lobe (segments 5-8) by Couinaud classification
3. Z = Porta hepatis (or hepatoduodenal ligament) — Contents: Portal vein (posterior), Hepatic artery proper (left), Common bile duct (right) — mnemonic: VAN from posterior to anterior',
'Porta hepatis contents — mnemonic "Portal triad" → CBD (right) + Hepatic artery (left) + Portal vein (posterior). Couinaud segments: 8 segments, segment 1 = caudate lobe.',
'hard', ARRAY['liver', 'portal vein', 'porta hepatis', 'abdomen']),

('11111111-1111-1111-1111-111111111111', 7,
'Station 7 — Surface anatomy image
1. What are the underlying structures of X?
2. What is the arterial supply of X?',
'1. Underlying structures depend on region:
   - If X = MCL triangle (cubital fossa): Brachialis muscle, median nerve, brachial artery, biceps tendon
   - If X = femoral triangle: Femoral nerve (lateral), Femoral artery (middle), Femoral vein (medial) — mnemonic NAVY from lateral to medial: Nerve, Artery, Vein, Y-fronts (empty space/canal)
2. Arterial supply correspondingly:
   - Cubital fossa: Brachial artery (bifurcates into radial and ulnar)
   - Femoral triangle: Femoral artery (continuation of external iliac)',
'Femoral triangle boundaries: Inguinal ligament (superior), Sartorius (lateral), Adductor longus (medial). Contents NAVY: Nerve-Artery-Vein from lateral to medial.',
'medium', ARRAY['surface anatomy', 'triangles', 'femoral', 'cubital']),

-- BIOCHEMISTRY
('44444444-4444-4444-4444-444444444444', 8,
'Station 8 — Lipid Profile Case
A 50-year-old male: TC = 290 mg/dL, TG = 200 mg/dL, HDL-C = 30 mg/dL, LDL = HIGH
1. Comment on TC, HDL, LDL, and TG values (normal/high/low)?
2. What are the normal values of LDL and TC?
3. Calculate VLDL?',
'1. Comment:
   - TC = 290 mg/dL → HIGH (desirable <200, borderline 200-239, high ≥240)
   - HDL-C = 30 mg/dL → LOW (normal: men >40, women >50 mg/dL) — LOW HDL is a RISK FACTOR
   - LDL = HIGH (normal optimal <100, near optimal 100-129, borderline high 130-159, high 160-189, very high ≥190)
   - TG = 200 mg/dL → BORDERLINE HIGH (normal <150, borderline 150-199, high 200-499)
2. Normal values:
   - LDL: Optimal <100 mg/dL (general population), <70 mg/dL (very high CV risk)
   - TC: Desirable <200 mg/dL
3. VLDL calculation:
   VLDL = TG ÷ 5 = 200 ÷ 5 = 40 mg/dL (normal 2-30 mg/dL) → ELEVATED',
'Friedewald equation: LDL = TC - HDL - VLDL, where VLDL = TG/5. Only valid when TG <400. Normal values: TC <200, LDL <100 optimal, HDL >40(M)/>50(F), TG <150, VLDL 2-30 mg/dL.',
'medium', ARRAY['lipid profile', 'cholesterol', 'VLDL', 'cardiovascular risk']),

('44444444-4444-4444-4444-444444444444', 9,
'Station 9 — Diabetes Mellitus Diagnosis
A patient undergoes OGTT (Oral Glucose Tolerance Test):
- Fasting Blood Glucose: 140 mg/dL
- 2-hour post-OGTT: 230 mg/dL
- HbA1c: 7.2%
1. What is the diagnosis?
2. What does HbA1c concentration indicate?
3. What is the normal value of OGTT after 2 hours?',
'1. Diagnosis: TYPE 2 DIABETES MELLITUS
   Criteria met: FBG ≥126 mg/dL (here 140) AND 2hr OGTT ≥200 mg/dL (here 230) AND HbA1c ≥6.5% (here 7.2%)
   Any ONE of these is sufficient for diagnosis when confirmed.

2. HbA1c (Glycated Hemoglobin) indicates:
   - Average blood glucose control over the PAST 2-3 MONTHS (lifetime of RBC ~120 days)
   - Formed by non-enzymatic glycation of hemoglobin A
   - Normal: <5.7%, Pre-diabetes: 5.7-6.4%, Diabetes: ≥6.5%
   - HbA1c 7.2% corresponds to average glucose ~160 mg/dL

3. Normal OGTT 2-hour value: <140 mg/dL
   - Impaired glucose tolerance (Pre-diabetes): 140-199 mg/dL
   - Diabetes mellitus: ≥200 mg/dL',
'WHO DM diagnostic criteria (any one sufficient): FBG ≥126 mg/dL, Random glucose ≥200 + symptoms, 2hr OGTT ≥200 mg/dL, HbA1c ≥6.5%. HbA1c = 3-month glucose average because RBC lifespan is ~120 days.',
'medium', ARRAY['diabetes', 'HbA1c', 'OGTT', 'glucose', 'biochemistry']),

-- HISTOLOGY
('22222222-2222-2222-2222-222222222222', 10,
'Station 10 — Lymph Node Histology
1. What is structure L?
2. What cells are normally present in L?
3. What is structure C?',
'1. L = Lymphoid follicle (secondary lymphoid follicle with germinal center, within the cortex of lymph node)
2. Cells normally present in L (germinal center):
   - B lymphocytes (predominant) — centroblasts and centrocytes
   - Follicular dendritic cells (FDCs) — present antigens
   - Macrophages (tingible body macrophages — clean up apoptotic B cells)
   - T helper cells (CD4+) — small numbers in mantle zone
3. C = Capsule of the lymph node (dense collagenous fibrous capsule that sends trabeculae into the node)',
'Lymph node zones: Cortex (B cells, follicles), Paracortex (T cells, HEVs), Medulla (medullary cords with plasma cells + macrophages, medullary sinuses). Secondary follicles have germinal centers = active immune response.',
'medium', ARRAY['lymph node', 'histology', 'germinal center', 'B cells']),

('22222222-2222-2222-2222-222222222222', 11,
'Station 11 — Histology Slide
A. Identify the histological structure.
B. Identify the yellow star and mention cells present in it.
C. Identify X and mention its function.',
'A. Spleen (based on white pulp and red pulp organization) OR Lymph node
B. Yellow star = White pulp (spleen) / Germinal center (lymph node)
   Cells: B lymphocytes, T lymphocytes, Macrophages, Dendritic cells
C. X = Red pulp (spleen) — Function: filters blood, removes old/damaged RBCs, stores platelets and monocytes
   OR X = Paracortex (lymph node) — Function: T cell zone, site of T cell activation, contains HEVs for lymphocyte homing',
'Spleen: White pulp (lymphoid tissue around central arteriole) vs Red pulp (sinusoids + cords of Billroth). Red pulp filters blood. White pulp = immune response.',
'medium', ARRAY['spleen', 'histology', 'white pulp', 'red pulp']),

('22222222-2222-2222-2222-222222222222', 12,
'Station 12 — Blood Vessel Histology
A. Identify the blood vessel type.
B. Identify the layer marked by Z.
C. Identify structure A.
D. Identify the layer marked by the box.',
'A. Artery (medium-sized muscular artery) — thick wall with prominent tunica media
B. Z = Tunica media — composed of smooth muscle cells arranged circularly, with elastic fibers
C. A = Internal elastic lamina (IEL) — wavy line between tunica intima and tunica media
D. Box = Tunica adventitia (tunica externa) — outer layer of loose connective tissue, vasa vasorum, nervi vasorum

Layers from lumen outward:
1. Tunica intima: endothelium + subendothelial connective tissue + IEL
2. Tunica media: smooth muscle + elastic fibers
3. Tunica adventitia: connective tissue + vasa vasorum',
'Artery vs Vein: Arteries have THICKER walls, rounder lumen, prominent tunica media. Veins have THINNER walls, irregular collapsed lumen. Capillaries = only endothelium + basement membrane.',
'easy', ARRAY['blood vessel', 'histology', 'tunica', 'artery', 'layers']),

('22222222-2222-2222-2222-222222222222', 13,
'Station 13 — Epithelium Histology
A. Identify the histological structure.
B. Identify structure marked by the star.
C. Give two cells present in the epithelium.',
'A. Trachea (respiratory tract) — based on pseudostratified ciliated columnar epithelium + C-shaped cartilage rings + submucosal glands
B. Star = Hyaline cartilage (C-shaped tracheal cartilage) OR Submucosal glands (seromucinous)
C. Two cells in respiratory epithelium:
   1. Ciliated columnar cells (most numerous — move mucus)
   2. Goblet cells (produce mucus/mucin)
   Also present: Basal cells, Brush cells, Neuroendocrine (Kulchitsky) cells',
'Respiratory epithelium = Pseudostratified Ciliated Columnar Epithelium (PCCE). All cells touch basement membrane but not all reach surface. Goblet cells produce mucus. Cilia beat upward to clear debris.',
'easy', ARRAY['trachea', 'respiratory epithelium', 'histology', 'goblet cells']),

-- PATHOLOGY - DM Lab
('33333333-3333-3333-3333-333333333333', 14,
'Lab 1 — DM Pathology: Kidney
A slide shows PAS-stained glomerulus with nodules of pink hyaline material at the periphery.
1. What type of glomerulosclerosis is shown?
2. Describe the morphological features.
3. What are the two types of diabetic nephropathy?',
'1. Nodular glomerulosclerosis (Kimmelstiel-Wilson lesion) — pathognomonic of diabetic nephropathy

2. Morphological features:
   - Nodules of pink hyaline material (laminated matrix + trapped mesangial cells) at periphery of glomeruli
   - Nodules are PAS-positive
   - Located in the mesangium, at the periphery of the lobule
   - Associated with microalbuminuria and progression to ESRD

3. Two types of diabetic nephropathy:
   a) Diffuse glomerulosclerosis (mesangiosclerosis):
      - Increased mesangial matrix, slight mesangial hypercellularity
      - Capillary basement membrane thickening
      - More common but less specific
   b) Nodular glomerulosclerosis (Kimmelstiel-Wilson):
      - Pathognomonic of DM
      - Discrete pink nodules in mesangium
      - Less common but DIAGNOSTIC',
'Kimmelstiel-Wilson nodules = pathognomonic of diabetes. They are PAS-positive nodules in the glomerular mesangium. Distinguish from: MPGN (tram-track), Amyloidosis (Congo red positive), Light chain deposition disease.',
'hard', ARRAY['diabetic nephropathy', 'Kimmelstiel-Wilson', 'glomerulosclerosis', 'PAS stain']),

('33333333-3333-3333-3333-333333333333', 15,
'Lab 1 — DM Pathology: Pancreas
Slides show pancreatic islets in Type I and Type II DM.
1. Describe morphological changes in Type I DM pancreas.
2. Describe morphological changes in Type II DM pancreas.
3. What stain is used to identify amyloid? What is the characteristic finding?',
'1. Type I DM — Pancreatic changes:
   - Reduction in NUMBER and SIZE of islets of Langerhans
   - Insulitis: leukocytic infiltration of islets (predominantly T lymphocytes)
   - Selective destruction of beta (β) cells
   - Alpha cells relatively preserved

2. Type II DM — Pancreatic changes:
   - Amyloid deposition (hyalinization) in islets
   - Loss of β cells replaced by amyloid (islet amyloid polypeptide = IAPP/amylin)
   - Decrease in β cell mass (but less dramatic than Type I)
   - No significant insulitis

3. Congo Red stain:
   - Amyloid stains RED with Congo Red
   - Under polarized light: shows apple-green BIREFRINGENCE (pathognomonic)
   - This is the DIAGNOSTIC stain for amyloid',
'Type I = Insulitis (T cell attack on β cells). Type II = Amyloid deposition (IAPP). Congo Red → red color, polarized light → green birefringence. Amyloid = extracellular protein in β-pleated sheet configuration.',
'hard', ARRAY['diabetes', 'pancreas', 'insulitis', 'amyloid', 'Congo red']),

('33333333-3333-3333-3333-333333333333', 16,
'Lab 1 — DM Pathology: Retina
1. What are the two types of diabetic retinopathy?
2. List 4 features of non-proliferative retinopathy.
3. List 4 features of proliferative retinopathy.
4. What causes neovascularization in proliferative retinopathy?',
'1. Types:
   a) Non-proliferative (background) diabetic retinopathy
   b) Proliferative diabetic retinopathy

2. Non-proliferative features:
   - Microaneurysms (earliest change — focal outpouching of capillaries)
   - Dot-blot hemorrhages
   - Hard exudates (lipid deposits — pale yellow)
   - Soft exudates (cotton-wool spots — microinfarcts)
   - Macular edema
   - Venular dilation

3. Proliferative features (due to ischemia):
   - Neovascularization (new fragile vessels)
   - Large preretinal/vitreous hemorrhages
   - Fibrosis (fibrovascular proliferation)
   - Retinal detachment (traction)

4. Neovascularization cause:
   - Retinal ischemia/hypoxia → releases VEGF (Vascular Endothelial Growth Factor)
   - VEGF stimulates angiogenesis
   - New vessels are FRAGILE → bleed easily',
'Non-proliferative = vascular permeability changes (microaneurysms, hemorrhages, exudates). Proliferative = VEGF-driven neovascularization. The new vessels are fragile and bleed → sudden vision loss. Treatment: anti-VEGF, laser photocoagulation.',
'hard', ARRAY['diabetic retinopathy', 'VEGF', 'neovascularization', 'microaneurysms']),

-- PATHOLOGY - RA Lab
('33333333-3333-3333-3333-333333333333', 17,
'Lab 2 — Rheumatoid Arthritis: Joint Morphology
1. Describe the morphological changes in the synovium in RA.
2. What is pannus? What cells form it?
3. What are "rice bodies"?
4. What is fibrous ankylosis?',
'1. Synovial changes in RA:
   - Synovium becomes edematous, thickened, and hyperplastic
   - Transformation into frond-like (villous) projections (lush, thick, edematous)
   - Proliferative synovitis
   - Lymphoid aggregates form beneath synovium
   - Neutrophils on joint surface and in joint fluid
   - Juxta-articular erosions, subchondral cysts, osteoporosis (osteoclastic activity)

2. Pannus:
   - Destructive granulation tissue composed of:
     Lymphocytes, Plasma cells, Macrophages, Fibroblasts, Neovascular channels
   - Pannus destroys articular cartilage and bone
   - Most commonly affects: PIP (proximal interphalangeal) and MCP (metacarpophalangeal) joints

3. Rice bodies:
   - Small, white, rice-grain-shaped bodies in joint fluid/synovium
   - Composed of aggregates and floating organized FIBRIN
   - Shed from inflamed synovium

4. Fibrous ankylosis:
   - Bridging of pannus from one articular surface to the opposite bone
   - Results in loss of joint mobility (joint fusion)
   - End-stage RA complication',
'RA joint progression: Normal → Synovitis → Pannus formation → Cartilage destruction → Fibrous ankylosis. Pannus = most important pathological feature. Rice bodies = floating fibrin bits. Most common joints: PIP > MCP.',
'hard', ARRAY['rheumatoid arthritis', 'pannus', 'synovitis', 'ankylosis', 'joints']),

('33333333-3333-3333-3333-333333333333', 18,
'Lab 2 — Rheumatoid Arthritis: Rheumatoid Nodule
1. What is the histological appearance of a rheumatoid nodule?
2. Where are rheumatoid nodules found clinically?
3. What are the cells surrounding the central necrosis called?',
'1. Histological appearance:
   - Central area of FIBRINOID NECROSIS of collagen (pink, structureless, coagulative)
   - Surrounded by PALISADING HISTIOCYTES (macrophages arranged radially around necrosis)
   - Outer zone: Chronic inflammatory cells (lymphocytes, plasma cells)
   - Fibrosis at the periphery

2. Clinical location:
   - Subcutaneously over bony prominences
   - Most common: ELBOW (olecranon)
   - Also: wrists, fingers, occiput, Achilles tendon, sacrum
   - Size: 1-2 cm
   - Associated with seropositive (RF+) RA

3. Palisading cells = Palisading macrophages (histiocytes)
   - They arrange themselves with long axes perpendicular to the necrotic center
   - This palisading pattern is characteristic (like a picket fence)',
'Rheumatoid nodule histology: Central fibrinoid necrosis → palisading macrophages → outer lymphocytes. Location: over bony prominences (elbow most common). Associated with RF-positive RA. Do NOT confuse with granuloma (which has giant cells).',
'medium', ARRAY['rheumatoid nodule', 'fibrinoid necrosis', 'palisading histiocytes', 'RA']),

('33333333-3333-3333-3333-333333333333', 19,
'Lab 2 — RA: Kidney Involvement
1. List the kidney disorders associated with RA.
2. Describe the histology of membranous nephropathy.
3. What is the tram-track appearance and in which condition is it seen?',
'1. Kidney disorders in RA:
   - Membranous nephropathy (MOST COMMON)
   - Secondary amyloidosis (AA amyloid — long-standing RA)
   - Focal segmental glomerulosclerosis (FSGS)
   - Membranoproliferative GN (MPGN)
   - Rheumatoid vasculitis
   - Analgesic nephropathy (due to NSAIDs)

2. Membranous nephropathy histology:
   - PAS stain: diffuse thickening of GBM (glomerular basement membrane)
   - Immunofluorescence: granular deposits of IgG + complement (C3) along GBM in diffuse pattern
   - EM: subepithelial electron-dense deposits
   - No significant cellularity increase (non-proliferative)

3. Tram-track appearance:
   - Seen in: Membranoproliferative GN (MPGN / Type I)
   - Due to: Mesangial cell interposition into GBM → double contour on silver/PAS stain
   - Also shows: Mesangial proliferation, increased mesangial matrix, lobular accentuation
   - IF: Granular C3 and IgG/IgM deposits',
'Membranous nephropathy = diffuse GBM thickening on PAS, granular IF pattern — prototype of nephrotic syndrome. MPGN = tram-track (split GBM). Amyloidosis = Congo Red positive material. Analgesic nephropathy from chronic NSAID use in RA patients.',
'hard', ARRAY['RA kidney', 'membranous nephropathy', 'MPGN', 'tram-track', 'glomerulonephritis']),

-- PATHOLOGY - Pneumonia Lab
('33333333-3333-3333-3333-333333333333', 20,
'Lab 3 — Pneumonia: Stages of Lobar Pneumonia
Name and describe the 4 stages of lobar pneumonia in order.',
'1. CONGESTION (Day 1-2):
   - Gross: lobe appears heavy, red, congested
   - Micro: vascular congestion, serous exudate in alveoli, few bacteria and neutrophils
   - Still crepitant (air present)

2. RED HEPATIZATION (Day 3-4):
   - Gross: lobe is firm, airless, RED — resembles liver in color and consistency
   - Micro: alveoli packed with RBCs, neutrophils, fibrin, bacteria
   - No longer crepitant (airless)

3. GREY HEPATIZATION (Day 5-7):
   - Gross: lobe becomes GREY-YELLOW, dry, firm
   - Micro: RBCs are lysed/disintegrated; alveoli filled with macrophages and fibrin
   - Fewer neutrophils; RBCs gone

4. RESOLUTION (Week 2):
   - Gross: lobe returns to normal
   - Micro: enzymatic digestion (fibrinolysis) of exudate
   - Macrophages phagocytose debris
   - Alveolar architecture restored
   - Normal outcome in uncomplicated cases',
'Mnemonic for stages: Can Red Gorillas Run? → Congestion, Red hepatization, Grey hepatization, Resolution. Color progression: Red (RBCs) → Grey (macrophages replace RBCs). Both hepatization stages = liver-like consistency (airless).',
'medium', ARRAY['lobar pneumonia', 'hepatization', 'stages', 'pathology']),

('33333333-3333-3333-3333-333333333333', 21,
'Lab 3 — Pneumonia: Lobar vs Bronchopneumonia
Compare lobar pneumonia and bronchopneumonia across these features:
Age, type of patient, gender, causative organisms, distribution, pattern, anatomical boundaries, laterality.',
'LOBAR PNEUMONIA:
- Age: Middle age (20-50 years)
- Patient: Primary in healthy individuals
- Gender: Males more common
- Organisms: Streptococcus pneumoniae (95%), Klebsiella pneumoniae
- Distribution: Entire lobe consolidated
- Pattern: Diffuse (uniform)
- Anatomical boundaries: LIMITED by anatomic boundaries (pleural fissures)
- Laterality: Usually UNILATERAL

BRONCHOPNEUMONIA:
- Age: Extremes of age (very young and very old)
- Patient: Secondary (debilitated, hospitalized, immunocompromised)
- Gender: Both genders equally
- Organisms: Staphylococcus, Streptococcus, Haemophilus influenzae, Pseudomonas, E. coli
- Distribution: PATCHY consolidation around small airways (bronchioles)
- Pattern: Multifocal
- Anatomical boundaries: NOT limited by anatomic boundaries
- Laterality: Usually BILATERAL',
'Key differences: Lobar = young healthy adult, pneumococcus, ONE lobe, unilateral. Broncho = extremes of age, multiple organisms, PATCHY around airways, bilateral. Bronchopneumonia is more common overall.',
'medium', ARRAY['lobar pneumonia', 'bronchopneumonia', 'comparison', 'pathology']),

('33333333-3333-3333-3333-333333333333', 22,
'Lab 3 — Pneumonia: Interstitial Pneumonia
1. Describe the histological features of interstitial pneumonia.
2. How does it differ from lobar and bronchopneumonia?
3. What types of organisms cause interstitial pneumonia?',
'1. Histological features of interstitial pneumonia:
   - Alveolar air spaces: EMPTY or filled with proteinaceous fluid (NOT inflammatory exudate)
   - FEW or NO inflammatory cells in alveolar spaces
   - Septal thickening with MONONUCLEAR infiltrate (lymphocytes, macrophages)
   - Hyaline membrane formation (in severe cases — DAD pattern)
   - Interstitium is primarily affected

2. Differences:
   - vs Lobar: No hepatization, no alveolar exudate, no fibrin; interstitium affected
   - vs Broncho: Not centered on airways; diffuse; mononuclear not neutrophilic
   - Pattern: Bilateral, diffuse, mononuclear interstitial inflammation

3. Causative organisms (atypical pneumonia):
   - Viruses: Influenza, RSV, CMV, COVID-19, Measles
   - Mycoplasma pneumoniae (most common atypical)
   - Chlamydophila pneumoniae
   - Pneumocystis jirovecii (PCP — in immunocompromised)
   - Legionella pneumophila',
'Interstitial pneumonia = ATYPICAL pneumonia. Key: inflammation is in the WALLS (interstitium), not the alveolar spaces. Causes: viruses + Mycoplasma. Presents with dry cough, mild fever, "walking pneumonia".',
'hard', ARRAY['interstitial pneumonia', 'atypical', 'Mycoplasma', 'histology']),

-- MICROBIOLOGY
('55555555-5555-5555-5555-555555555555', 23,
'Station — Microbiology Gram Stain
Figure A shows a gram stain. Figure B shows growth on blood agar.
A. Name the species in Figure A (no abbreviation allowed).
B. What kind of gram stain result?
C. Name the media in Figure B and what type of hemolysis?',
'Common OSPE scenarios:

SCENARIO 1 — Streptococcus pneumoniae:
A. Streptococcus pneumoniae
B. Gram POSITIVE — lancet-shaped diplococci (pairs)
C. Blood agar — ALPHA hemolysis (partial/green hemolysis, incomplete lysis)

SCENARIO 2 — Staphylococcus aureus:
A. Staphylococcus aureus
B. Gram POSITIVE — cocci in clusters (grape-like)
C. Blood agar — BETA hemolysis (complete, clear zone)

SCENARIO 3 — Streptococcus pyogenes:
A. Streptococcus pyogenes
B. Gram POSITIVE — cocci in chains
C. Blood agar — BETA hemolysis (complete, clear zone)

HEMOLYSIS TYPES:
- Alpha (α): Incomplete, green/brown color → Strep. pneumoniae, Strep. viridans
- Beta (β): Complete, clear zone → Staph. aureus, Strep. pyogenes, Listeria
- Gamma (γ): No hemolysis → Enterococcus faecalis (on blood agar)',
'Hemolysis mnemonic: Alpha=Almost (incomplete, green). Beta=Better (complete, clear). Gamma=Gone (none). Pneumococcus = alpha, lancet diplococci, optochin sensitive. Staph aureus = beta, coagulase positive, golden colonies.',
'medium', ARRAY['gram stain', 'hemolysis', 'streptococcus', 'staphylococcus', 'blood agar']),

-- PHYSIOLOGY
('66666666-6666-6666-6666-666666666666', 24,
'Station — Physiology
Interpret the given clinical values and physiological data.
Common OSPE scenarios include: ECG interpretation, spirometry values, renal function, or cardiovascular parameters.',
'COMMON PHYSIOLOGY OSPE TOPICS:

1. ECG Interpretation:
   - Normal PR interval: 0.12-0.20 sec (3-5 small squares)
   - Normal QRS: <0.12 sec (<3 small squares)
   - Normal QT: <0.44 sec
   - Heart rate = 300 ÷ (R-R intervals in large squares)

2. Spirometry:
   - FVC: Forced Vital Capacity (total air forcibly exhaled)
   - FEV1: Volume in first second
   - FEV1/FVC ratio: Normally >0.75 (75%)
   - Obstructive pattern: FEV1/FVC <0.75 (asthma, COPD)
   - Restrictive pattern: FEV1/FVC normal/↑ but FVC ↓ (fibrosis)

3. Arterial Blood Gas (ABG):
   - pH 7.35-7.45 (normal)
   - PaCO2 35-45 mmHg
   - HCO3- 22-26 mEq/L
   - Respiratory acidosis: ↓pH + ↑CO2
   - Metabolic acidosis: ↓pH + ↓HCO3
   - Respiratory alkalosis: ↑pH + ↓CO2
   - Metabolic alkalosis: ↑pH + ↑HCO3

4. Renal Function:
   - Creatinine: 0.6-1.2 mg/dL
   - BUN: 7-20 mg/dL
   - BUN:Creatinine ratio >20 → pre-renal; 10-20 → normal/intrinsic',
'Approach to any physiology question: 1) Identify the system 2) Apply normal values 3) Determine if values are high/low/normal 4) Identify the pattern (obstructive/restrictive, acidosis/alkalosis) 5) Give diagnosis.',
'medium', ARRAY['physiology', 'ECG', 'spirometry', 'ABG', 'renal function']),

-- RADIOLOGY
('77777777-7777-7777-7777-777777777777', 25,
'Station — Radiology
Identify the imaging modality and describe the findings.
Common OSPE radiology scenarios include chest X-ray, abdomen X-ray, CT, or MRI.',
'COMMON RADIOLOGY OSPE TOPICS:

1. Chest X-Ray (CXR) — approach:
   - Technique: PA/AP, rotation (clavicular heads equidistant), inspiration
   - Airway: trachea midline
   - Bones: rib fractures, vertebrae
   - Cardiac: CTR <0.5 (cardiomegaly if >0.5)
   - Diaphragm: right higher than left (liver), costophrenic angles sharp
   - Everything else: lung fields, hilum, soft tissue

2. Common CXR findings:
   - Consolidation: homogeneous opacity with air bronchogram → pneumonia
   - Pleural effusion: blunting of costophrenic angle, meniscus sign
   - Pneumothorax: hyperlucent area without lung markings, collapsed lung visible
   - Cardiomegaly: CTR >0.5
   - Bilateral hilar lymphadenopathy: sarcoidosis

3. Abdominal X-Ray:
   - Rigler sign (double wall sign): free air (perforation)
   - Dilated small bowel loops with valvulae conniventes: obstruction
   - Dilated large bowel (haustra): volvulus

4. CT findings:
   - Brain: hyperdense = acute blood, hypodense = infarct/edema
   - Pulmonary embolism: filling defect in pulmonary artery
   - Appendicitis: enlarged appendix >6mm, fat stranding',
'CXR approach: ABCDE = Airway, Bones, Cardiac, Diaphragm, Everything else. Consolidation + air bronchogram = pneumonia. Hyperlucent = air (pneumothorax). Cardiomegaly: CTR >0.5.',
'medium', ARRAY['radiology', 'CXR', 'chest X-ray', 'CT scan', 'interpretation'])

on conflict do nothing;
