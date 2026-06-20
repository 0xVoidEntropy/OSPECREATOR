// AMBOSS-style term recognition: a curated list of medical terms to underline.
// Definitions are NOT hand-authored here (that doesn't scale to a 6-year curriculum) —
// they're fetched live, on hover, from established free medical reference sources
// (NIH MedlinePlus, falling back to Wikipedia) via /api/glossary.
export const MEDICAL_TERMS: string[] = [
  // Anatomy
  'peritoneum', 'peritoneal cavity', 'reflex arc', 'reflex action', 'spinal reflex',
  'monosynaptic reflex', 'polysynaptic reflex', 'stretch reflex', 'withdrawal reflex',
  'brachial plexus', 'lumbar plexus', 'sacral plexus', 'cervical plexus',
  'sciatic nerve', 'vagus nerve', 'phrenic nerve', 'median nerve', 'ulnar nerve',
  'radial nerve', 'femoral nerve', 'obturator nerve', 'facial nerve', 'trigeminal nerve',
  'olfactory nerve', 'optic nerve', 'cranial nerve', 'cranial nerves', 'peripheral nerve',
  'motor neuron', 'sensory neuron', 'afferent neuron', 'efferent neuron', 'interneuron',
  'synapse', 'neurotransmitter', 'acetylcholine', 'dopamine', 'serotonin', 'norepinephrine',
  'cerebellum', 'cerebrum', 'cerebral cortex', 'medulla oblongata', 'pons', 'thalamus',
  'hypothalamus', 'hippocampus', 'amygdala', 'corpus callosum', 'basal ganglia',
  'substantia nigra', 'meninges', 'cerebrospinal fluid', 'blood-brain barrier',
  'sarcomere', 'skeletal muscle', 'cardiac muscle', 'smooth muscle', 'myofibril',
  'neuromuscular junction', 'node of ranvier', 'myelin sheath', 'axon', 'dendrite',
  'epithelium', 'connective tissue', 'endothelium', 'mesothelium',
  // Physiology
  'action potential', 'resting membrane potential', 'depolarization', 'repolarization',
  'cardiac output', 'stroke volume', 'heart rate', 'ejection fraction', 'preload', 'afterload',
  'cardiac cycle', 'systole', 'diastole', 'blood pressure', 'mean arterial pressure',
  'glomerular filtration rate', 'renal blood flow', 'tubular reabsorption', 'tubular secretion',
  'renin-angiotensin system', 'aldosterone', 'antidiuretic hormone', 'vasopressin',
  'frank-starling mechanism', 'baroreceptor reflex', 'chemoreceptor',
  'oxygen-hemoglobin dissociation curve', 'gas exchange', 'tidal volume', 'vital capacity',
  'homeostasis', 'negative feedback', 'positive feedback', 'osmosis', 'diffusion',
  'active transport', 'membrane potential', 'second messenger',
  // Pathology
  'apoptosis', 'necrosis', 'metaplasia', 'dysplasia', 'hyperplasia', 'hypertrophy', 'atrophy',
  'atherosclerosis', 'thrombosis', 'embolism', 'infarction', 'ischemia', 'inflammation',
  'edema', 'fibrosis', 'granuloma', 'neoplasia', 'carcinoma', 'sarcoma', 'metastasis',
  // Cardiovascular
  'myocardial infarction', 'congestive heart failure', 'heart failure', 'atrial fibrillation',
  'arrhythmia', 'endocarditis', 'myocarditis', 'pericarditis', 'rheumatic fever',
  'deep vein thrombosis', 'pulmonary embolism', 'aneurysm', 'hypertension', 'hypotension',
  'shock', 'cardiomyopathy', 'valvular heart disease', 'coronary artery disease', 'angina',
  // Respiratory
  'pneumonia', 'tuberculosis', 'asthma', 'chronic obstructive pulmonary disease', 'bronchitis',
  'emphysema', 'pleural effusion', 'pneumothorax', 'respiratory failure', 'hypoxia',
  // GI
  'peptic ulcer disease', 'gastroesophageal reflux disease', 'cirrhosis', 'pancreatitis',
  'appendicitis', 'cholelithiasis', 'cholecystitis', "crohn's disease", 'ulcerative colitis',
  'celiac disease', 'diverticulitis', 'hepatitis', 'jaundice', 'portal hypertension',
  'irritable bowel syndrome', 'gastritis', 'malabsorption',
  // Renal
  'nephrotic syndrome', 'glomerulonephritis', 'urinary tract infection', 'renal failure',
  'acute kidney injury', 'chronic kidney disease', 'nephrolithiasis', 'pyelonephritis',
  // Endocrine
  'diabetes mellitus', 'diabetic ketoacidosis', 'hyperthyroidism', 'hypothyroidism',
  'cushing syndrome', "addison's disease", 'acromegaly', 'hyperglycemia', 'hypoglycemia',
  'goiter', 'thyroid storm', 'insulin resistance',
  // Hematology/Oncology
  'sickle cell anemia', 'hemophilia', 'leukemia', 'lymphoma', 'anemia', 'thrombocytopenia',
  'polycythemia', 'multiple myeloma', 'disseminated intravascular coagulation',
  // Neurology
  'multiple sclerosis', "parkinson's disease", "alzheimer's disease", 'epilepsy', 'meningitis',
  'stroke', 'seizure', 'migraine', 'encephalitis', 'neuropathy', 'guillain-barré syndrome',
  'myasthenia gravis',
  // Infectious
  'sepsis', 'malaria', 'hepatitis b virus', 'influenza', 'measles', 'tetanus', 'cellulitis',
  'abscess', 'bacteremia', 'septic shock',
  // Rheumatology / MSK
  'rheumatoid arthritis', 'osteoarthritis', 'systemic lupus erythematosus', 'gout',
  'osteoporosis', 'fracture', 'osteomyelitis',
  // Pharmacology
  'beta blocker', 'ace inhibitor', 'nsaid', 'corticosteroid', 'pharmacokinetics',
  'pharmacodynamics', 'half-life', 'agonist', 'antagonist', 'bioavailability',
  'calcium channel blocker', 'diuretic', 'loop diuretic', 'thiazide diuretic',
  'anticoagulant', 'antiplatelet', 'thrombolytic', 'antiarrhythmic', 'antihistamine',
  'antibiotic', 'antiviral', 'antifungal', 'antiparasitic', 'analgesic', 'opioid',
  'local anesthetic', 'general anesthetic', 'sedative', 'antidepressant', 'antipsychotic',
  'anxiolytic', 'anticonvulsant', 'bronchodilator', 'antiemetic', 'laxative',
  'proton pump inhibitor', 'h2 receptor antagonist', 'statin', 'insulin therapy',
  'vaccine', 'immunosuppressant', 'chemotherapy', 'first-pass metabolism', 'therapeutic index',
  // Histology
  'columnar epithelium', 'squamous epithelium', 'cuboidal epithelium', 'basement membrane',
  'goblet cell', 'ciliated epithelium', 'stratified epithelium', 'simple epithelium',
  'adipose tissue', 'areolar tissue', 'hyaline cartilage', 'elastic cartilage',
  'fibrocartilage', 'compact bone', 'spongy bone', 'osteon', 'osteocyte', 'osteoblast',
  'osteoclast', 'chondrocyte', 'fibroblast', 'macrophage', 'mast cell', 'plasma cell',
  'schwann cell', 'astrocyte', 'oligodendrocyte', 'microglia', 'purkinje cell',
  'langerhans cell', 'merkel cell', 'kupffer cell', 'mesangial cell', 'podocyte',
  'glomerulus', 'bowman\'s capsule', 'nephron', 'loop of henle', 'collecting duct',
  'alveolus', 'alveoli', 'bronchiole', 'villus', 'microvilli', 'crypts of lieberkühn',
  'islets of langerhans', 'hepatocyte', 'sinusoid', 'lobule', 'acinus',
  // Microbiology
  'gram-positive bacteria', 'gram-negative bacteria', 'bacteriophage', 'endotoxin',
  'exotoxin', 'biofilm', 'pathogen', 'commensal', 'staphylococcus aureus',
  'streptococcus pneumoniae', 'escherichia coli', 'mycobacterium tuberculosis',
  'helicobacter pylori', 'candida albicans', 'plasmodium falciparum', 'hiv',
  'sars-cov-2', 'herpes simplex virus', 'epstein-barr virus', 'cytomegalovirus',
  'antigen', 'antibody', 'innate immunity', 'adaptive immunity', 'complement system',
  'cytokine', 'interleukin', 'major histocompatibility complex', 'autoimmunity',
  'hypersensitivity reaction', 'vaccination', 'opsonization', 'phagocytosis',
  // Biochemistry
  'glycolysis', 'gluconeogenesis', 'krebs cycle', 'citric acid cycle', 'electron transport chain',
  'oxidative phosphorylation', 'beta oxidation', 'glycogenolysis', 'glycogenesis',
  'urea cycle', 'amino acid metabolism', 'lipid metabolism', 'enzyme kinetics',
  'competitive inhibition', 'allosteric regulation', 'atp synthase', 'mitochondria',
  'ribosome', 'endoplasmic reticulum', 'golgi apparatus', 'lysosome', 'peroxisome',
  'dna replication', 'transcription', 'translation', 'messenger rna', 'point mutation',
  'genetic mutation', 'codon', 'gene expression', 'chromosome', 'karyotype',
  // More diseases
  'down syndrome', 'turner syndrome', 'klinefelter syndrome', 'cystic fibrosis',
  'marfan syndrome', 'huntington disease', 'duchenne muscular dystrophy',
  'wilson disease', 'hemochromatosis', 'phenylketonuria', 'von willebrand disease',
  'graves disease', 'hashimoto thyroiditis', 'sjögren syndrome', 'scleroderma',
  'psoriasis', 'eczema', 'vitiligo', 'urticaria', 'anaphylaxis',
  'otitis media', 'sinusitis', 'pharyngitis', 'laryngitis', 'conjunctivitis',
  'glaucoma', 'cataract', 'retinal detachment', 'macular degeneration',
  'benign prostatic hyperplasia', 'prostate cancer', 'breast cancer', 'cervical cancer',
  'ovarian cancer', 'endometriosis', 'polycystic ovary syndrome', 'preeclampsia',
  'ectopic pregnancy', 'placenta previa', 'gestational diabetes',
  // Anatomy (more)
  'femur', 'tibia', 'fibula', 'humerus', 'radius', 'ulna', 'clavicle', 'scapula',
  'pelvis', 'sternum', 'vertebra', 'intervertebral disc', 'spinal cord', 'gray matter',
  'white matter', 'dura mater', 'arachnoid mater', 'pia mater', 'ventricle',
  'atrium', 'mitral valve', 'tricuspid valve', 'aortic valve', 'pulmonary valve',
  'coronary artery', 'aorta', 'vena cava', 'carotid artery', 'jugular vein',
  'portal vein', 'hepatic artery', 'renal artery', 'pulmonary artery', 'capillary',
  'lymph node', 'spleen', 'thymus', 'tonsil', 'bone marrow', 'trachea', 'larynx',
  'pharynx', 'epiglottis', 'diaphragm', 'pleura', 'esophagus', 'stomach', 'duodenum',
  'jejunum', 'ileum', 'cecum', 'colon', 'rectum', 'anal canal', 'liver', 'gallbladder',
  'pancreas', 'kidney', 'ureter', 'bladder', 'urethra', 'testis', 'epididymis',
  'vas deferens', 'prostate gland', 'ovary', 'fallopian tube', 'uterus', 'cervix',
  'vagina', 'placenta', 'umbilical cord', 'thyroid gland', 'parathyroid gland',
  'adrenal gland', 'pituitary gland', 'pineal gland', 'lacrimal gland', 'salivary gland',
  'parotid gland', 'retina', 'cornea', 'iris', 'lens', 'sclera', 'cochlea',
  'tympanic membrane', 'vestibular system', 'olfactory bulb', 'taste bud',
  // Pathology (more)
  'pyknosis', 'karyorrhexis', 'karyolysis', 'caseous necrosis', 'coagulative necrosis',
  'liquefactive necrosis', 'fat necrosis', 'gangrenous necrosis', 'fibrinoid necrosis',
  'dystrophic calcification', 'metastatic calcification', 'amyloidosis', 'hyalinization',
  'chronic inflammation', 'acute inflammation', 'exudate', 'transudate', 'pus',
  'abscess formation', 'organization', 'resolution', 'regeneration', 'scar formation',
  'keloid', 'leukoplakia', 'erythroplakia', 'hamartoma', 'teratoma', 'adenoma',
  'papilloma', 'lipoma', 'fibroma', 'hemangioma', 'angiosarcoma', 'osteosarcoma',
  'chondrosarcoma', 'liposarcoma', 'rhabdomyosarcoma', 'squamous cell carcinoma',
  'basal cell carcinoma', 'adenocarcinoma', 'transitional cell carcinoma',
  'tumor grading', 'tumor staging', 'tnm staging', 'paraneoplastic syndrome',
  'oncogene', 'tumor suppressor gene', 'angiogenesis', 'invasion',
  // Histology (more)
  'transitional epithelium', 'pseudostratified epithelium', 'desmosome', 'tight junction',
  'gap junction', 'hemidesmosome', 'reticular fiber', 'collagen fiber', 'elastic fiber',
  'tendon', 'ligament', 'periosteum', 'endosteum', 'haversian canal', 'lamellae',
  'lacuna', 'canaliculi', 'epiphyseal plate', 'growth plate', 'red bone marrow',
  'yellow bone marrow', 'spermatogenesis', 'oogenesis', 'corpus luteum', 'graafian follicle',
  'zona pellucida', 'sertoli cell', 'leydig cell', 'meissner corpuscle', 'pacinian corpuscle',
  'taste bud cell', 'olfactory receptor cell', 'rod cell', 'cone cell', 'photoreceptor',
  'pyramidal cell', 'glial cell', 'ependymal cell', 'satellite cell', 'pneumocyte',
  'type i pneumocyte', 'type ii pneumocyte', 'surfactant', 'parietal cell', 'chief cell',
  'g cell', 'paneth cell', 'enterochromaffin cell', 'brunner gland', 'crypt of lieberkühn',
  // Microbiology (more)
  'spore formation', 'bacterial capsule', 'flagella', 'pili', 'plasmid', 'transduction',
  'transformation', 'conjugation', 'antibiotic resistance', 'beta-lactamase',
  'neisseria gonorrhoeae', 'neisseria meningitidis', 'salmonella typhi', 'shigella',
  'vibrio cholerae', 'clostridium difficile', 'clostridium botulinum', 'clostridium perfringens',
  'listeria monocytogenes', 'haemophilus influenzae', 'klebsiella pneumoniae',
  'pseudomonas aeruginosa', 'treponema pallidum', 'chlamydia trachomatis',
  'mycoplasma pneumoniae', 'legionella pneumophila', 'bordetella pertussis',
  'corynebacterium diphtheriae', 'aspergillus', 'cryptococcus neoformans',
  'pneumocystis jirovecii', 'giardia lamblia', 'entamoeba histolytica',
  'toxoplasma gondii', 'trichomonas vaginalis', 'schistosoma', 'taenia solium',
  'hepatitis a virus', 'hepatitis c virus', 'varicella-zoster virus', 'rotavirus',
  'rabies virus', 'poliovirus', 'human papillomavirus', 'mumps virus', 'rubella virus',
  // Biochemistry (more)
  'cori cycle', 'pentose phosphate pathway', 'fatty acid synthesis', 'ketogenesis',
  'cholesterol synthesis', 'bile acid synthesis', 'heme synthesis', 'porphyria',
  'purine metabolism', 'pyrimidine metabolism', 'gout pathophysiology', 'lactate dehydrogenase',
  'creatine kinase', 'alanine aminotransferase', 'aspartate aminotransferase',
  'alkaline phosphatase', 'amylase', 'lipase', 'trypsin', 'pepsin', 'chymotrypsin',
  'hemoglobin structure', 'myoglobin', 'collagen synthesis', 'elastin', 'keratin',
  'actin', 'myosin', 'tropomyosin', 'troponin', 'cytoskeleton', 'microtubule',
  'microfilament', 'intermediate filament', 'cell cycle', 'mitosis', 'meiosis',
  'apoptosis pathway', 'cell signaling', 'g protein-coupled receptor', 'tyrosine kinase receptor',
  // Pharmacology (more)
  'penicillin', 'cephalosporin', 'macrolide', 'tetracycline', 'aminoglycoside',
  'fluoroquinolone', 'sulfonamide', 'vancomycin', 'metronidazole', 'rifampin',
  'isoniazid', 'ethambutol', 'pyrazinamide', 'acyclovir', 'oseltamivir',
  'fluconazole', 'amphotericin b', 'warfarin', 'heparin', 'aspirin', 'clopidogrel',
  'metformin', 'sulfonylurea', 'thiazolidinedione', 'glp-1 agonist', 'sglt2 inhibitor',
  'levothyroxine', 'methimazole', 'propylthiouracil', 'prednisone', 'hydrocortisone',
  'morphine', 'fentanyl', 'tramadol', 'acetaminophen', 'ibuprofen', 'diclofenac',
  'lidocaine', 'bupivacaine', 'propofol', 'ketamine', 'midazolam', 'diazepam',
  'phenytoin', 'carbamazepine', 'valproate', 'lamotrigine', 'levetiracetam',
  'fluoxetine', 'sertraline', 'haloperidol', 'risperidone', 'lithium',
  'albuterol', 'salmeterol', 'ipratropium', 'theophylline', 'montelukast',
  'omeprazole', 'ranitidine', 'metoclopramide', 'ondansetron', 'loperamide',
  'furosemide', 'spironolactone', 'hydrochlorothiazide', 'amlodipine', 'metoprolol',
  'atenolol', 'propranolol', 'lisinopril', 'losartan', 'atorvastatin', 'digoxin',
  // Common clinical abbreviations (standard, widely-used shorthand — not a
  // reproduction of any single proprietary glossary/dataset)
  'chf', 'copd', 'ckd', 'aki', 'uti', 'dvt', 'gerd', 'ibd', 'ibs',
  'sle', 'dka', 'cva', 'tia', 'als', 'gbs', 'cad', 'htn', 'afib', 'cabg', 'pci',
  'cxr', 'ecg', 'ekg', 'cbc', 'bmp', 'cmp', 'abg', 'lft', 'ptt', 'inr', 'esr',
  'crp', 'bun', 'gfr', 'hba1c', 'ldl', 'hdl', 'tsh', 'fsh', 'acth', 'adh', 'pth',
  'hcg', 'psa', 'ana', 'rbc', 'wbc', 'hgb', 'hct', 'plt', 'ssri', 'snri', 'ppi',
  'cns', 'msk', 'rom', 'dnr', 'icu',
]

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sortedTerms = [...MEDICAL_TERMS].sort((a, b) => b.length - a.length)

export const MEDICAL_TERMS_REGEX = new RegExp(
  `\\b(${sortedTerms.map(escapeRegExp).join('|')})\\b`,
  'gi'
)

export const ambossSearchUrl = (term: string) =>
  `https://www.amboss.com/us/knowledge?q=${encodeURIComponent(term)}`
