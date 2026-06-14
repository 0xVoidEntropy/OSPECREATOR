import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface ExtractedQ {
  station_number: number
  question_text: string
  answer: string
  hint: string
  difficulty: string
  tags: string[]
}

function parseExamQuestions(pages: { page_number: number; text_content: string }[]): ExtractedQ[] {
  const results: ExtractedQ[] = []
  const fullText = pages.map(p => p.text_content).join('\n\n')

  // Normalize whitespace
  const lines = fullText
    .split(/\s{3,}|\n/)
    .map(l => l.trim())
    .filter(l => l.length > 2)

  // Try to detect station-based exam format
  const stationPattern = /^station\s*(\d+)/i
  const questionPattern = /^(\d+)[.)]\s+.{10,}/
  const questionMarkPattern = /.+\?$/

  let currentStation = 0
  let stationTitle = ''
  let currentQuestions: string[] = []
  let currentContext: string[] = []

  const flush = () => {
    if (currentQuestions.length === 0 || currentContext.length === 0) return

    const questionText = stationTitle
      ? `${stationTitle}\n${currentQuestions.join('\n')}`
      : currentQuestions.join('\n')

    const answer = currentContext.join('\n')
    const hint = currentContext.slice(0, 2).join(' | ').slice(0, 250)

    // Estimate difficulty from question count and keywords
    const hard = /pathognomonic|mechanism|compare|distinguish|classify|enumerate/i.test(questionText)
    const easy = currentQuestions.length === 1 && questionText.length < 100

    results.push({
      station_number: currentStation || (100 + results.length),
      question_text: questionText.slice(0, 1000),
      answer: answer.slice(0, 2000),
      hint,
      difficulty: hard ? 'hard' : easy ? 'easy' : 'medium',
      tags: extractTags(questionText + ' ' + answer),
    })
  }

  for (const line of lines) {
    const stationMatch = line.match(stationPattern)
    if (stationMatch) {
      flush()
      currentStation = parseInt(stationMatch[1])
      stationTitle = line
      currentQuestions = []
      currentContext = []
      continue
    }

    const isQuestion = questionPattern.test(line) || questionMarkPattern.test(line)

    if (isQuestion) {
      currentQuestions.push(line)
    } else if (currentQuestions.length > 0) {
      // Lines after questions = answer/context
      currentContext.push(line)
    } else {
      // Lines before questions = context/stem
      currentContext.push(line)
    }
  }
  flush()

  // If station-based parsing found nothing, fall back to topic-based grouping
  if (results.length === 0) {
    return topicBasedExtraction(pages)
  }

  return results.slice(0, 30)
}

function topicBasedExtraction(pages: { page_number: number; text_content: string }[]): ExtractedQ[] {
  const results: ExtractedQ[] = []
  const usedTopics = new Set<string>()

  for (const page of pages) {
    const text = page.text_content.trim()
    if (text.length < 30) continue

    const lines = text.split(/\s{2,}|\n/).map(l => l.trim()).filter(l => l.length > 3)
    if (lines.length < 3) continue

    const title = lines[0]
    const key = title.toLowerCase().slice(0, 35)
    if (usedTopics.has(key)) continue
    usedTopics.add(key)

    // Only create a question if we have meaningful content
    const contentLines = lines.slice(1).filter(l => l.length > 8)
    if (contentLines.length < 2) continue

    // Look for any actual question marks in content
    const realQuestions = contentLines.filter(l => l.endsWith('?'))
    const facts = contentLines.filter(l => !l.endsWith('?'))

    let questionText: string
    if (realQuestions.length > 0) {
      questionText = `${title}\n${realQuestions.join('\n')}`
    } else {
      // Build a contextual question from the title topic
      questionText = buildQuestionFromTitle(title, contentLines)
    }

    if (!questionText) continue

    results.push({
      station_number: 100 + results.length,
      question_text: questionText.slice(0, 800),
      answer: facts.slice(0, 10).join('\n').slice(0, 1500),
      hint: facts.slice(0, 2).join(' | ').slice(0, 250),
      difficulty: inferDifficulty(title, contentLines),
      tags: extractTags(title + ' ' + contentLines.slice(0, 4).join(' ')),
    })

    if (results.length >= 20) break
  }

  return results
}

function buildQuestionFromTitle(title: string, content: string[]): string {
  const t = title.toLowerCase()

  if (/kidney|glomerul|nephropat|renal/i.test(t))
    return `${title}\n1. Identify the renal pathology shown in this slide.\n2. Describe the key microscopic features.\n3. What is the diagnosis and its clinical significance?`
  if (/pancrea|islet|insulin/i.test(t))
    return `${title}\n1. Identify the tissue shown.\n2. Describe the pathological changes present.\n3. Distinguish between Type I and Type II changes.`
  if (/retina|retinopathy/i.test(t))
    return `${title}\n1. Name the two types of diabetic retinopathy.\n2. List four features of non-proliferative type.\n3. What mediates neovascularization?`
  if (/pannus|synovit|joint|arthr/i.test(t))
    return `${title}\n1. Identify the pathological process.\n2. Name the cells involved in pannus formation.\n3. What is the end result of untreated disease?`
  if (/nodule|rheumatoid nodule/i.test(t))
    return `${title}\n1. Describe the histological structure of this lesion.\n2. Where is it most commonly found clinically?\n3. What are the palisading cells?`
  if (/pneumonia|lung|alveol/i.test(t))
    return `${title}\n1. Identify the type of pneumonia shown.\n2. Describe the histological features.\n3. Name the causative organisms.`
  if (/stain|h&e|pas|congo/i.test(t))
    return `${title}\n1. Name the stain used and what it demonstrates.\n2. Identify the structure/pathology shown.\n3. Describe the characteristic morphological features.`
  if (/stage|hepatization|congestion/i.test(t))
    return `${title}\n1. Name and sequence the stages of lobar pneumonia.\n2. Describe what is seen in this stage.\n3. What cells predominate at this stage?`

  // Generic fallback
  return `${title}\n1. Identify the specimen or structure shown in this slide.\n2. Describe the morphological features seen.\n3. What is the diagnosis and associated condition?`
}

function inferDifficulty(title: string, content: string[]): 'easy' | 'medium' | 'hard' {
  const combined = (title + ' ' + content.join(' ')).toLowerCase()
  if (/pathognomonic|mechanism|pathogenesis|distinguish|classify|compare/i.test(combined)) return 'hard'
  if (/identify|name|list|what is/i.test(combined) && content.length < 4) return 'easy'
  return 'medium'
}

function extractTags(text: string): string[] {
  const medical = [
    'kidney', 'nephropathy', 'glomerulus', 'diabetes', 'pancreas', 'retina',
    'pneumonia', 'lung', 'alveoli', 'rheumatoid', 'arthritis', 'synovium',
    'pannus', 'nodule', 'fibrosis', 'necrosis', 'stain', 'PAS', 'Congo',
    'amyloid', 'hepatization', 'consolidation', 'interstitial', 'Kimmelstiel',
    'membranous', 'MPGN', 'vasculitis', 'histology', 'pathology',
  ]
  const t = text.toLowerCase()
  return medical.filter(tag => t.includes(tag.toLowerCase())).slice(0, 6)
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
    .select('page_number, text_content')
    .eq('lecture_id', lectureId)
    .order('page_number')

  if (pagesErr || !pages?.length) {
    return NextResponse.json({ error: 'No pages found for this lecture' }, { status: 404 })
  }

  const extracted = parseExamQuestions(pages)

  if (!extracted.length) {
    return NextResponse.json({ error: 'Could not extract questions — slides may have minimal text' }, { status: 400 })
  }

  const toInsert = extracted.map(q => ({ ...q, subject_id: subjectId }))
  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length })
}
