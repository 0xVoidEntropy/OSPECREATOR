import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Rule-based question extractor — no AI API needed
function extractQuestionsFromSlides(pages: { page_number: number; text_content: string }[], subjectName: string) {
  const questions: Array<{
    station_number: number
    question_text: string
    answer: string
    hint: string
    difficulty: string
    tags: string[]
  }> = []

  // Group slides by topic: a new topic starts when a slide has a short title line
  const groups: Array<{ title: string; bullets: string[]; pageNums: number[] }> = []
  let currentGroup: { title: string; bullets: string[]; pageNums: number[] } | null = null

  for (const page of pages) {
    const text = page.text_content.trim()
    if (!text || text.length < 10) continue

    const lines = text
      .split(/\s{2,}|\n/)
      .map(l => l.trim())
      .filter(l => l.length > 3)

    if (lines.length === 0) continue

    const firstLine = lines[0]

    // Detect title slide: short first line (< 60 chars), few other lines, or contains "lab", "objective", "introduction"
    const looksLikeTitle =
      (firstLine.length < 60 && lines.length <= 4) ||
      /^(lab |lecture |topic |chapter |introduction|objectives|outline|content|overview|case )/i.test(firstLine)

    if (looksLikeTitle && firstLine.length < 80) {
      if (currentGroup && currentGroup.bullets.length > 0) {
        groups.push(currentGroup)
      }
      currentGroup = { title: firstLine, bullets: lines.slice(1), pageNums: [page.page_number] }
    } else {
      if (!currentGroup) {
        currentGroup = { title: lines[0], bullets: [], pageNums: [] }
      }
      currentGroup.bullets.push(...lines)
      currentGroup.pageNums.push(page.page_number)
    }
  }
  if (currentGroup && currentGroup.bullets.length > 0) {
    groups.push(currentGroup)
  }

  // For each group with enough content, generate a question
  let stationNum = 100
  const usedTitles = new Set<string>()

  for (const group of groups) {
    const title = group.title
    const bullets = group.bullets.filter(b => b.length > 5)
    if (bullets.length < 2) continue
    const titleKey = title.toLowerCase().replace(/\s+/g, ' ').slice(0, 40)
    if (usedTitles.has(titleKey)) continue
    usedTitles.add(titleKey)

    // Determine question type from title keywords
    const t = title.toLowerCase()
    const tags: string[] = []

    // Extract tags from title words
    title.split(/\s+/).filter(w => w.length > 3).forEach(w => tags.push(w.toLowerCase()))

    // Build question text based on topic type
    let questionText = ''
    let difficulty: 'easy' | 'medium' | 'hard' = 'medium'

    if (/stain|h&e|pas|congo|silver|masson|giemsa/i.test(t)) {
      questionText = `Station — ${title}\nA histological slide is shown.\n1. What stain is used?\n2. Identify the structure/specimen.\n3. Describe the morphological features visible.\n4. What is the diagnosis?`
      difficulty = 'hard'
      tags.push('histology', 'stain')
    } else if (/nephropathy|kidney|glomerul|renal/i.test(t)) {
      questionText = `Station — ${title}\n1. Identify the renal pathology shown.\n2. Describe the microscopic features.\n3. What is the clinical significance?\n4. Name the associated condition.`
      difficulty = 'hard'
      tags.push('kidney', 'nephropathy')
    } else if (/pannus|synovit|joint|arthrit/i.test(t)) {
      questionText = `Station — ${title}\n1. Identify the pathological process shown.\n2. What cells are involved?\n3. Describe the progression of this condition.\n4. What complication can result?`
      difficulty = 'hard'
      tags.push('joint', 'inflammation')
    } else if (/pneumonia|lung|alveol|consolidat/i.test(t)) {
      questionText = `Station — ${title}\n1. Identify the pulmonary pathology.\n2. Describe the histological features.\n3. What stage/type is shown?\n4. Name causative organisms.`
      difficulty = 'medium'
      tags.push('lung', 'pneumonia')
    } else if (/nodule|granuloma|necrosis/i.test(t)) {
      questionText = `Station — ${title}\n1. Identify the lesion shown.\n2. Describe its histological composition.\n3. Where is it commonly found clinically?\n4. What cells are palisading around the center?`
      difficulty = 'medium'
      tags.push('nodule', 'histology')
    } else if (/retina|eye|vessel|vascular/i.test(t)) {
      questionText = `Station — ${title}\n1. Identify the structure shown.\n2. Describe the pathological changes visible.\n3. What underlying disease causes this?\n4. Name two complications.`
      difficulty = 'medium'
      tags.push('vascular', 'retina')
    } else if (/islet|pancrea|insulin|diabet/i.test(t)) {
      questionText = `Station — ${title}\n1. Identify this tissue/organ section.\n2. Describe the changes present.\n3. Distinguish Type I from Type II changes here.\n4. What stain confirms amyloid deposition?`
      difficulty = 'hard'
      tags.push('pancreas', 'diabetes')
    } else {
      questionText = `Station — ${title}\n1. Identify the specimen/structure shown.\n2. Describe the morphological features.\n3. What pathological process is demonstrated?\n4. Name the associated disease or condition.`
      difficulty = 'medium'
    }

    // Build answer from bullet points
    const answerLines = bullets.slice(0, 12).map((b, i) => `${i + 1 <= 4 ? `${i + 1}.` : '•'} ${b}`)
    const answer = answerLines.join('\n')

    // Build hint from first 2-3 key bullets
    const hint = bullets.slice(0, 3).join(' | ')

    questions.push({
      station_number: stationNum++,
      question_text: questionText,
      answer,
      hint: hint.slice(0, 300),
      difficulty,
      tags: [...new Set(tags)].slice(0, 6),
    })

    if (questions.length >= 15) break
  }

  return questions
}

export async function POST(request: Request) {
  const { lectureId, subjectId } = await request.json()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })

  if (!lectureId || !subjectId) {
    return NextResponse.json({ error: 'Missing lectureId or subjectId' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: pages, error: pagesErr } = await admin
    .from('lecture_pages')
    .select('page_number, text_content')
    .eq('lecture_id', lectureId)
    .order('page_number')

  if (pagesErr || !pages || pages.length === 0) {
    return NextResponse.json({ error: 'No pages found for this lecture' }, { status: 404 })
  }

  const { data: subject } = await admin
    .from('subjects')
    .select('name')
    .eq('id', subjectId)
    .single()

  const extracted = extractQuestionsFromSlides(pages, subject?.name || 'Medicine')

  if (extracted.length === 0) {
    return NextResponse.json({ error: 'Could not extract questions — slides may have minimal text content' }, { status: 400 })
  }

  const toInsert = extracted.map(q => ({ ...q, subject_id: subjectId }))
  const { error: insertErr } = await admin.from('questions').insert(toInsert)

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: toInsert.length,
    questions: toInsert.map(q => q.question_text.split('\n')[0]),
  })
}
