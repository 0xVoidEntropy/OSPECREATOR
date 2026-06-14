import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface PageData {
  page_number: number
  text_content: string
  image_url: string
}

// Skip slides that are just title/intro pages with no real content
function isContentSlide(lines: string[]): boolean {
  if (lines.length < 2) return false
  const joined = lines.join(' ').toLowerCase()
  // Skip pure title slides, objective slides, reference slides
  if (/^(objectives?|contents?|references?|outline|introduction|acknowledgement|thank you|the end)$/i.test(lines[0])) return false
  // Must have at least some medical content
  return joined.length > 40
}

function buildQuestion(title: string, contentLines: string[]): string {
  const t = title.toLowerCase()

  // If there are actual question sentences in content, use them
  const realQs = contentLines.filter(l => l.trim().endsWith('?') && l.length > 10)
  if (realQs.length >= 2) {
    return `${title}\n${realQs.join('\n')}`
  }

  // Build contextual OSPE questions based on topic
  if (/kimmelstiel|nodular|glomeruloscleros/i.test(t))
    return `${title}\n1. What type of glomerulosclerosis is shown?\n2. Describe the morphological features (stain, location, composition).\n3. Is this finding pathognomonic? For what condition?`
  if (/kidney|nephropat|glomerul|renal/i.test(t))
    return `${title}\n1. Identify the renal pathology shown.\n2. Describe the key histological features.\n3. What is the underlying condition causing this?`
  if (/diffuse.*scleros|mesangial/i.test(t))
    return `${title}\n1. Identify this type of diabetic nephropathy.\n2. How does it differ from the nodular type?\n3. Is it specific to diabetes?`
  if (/pancrea|islet/i.test(t))
    return `${title}\n1. Identify the tissue and pathological changes shown.\n2. Is this Type I or Type II DM? How can you tell?\n3. What stain is used to confirm amyloid? What is the characteristic finding?`
  if (/retina|retinopathy/i.test(t))
    return `${title}\n1. Identify the type of diabetic retinopathy shown.\n2. Name four features visible in this type.\n3. What factor drives neovascularization?`
  if (/pannus|synovit/i.test(t))
    return `${title}\n1. Identify the pathological process shown.\n2. Name three cell types forming the pannus.\n3. What structures does pannus destroy?`
  if (/rheumatoid.*nodule|nodule.*rheumatoid/i.test(t))
    return `${title}\n1. Describe the three-layer histological structure of this lesion.\n2. Where is it most commonly found clinically?\n3. Are these cells granuloma? Why or why not?`
  if (/rice.*bod|fibrin/i.test(t))
    return `${title}\n1. What are rice bodies and where do they form?\n2. What is their composition?\n3. In which joint disease are they most commonly found?`
  if (/ankylosis|fibrous/i.test(t))
    return `${title}\n1. Define fibrous ankylosis.\n2. What precedes it in the disease progression?\n3. What is the end-stage form called?`
  if (/membranous.*nephropathy|nephropathy.*membranous/i.test(t))
    return `${title}\n1. Describe the histological appearance on PAS stain.\n2. What does immunofluorescence show?\n3. What does electron microscopy reveal? What syndrome does it cause?`
  if (/tram.?track|mpgn/i.test(t))
    return `${title}\n1. What is the tram-track appearance and which stain shows it?\n2. What causes this appearance?\n3. What type of nephritis is this?`
  if (/amyloid/i.test(t))
    return `${title}\n1. What stain is used to identify amyloid?\n2. Describe the appearance under polarized light.\n3. In which DM type is amyloid (IAPP) deposited?`
  if (/congestion.*pneumonia|red.*hepatiz|grey.*hepatiz|resolut.*pneumonia/i.test(t))
    return `${title}\n1. Which stage of lobar pneumonia is shown?\n2. Describe what fills the alveoli at this stage.\n3. What is the next stage and how does it differ?`
  if (/lobar.*pneumonia|pneumonia.*lobar/i.test(t))
    return `${title}\n1. Name all four stages of lobar pneumonia in order.\n2. Describe the gross appearance at each stage.\n3. What organism causes 95% of cases?`
  if (/bronchopneumonia/i.test(t))
    return `${title}\n1. Compare lobar vs bronchopneumonia — age group, distribution, organisms.\n2. Why is bronchopneumonia typically bilateral and patchy?\n3. Which patient population is most at risk?`
  if (/interstitial|atypical.*pneumonia/i.test(t))
    return `${title}\n1. Describe the histological appearance of interstitial pneumonia.\n2. How does it differ from lobar and bronchopneumonia?\n3. Name three causative organisms.`
  if (/stain|h&e|pas|congo|silver/i.test(t))
    return `${title}\n1. Name this stain and what it demonstrates.\n2. Identify the pathology shown.\n3. Describe the characteristic morphological features.`

  // Generic OSPE-style question
  return `${title}\n1. Identify the specimen/structure shown.\n2. Describe the key morphological features visible.\n3. What is the diagnosis and what condition causes it?`
}

function buildAnswer(contentLines: string[]): string {
  // Filter out lines that look like slide navigation or metadata
  const filtered = contentLines.filter(l =>
    l.length > 5 &&
    !/^(slide|page|\d+\/\d+|next|prev|click)/i.test(l)
  )
  return filtered.slice(0, 14).join('\n')
}

function buildHint(title: string, contentLines: string[]): string {
  // Pick the most fact-dense lines for the hint
  const facts = contentLines
    .filter(l => l.length > 15 && !l.endsWith('?'))
    .slice(0, 3)
  return facts.join(' | ').slice(0, 280)
}

function inferDifficulty(title: string, content: string[]): 'easy' | 'medium' | 'hard' {
  const combined = (title + ' ' + content.join(' ')).toLowerCase()
  if (/pathognomonic|mechanism|pathogenesis|distinguish|classify|compare|enumerate/i.test(combined)) return 'hard'
  if (content.length <= 3 && title.length < 40) return 'easy'
  return 'medium'
}

function extractTags(text: string): string[] {
  const terms = [
    'kidney','nephropathy','glomerulus','diabetes','pancreas','retina','rheumatoid',
    'arthritis','synovium','pannus','nodule','fibrosis','necrosis','amyloid',
    'pneumonia','lung','alveoli','consolidation','interstitial','Kimmelstiel',
    'membranous','MPGN','PAS','Congo','histology','pathology','stain',
  ]
  const t = text.toLowerCase()
  return terms.filter(tag => t.includes(tag.toLowerCase())).slice(0, 5)
}

export async function POST(request: Request) {
  const { lectureId, subjectId } = await request.json()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  if (!lectureId || !subjectId) return NextResponse.json({ error: 'Missing lectureId or subjectId' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: pages, error: pagesErr } = await admin
    .from('lecture_pages')
    .select('page_number, text_content, image_url')
    .eq('lecture_id', lectureId)
    .order('page_number')

  if (pagesErr || !pages?.length) {
    return NextResponse.json({ error: 'No pages found for this lecture' }, { status: 404 })
  }

  const toInsert: Array<Record<string, unknown>> = []
  const usedTitles = new Set<string>()

  for (const page of pages as PageData[]) {
    const text = page.text_content?.trim() || ''
    if (text.length < 20) continue

    const lines = text
      .split(/\s{2,}|\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 3)

    if (!isContentSlide(lines)) continue

    const title = lines[0]
    const titleKey = title.toLowerCase().replace(/\s+/g, ' ').slice(0, 40)
    if (usedTitles.has(titleKey)) continue
    usedTitles.add(titleKey)

    const contentLines = lines.slice(1)
    if (contentLines.length < 1) continue

    const questionText = buildQuestion(title, contentLines)
    const answer = buildAnswer(contentLines)
    if (!answer) continue

    toInsert.push({
      subject_id: subjectId,
      station_number: 100 + toInsert.length,
      question_text: questionText.slice(0, 1000),
      answer: answer.slice(0, 2000),
      hint: buildHint(title, contentLines),
      difficulty: inferDifficulty(title, contentLines),
      tags: extractTags(title + ' ' + contentLines.join(' ')),
      image_url: page.image_url, // direct link — no fuzzy matching needed
    })

    if (toInsert.length >= 25) break
  }

  if (!toInsert.length) {
    return NextResponse.json({ error: 'Could not extract questions — slides may have minimal text' }, { status: 400 })
  }

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length })
}
