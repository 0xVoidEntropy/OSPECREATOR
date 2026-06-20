// Curated high-yield medical terms for the AMBOSS-style underline/hover feature.
// This does NOT pull any AMBOSS content — it only builds a deep-link to AMBOSS's
// own knowledge library search so users can look the term up there themselves.
export const MEDICAL_TERMS: string[] = [
  // Anatomy
  'reflex arc', 'spinal cord', 'brachial plexus', 'femoral nerve', 'sciatic nerve',
  'cranial nerve', 'vagus nerve', 'phrenic nerve', 'median nerve', 'radial nerve',
  'ulnar nerve', 'cerebellum', 'hippocampus', 'thalamus', 'hypothalamus',
  'medulla oblongata', 'corpus callosum', 'basal ganglia', 'dermatome', 'myotome',
  'sarcomere', 'neuromuscular junction', 'synapse', 'axon', 'dendrite',
  'myelin sheath', 'node of ranvier', 'motor neuron', 'sensory neuron',
  // Physiology
  'action potential', 'resting membrane potential', 'cardiac cycle', 'stroke volume',
  'cardiac output', 'ejection fraction', 'starling curve', 'baroreceptor reflex',
  'glomerular filtration rate', 'tubular reabsorption', 'renin-angiotensin system',
  'aldosterone', 'antidiuretic hormone', 'insulin', 'glucagon', 'cortisol',
  'thyroid hormone', 'parathyroid hormone', 'oxygen-hemoglobin dissociation curve',
  'frank-starling mechanism', 'peristalsis', 'gastric motility',
  // Pathology
  'apoptosis', 'necrosis', 'inflammation', 'granuloma', 'fibrosis', 'metaplasia',
  'dysplasia', 'neoplasia', 'carcinoma', 'sarcoma', 'lymphoma', 'leukemia',
  'atherosclerosis', 'thrombosis', 'embolism', 'infarction', 'ischemia',
  'hypertrophy', 'atrophy', 'hyperplasia', 'edema', 'hemorrhage',
  // Microbiology
  'gram-positive', 'gram-negative', 'bacteriophage', 'endotoxin', 'exotoxin',
  'biofilm', 'mycobacterium tuberculosis', 'staphylococcus aureus',
  'streptococcus pneumoniae', 'escherichia coli', 'candida albicans',
  'herpes simplex virus', 'hepatitis b virus', 'hiv', 'plasmodium falciparum',
  // Pharmacology
  'beta blocker', 'ace inhibitor', 'calcium channel blocker', 'diuretic',
  'nsaid', 'corticosteroid', 'antibiotic resistance', 'pharmacokinetics',
  'pharmacodynamics', 'first-pass metabolism', 'half-life', 'bioavailability',
  'agonist', 'antagonist', 'receptor binding',
  // Histology
  'epithelium', 'connective tissue', 'basement membrane', 'goblet cell',
  'osteoblast', 'osteoclast', 'chondrocyte', 'fibroblast', 'hepatocyte',
  'nephron', 'alveolus', 'cardiac muscle', 'smooth muscle', 'skeletal muscle',
]

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Longest terms first so multi-word phrases match before their substrings.
const sortedTerms = [...MEDICAL_TERMS].sort((a, b) => b.length - a.length)

export const MEDICAL_TERMS_REGEX = new RegExp(
  `\\b(${sortedTerms.map(escapeRegExp).join('|')})\\b`,
  'gi'
)

export const ambossSearchUrl = (term: string) =>
  `https://www.amboss.com/us/knowledge?q=${encodeURIComponent(term)}`
