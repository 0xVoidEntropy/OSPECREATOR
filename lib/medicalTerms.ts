// AMBOSS-style term recognition: a curated list of medical terms to underline.
// Definitions are NOT hand-authored here (that doesn't scale to a 6-year curriculum) —
// they're fetched live, on hover, from established free medical reference sources
// (NIH MedlinePlus, falling back to Wikipedia) via /api/glossary.
export const MEDICAL_TERMS: string[] = [
  // Anatomy
  'peritoneum', 'reflex arc', 'brachial plexus', 'sciatic nerve', 'vagus nerve', 'phrenic nerve',
  'median nerve', 'cerebellum', 'hippocampus', 'corpus callosum', 'sarcomere',
  'neuromuscular junction', 'node of ranvier',
  // Physiology
  'action potential', 'cardiac output', 'ejection fraction', 'glomerular filtration rate',
  'renin-angiotensin system', 'aldosterone', 'antidiuretic hormone', 'frank-starling mechanism',
  'oxygen-hemoglobin dissociation curve',
  // Pathology
  'apoptosis', 'necrosis', 'metaplasia', 'dysplasia', 'atherosclerosis', 'thrombosis',
  'embolism', 'infarction',
  // Cardiovascular
  'myocardial infarction', 'congestive heart failure', 'atrial fibrillation', 'endocarditis',
  'myocarditis', 'pericarditis', 'rheumatic fever', 'deep vein thrombosis', 'pulmonary embolism',
  'aneurysm', 'hypertension',
  // Respiratory
  'pneumonia', 'tuberculosis', 'asthma', 'chronic obstructive pulmonary disease', 'bronchitis',
  // GI
  'peptic ulcer disease', 'gastroesophageal reflux disease', 'cirrhosis', 'pancreatitis',
  'appendicitis', 'cholelithiasis', 'cholecystitis', "crohn's disease", 'ulcerative colitis',
  'celiac disease', 'diverticulitis',
  // Renal
  'nephrotic syndrome', 'glomerulonephritis', 'urinary tract infection',
  // Endocrine
  'diabetes mellitus', 'diabetic ketoacidosis', 'hyperthyroidism', 'hypothyroidism',
  'cushing syndrome', "addison's disease", 'acromegaly',
  // Hematology/Oncology
  'sickle cell anemia', 'hemophilia', 'leukemia', 'lymphoma',
  // Neurology
  'multiple sclerosis', "parkinson's disease", "alzheimer's disease", 'epilepsy', 'meningitis',
  'stroke',
  // Infectious
  'sepsis', 'malaria', 'hepatitis b virus', 'influenza', 'measles', 'tetanus',
  // Rheumatology
  'rheumatoid arthritis', 'osteoarthritis', 'systemic lupus erythematosus',
  // Pharmacology
  'beta blocker', 'ace inhibitor', 'nsaid', 'corticosteroid', 'pharmacokinetics',
  'pharmacodynamics', 'half-life',
]

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sortedTerms = [...MEDICAL_TERMS].sort((a, b) => b.length - a.length)

export const MEDICAL_TERMS_REGEX = new RegExp(
  `\\b(${sortedTerms.map(escapeRegExp).join('|')})\\b`,
  'gi'
)

export const ambossSearchUrl = (term: string) =>
  `https://www.amboss.com/us/knowledge?q=${encodeURIComponent(term)}`
