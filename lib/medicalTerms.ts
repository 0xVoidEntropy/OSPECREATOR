// AMBOSS-style glossary: a local, self-authored set of high-yield medical term
// definitions (general medical knowledge, not copied from any external source).
// The hover card shows the definition directly; "Open in AMBOSS" is offered as a
// link-out for deeper reading, since we don't have rights to AMBOSS's own content.
export interface GlossaryEntry {
  category: string
  definition: string
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ---- Anatomy ----
  'peritoneum': { category: 'Anatomy', definition: 'A serous membrane lining the abdominopelvic cavity (parietal layer) and covering most abdominal organs (visceral layer), reducing friction between organs.' },
  'reflex arc': { category: 'Physiology', definition: 'The neural pathway of a reflex: receptor → afferent neuron → integration center → efferent neuron → effector.' },
  'brachial plexus': { category: 'Anatomy', definition: 'A network of nerves (C5-T1) supplying motor and sensory innervation to the upper limb.' },
  'sciatic nerve': { category: 'Anatomy', definition: 'The largest nerve in the body (L4-S3), supplying the posterior thigh, leg, and foot.' },
  'vagus nerve': { category: 'Anatomy', definition: 'Cranial nerve X; provides parasympathetic innervation to the heart, lungs, and most of the GI tract.' },
  'phrenic nerve': { category: 'Anatomy', definition: 'Arises from C3-C5; the sole motor supply to the diaphragm.' },
  'median nerve': { category: 'Anatomy', definition: 'A forearm/hand nerve commonly compressed in carpal tunnel syndrome.' },
  'cerebellum': { category: 'Anatomy', definition: 'Hindbrain structure coordinating balance, posture, and fine motor control.' },
  'hippocampus': { category: 'Anatomy', definition: 'Limbic structure essential for forming new long-term memories.' },
  'corpus callosum': { category: 'Anatomy', definition: 'The large white-matter tract connecting the two cerebral hemispheres.' },
  'sarcomere': { category: 'Histology', definition: 'The basic contractile unit of skeletal/cardiac muscle, between two Z-discs.' },
  'neuromuscular junction': { category: 'Physiology', definition: 'The synapse between a motor neuron and skeletal muscle fiber, using acetylcholine.' },
  'node of ranvier': { category: 'Histology', definition: 'Gaps in the myelin sheath that allow saltatory conduction of action potentials.' },

  // ---- Physiology ----
  'action potential': { category: 'Physiology', definition: 'A rapid, transient depolarization-repolarization of a cell membrane that propagates a nerve or muscle signal.' },
  'cardiac output': { category: 'Physiology', definition: 'Volume of blood the heart pumps per minute; stroke volume × heart rate.' },
  'ejection fraction': { category: 'Physiology', definition: 'The percentage of blood ejected from the left ventricle with each contraction; normal is roughly 55-70%.' },
  'glomerular filtration rate': { category: 'Physiology', definition: 'The volume of fluid filtered by the kidneys per minute; the standard measure of kidney function.' },
  'renin-angiotensin system': { category: 'Physiology', definition: 'A hormone cascade (renin → angiotensin I → angiotensin II) that raises blood pressure via vasoconstriction and aldosterone release.' },
  'aldosterone': { category: 'Physiology', definition: 'A mineralocorticoid hormone that promotes sodium retention and potassium excretion in the kidney.' },
  'antidiuretic hormone': { category: 'Physiology', definition: 'Also called vasopressin; promotes water reabsorption in the renal collecting ducts.' },
  'frank-starling mechanism': { category: 'Physiology', definition: 'The principle that increased ventricular filling (preload) increases the force of contraction.' },
  'oxygen-hemoglobin dissociation curve': { category: 'Physiology', definition: 'A sigmoid curve describing hemoglobin\'s oxygen affinity at varying partial pressures of oxygen.' },

  // ---- Pathology — general processes ----
  'apoptosis': { category: 'Pathology', definition: 'Programmed, energy-dependent cell death that does not provoke inflammation.' },
  'necrosis': { category: 'Pathology', definition: 'Uncontrolled cell death from injury, typically triggering an inflammatory response.' },
  'metaplasia': { category: 'Pathology', definition: 'A reversible change of one differentiated cell type into another, often adaptive.' },
  'dysplasia': { category: 'Pathology', definition: 'Disordered cellular growth and maturation; a precursor that may progress to neoplasia.' },
  'atherosclerosis': { category: 'Pathology', definition: 'Build-up of lipid plaques within arterial walls, narrowing the lumen and predisposing to ischemia.' },
  'thrombosis': { category: 'Pathology', definition: 'Formation of a blood clot within a vessel that can obstruct blood flow.' },
  'embolism': { category: 'Pathology', definition: 'Blockage of a blood vessel by material (clot, fat, air) that traveled from elsewhere in the circulation.' },
  'infarction': { category: 'Pathology', definition: 'Tissue death due to an inadequate blood supply.' },

  // ---- Diseases — cardiovascular ----
  'myocardial infarction': { category: 'Disease — Cardiovascular', definition: 'Death of heart muscle tissue due to prolonged ischemia, usually from coronary artery occlusion.' },
  'congestive heart failure': { category: 'Disease — Cardiovascular', definition: 'A clinical syndrome where the heart cannot pump enough blood to meet the body\'s needs, causing fluid backup and congestion.' },
  'atrial fibrillation': { category: 'Disease — Cardiovascular', definition: 'An irregular, often rapid heart rhythm originating in the atria, increasing stroke risk via clot formation.' },
  'endocarditis': { category: 'Disease — Cardiovascular', definition: 'Infection/inflammation of the endocardium, typically affecting heart valves.' },
  'myocarditis': { category: 'Disease — Cardiovascular', definition: 'Inflammation of the heart muscle, often viral in origin.' },
  'pericarditis': { category: 'Disease — Cardiovascular', definition: 'Inflammation of the pericardial sac, causing sharp chest pain that often improves leaning forward.' },
  'rheumatic fever': { category: 'Disease — Cardiovascular', definition: 'An autoimmune complication of untreated group A streptococcal pharyngitis, which can damage heart valves.' },
  'deep vein thrombosis': { category: 'Disease — Cardiovascular', definition: 'Clot formation in a deep vein, usually of the leg, with risk of embolizing to the lungs.' },
  'pulmonary embolism': { category: 'Disease — Cardiovascular', definition: 'Obstruction of a pulmonary artery, most often by a clot that traveled from a deep leg vein.' },
  'aneurysm': { category: 'Disease — Cardiovascular', definition: 'An abnormal, localized dilation of a blood vessel wall, with risk of rupture.' },
  'hypertension': { category: 'Disease — Cardiovascular', definition: 'Chronically elevated arterial blood pressure, a major risk factor for stroke, MI, and kidney disease.' },

  // ---- Diseases — respiratory ----
  'pneumonia': { category: 'Disease — Respiratory', definition: 'Infection and inflammation of the lung parenchyma/alveoli, usually bacterial or viral.' },
  'tuberculosis': { category: 'Disease — Infectious', definition: 'A chronic infection caused by Mycobacterium tuberculosis, classically affecting the lungs with caseating granulomas.' },
  'asthma': { category: 'Disease — Respiratory', definition: 'A chronic airway disease with reversible bronchoconstriction, inflammation, and hyperresponsiveness.' },
  'chronic obstructive pulmonary disease': { category: 'Disease — Respiratory', definition: 'A progressive disease (emphysema/chronic bronchitis) causing irreversible airflow limitation, usually from smoking.' },
  'bronchitis': { category: 'Disease — Respiratory', definition: 'Inflammation of the bronchial airways, presenting with cough and sputum production.' },

  // ---- Diseases — GI ----
  'peptic ulcer disease': { category: 'Disease — GI', definition: 'Mucosal erosion of the stomach or duodenum, commonly from H. pylori infection or NSAID use.' },
  'gastroesophageal reflux disease': { category: 'Disease — GI', definition: 'Retrograde flow of gastric contents into the esophagus causing heartburn and mucosal damage.' },
  'cirrhosis': { category: 'Disease — GI', definition: 'End-stage liver fibrosis with nodular regeneration, disrupting normal liver architecture and function.' },
  'pancreatitis': { category: 'Disease — GI', definition: 'Inflammation of the pancreas, commonly from gallstones or alcohol, causing severe epigastric pain.' },
  'appendicitis': { category: 'Disease — GI', definition: 'Inflammation of the vermiform appendix, classically presenting with periumbilical pain migrating to the right lower quadrant.' },
  'cholelithiasis': { category: 'Disease — GI', definition: 'Formation of gallstones within the gallbladder.' },
  'cholecystitis': { category: 'Disease — GI', definition: 'Inflammation of the gallbladder, usually due to obstruction by a gallstone.' },
  'crohn\'s disease': { category: 'Disease — GI', definition: 'A chronic inflammatory bowel disease that can affect any part of the GI tract in a discontinuous (skip-lesion) pattern.' },
  'ulcerative colitis': { category: 'Disease — GI', definition: 'A chronic inflammatory bowel disease limited to the colon, with continuous mucosal inflammation starting at the rectum.' },
  'celiac disease': { category: 'Disease — GI', definition: 'An autoimmune reaction to gluten causing small intestinal villous atrophy and malabsorption.' },
  'diverticulitis': { category: 'Disease — GI', definition: 'Inflammation or infection of diverticula (outpouchings) in the colon wall.' },

  // ---- Diseases — renal ----
  'nephrotic syndrome': { category: 'Disease — Renal', definition: 'A glomerular disorder causing heavy proteinuria, hypoalbuminemia, edema, and hyperlipidemia.' },
  'glomerulonephritis': { category: 'Disease — Renal', definition: 'Inflammation of the glomeruli, often immune-mediated, causing hematuria and impaired filtration.' },
  'urinary tract infection': { category: 'Disease — Renal', definition: 'Bacterial infection of the urinary tract, most commonly caused by Escherichia coli.' },

  // ---- Diseases — endocrine ----
  'diabetes mellitus': { category: 'Disease — Endocrine', definition: 'A metabolic disease of chronic hyperglycemia from insulin deficiency (type 1) or resistance (type 2).' },
  'diabetic ketoacidosis': { category: 'Disease — Endocrine', definition: 'An acute, life-threatening complication of diabetes with hyperglycemia, ketosis, and metabolic acidosis.' },
  'hyperthyroidism': { category: 'Disease — Endocrine', definition: 'Excess thyroid hormone production, causing weight loss, tachycardia, heat intolerance, and tremor.' },
  'hypothyroidism': { category: 'Disease — Endocrine', definition: 'Deficient thyroid hormone production, causing fatigue, weight gain, cold intolerance, and bradycardia.' },
  'cushing syndrome': { category: 'Disease — Endocrine', definition: 'A condition of excess cortisol, causing central obesity, moon facies, striae, and hyperglycemia.' },
  'addison\'s disease': { category: 'Disease — Endocrine', definition: 'Primary adrenal insufficiency, causing deficient cortisol and aldosterone production.' },
  'acromegaly': { category: 'Disease — Endocrine', definition: 'Excess growth hormone in adults, causing enlargement of the hands, feet, and facial features.' },

  // ---- Diseases — hematology/oncology ----
  'sickle cell anemia': { category: 'Disease — Hematology', definition: 'A hereditary hemoglobinopathy causing red cells to sickle under low oxygen, leading to hemolysis and vaso-occlusion.' },
  'hemophilia': { category: 'Disease — Hematology', definition: 'An inherited bleeding disorder from deficiency of a clotting factor (commonly factor VIII or IX).' },
  'leukemia': { category: 'Disease — Oncology', definition: 'A malignancy of blood-forming cells, leading to overproduction of abnormal white blood cells in the bone marrow and blood.' },
  'lymphoma': { category: 'Disease — Oncology', definition: 'A malignancy of lymphocytes, typically arising in lymph nodes or lymphoid tissue.' },

  // ---- Diseases — neurology ----
  'multiple sclerosis': { category: 'Disease — Neurology', definition: 'An autoimmune disease causing demyelination of the central nervous system, with relapsing-remitting neurologic deficits.' },
  'parkinson\'s disease': { category: 'Disease — Neurology', definition: 'A neurodegenerative disease from loss of dopaminergic neurons in the substantia nigra, causing tremor, rigidity, and bradykinesia.' },
  'alzheimer\'s disease': { category: 'Disease — Neurology', definition: 'The most common cause of dementia, marked by amyloid plaques, neurofibrillary tangles, and progressive cognitive decline.' },
  'epilepsy': { category: 'Disease — Neurology', definition: 'A chronic condition of recurrent, unprovoked seizures due to abnormal cortical electrical activity.' },
  'meningitis': { category: 'Disease — Infectious', definition: 'Inflammation of the meninges, usually from bacterial or viral infection, presenting with fever, headache, and neck stiffness.' },
  'stroke': { category: 'Disease — Neurology', definition: 'Acute neurological deficit from disrupted cerebral blood flow, either ischemic (clot) or hemorrhagic (bleed).' },

  // ---- Diseases — infectious ----
  'sepsis': { category: 'Disease — Infectious', definition: 'A life-threatening, dysregulated immune response to infection causing organ dysfunction.' },
  'malaria': { category: 'Disease — Infectious', definition: 'A mosquito-borne parasitic disease caused by Plasmodium species, causing cyclical fevers and hemolysis.' },
  'hepatitis b virus': { category: 'Disease — Infectious', definition: 'A bloodborne/sexually transmitted virus causing acute or chronic liver infection, with risk of cirrhosis and hepatocellular carcinoma.' },
  'influenza': { category: 'Disease — Infectious', definition: 'A contagious respiratory viral infection causing fever, myalgia, and cough, with seasonal epidemics.' },
  'measles': { category: 'Disease — Infectious', definition: 'A highly contagious paramyxovirus infection causing fever, cough, conjunctivitis, and a characteristic rash.' },
  'tetanus': { category: 'Disease — Infectious', definition: 'A toxin-mediated disease from Clostridium tetani causing severe muscle rigidity and spasms.' },

  // ---- Diseases — rheumatology / msk ----
  'rheumatoid arthritis': { category: 'Disease — Rheumatology', definition: 'A chronic autoimmune disease causing symmetric inflammatory polyarthritis, primarily of small joints.' },
  'osteoarthritis': { category: 'Disease — Rheumatology', definition: 'Degenerative joint disease from cartilage breakdown, causing pain and stiffness, typically in weight-bearing joints.' },
  'systemic lupus erythematosus': { category: 'Disease — Rheumatology', definition: 'A multisystem autoimmune disease producing autoantibodies that can affect skin, joints, kidneys, and other organs.' },

  // ---- Pharmacology ----
  'beta blocker': { category: 'Pharmacology', definition: 'A drug class that blocks beta-adrenergic receptors, reducing heart rate and contractility.' },
  'ace inhibitor': { category: 'Pharmacology', definition: 'A drug class that blocks angiotensin-converting enzyme, lowering blood pressure and reducing aldosterone.' },
  'nsaid': { category: 'Pharmacology', definition: 'Non-steroidal anti-inflammatory drug; inhibits cyclooxygenase (COX) to reduce pain, fever, and inflammation.' },
  'corticosteroid': { category: 'Pharmacology', definition: 'A class of steroid hormones/drugs with potent anti-inflammatory and immunosuppressive effects.' },
  'pharmacokinetics': { category: 'Pharmacology', definition: 'The study of how the body absorbs, distributes, metabolizes, and excretes a drug.' },
  'pharmacodynamics': { category: 'Pharmacology', definition: 'The study of a drug\'s biochemical and physiological effects on the body.' },
  'half-life': { category: 'Pharmacology', definition: 'The time required for a drug\'s plasma concentration to reduce by half.' },
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sortedTerms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length)

export const MEDICAL_TERMS_REGEX = new RegExp(
  `\\b(${sortedTerms.map(escapeRegExp).join('|')})\\b`,
  'gi'
)

export const ambossSearchUrl = (term: string) =>
  `https://www.amboss.com/us/knowledge?q=${encodeURIComponent(term)}`
