import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface PageData {
  page_number: number
  text_content: string
  image_url: string
}

export async function POST(request: Request) {
  const { lectureId, subjectId } = await request.json()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey = process.env.GOOGLE_AI_API_KEY

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

  const { data: subject } = await admin
    .from('subjects').select('name').eq('id', subjectId).single()
  const subjectName = subject?.name || 'Medicine'

  const toInsert: Array<Record<string, unknown>> = []

  // Filter to slides that have actual text content worth processing
  const contentPages = (pages as PageData[]).filter(p => {
    const text = p.text_content?.trim() || ''
    return text.length > 30 && p.image_url
  })

  if (contentPages.length === 0) {
    return NextResponse.json({ error: 'No content slides found' }, { status: 400 })
  }

  if (geminiKey) {
    // === AI PATH: Use Gemini Flash (free tier) ===
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    for (const page of contentPages) {
      const text = page.text_content.trim()

      const prompt = `You are a medical OSPE examiner. I have a ${subjectName} lecture slide with this text content:

---
${text.slice(0, 1500)}
---

Generate ONE OSPE exam station question from this slide. The question should:
- Be practical (what the student sees on a microscope/specimen/image)
- Have 3-4 numbered sub-questions
- Include a model answer
- Include a short hint/mnemonic

Reply ONLY with this JSON (no markdown, no code blocks):
{"question":"<multi-line question text with numbered parts>","answer":"<detailed model answer>","hint":"<one concise exam tip or mnemonic>","difficulty":"easy|medium|hard","tags":["<word>","<word>"]}

If this slide has no useful clinical content (just a title, table of contents, references), reply with: {"skip":true}`

      try {
        const result = await model.generateContent(prompt)
        const raw = result.response.text().trim()

        if (raw.includes('"skip":true')) continue

        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) continue

        const parsed = JSON.parse(jsonMatch[0])
        if (!parsed.question || !parsed.answer) continue

        toInsert.push({
          subject_id: subjectId,
          station_number: 100 + toInsert.length,
          question_text: parsed.question.slice(0, 1000),
          answer: parsed.answer.slice(0, 2000),
          hint: (parsed.hint || '').slice(0, 300),
          difficulty: ['easy', 'medium', 'hard'].includes(parsed.difficulty) ? parsed.difficulty : 'medium',
          tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
          image_url: page.image_url,
        })
      } catch {
        // Skip failed slide, continue with others
      }

      // Small delay to respect free tier rate limits (15 RPM)
      await new Promise(r => setTimeout(r, 200))
    }
  } else {
    // === FALLBACK: Rule-based extraction (no API key needed) ===
    const usedTitles = new Set<string>()

    for (const page of contentPages) {
      const lines = page.text_content.trim()
        .split(/\s{2,}|\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 3)
      if (lines.length < 2) continue

      const title = lines[0]
      const key = title.toLowerCase().slice(0, 35)
      if (usedTitles.has(key)) continue
      usedTitles.add(key)

      const content = lines.slice(1).filter((l: string) => l.length > 8)
      if (content.length < 1) continue

      const questionText = buildFallbackQuestion(title)
      const answer = content.slice(0, 12).join('\n')
      const hint = content.slice(0, 2).join(' | ').slice(0, 250)

      toInsert.push({
        subject_id: subjectId,
        station_number: 100 + toInsert.length,
        question_text: questionText,
        answer: answer.slice(0, 2000),
        hint,
        difficulty: 'medium',
        tags: extractTags(title + ' ' + content.join(' ')),
        image_url: page.image_url,
      })

      if (toInsert.length >= 20) break
    }
  }

  if (!toInsert.length) {
    return NextResponse.json({ error: 'Could not generate questions from slide content' }, { status: 400 })
  }

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length })
}

function buildFallbackQuestion(title: string): string {
  const t = title.toLowerCase()
  if (/kidney|nephropat|glomerul/i.test(t)) return `${title}\n1. Identify the renal pathology shown.\n2. Describe the histological features.\n3. What is the diagnosis and underlying condition?`
  if (/pancrea|islet/i.test(t)) return `${title}\n1. Identify the tissue shown.\n2. Describe pathological changes.\n3. Distinguish Type I from Type II DM changes.`
  if (/retina/i.test(t)) return `${title}\n1. Name the two types of diabetic retinopathy.\n2. List four features of the type shown.\n3. What drives neovascularization?`
  if (/pannus|synovit|joint/i.test(t)) return `${title}\n1. Identify the pathological process.\n2. Name three cell types involved.\n3. What is the end result?`
  if (/nodule/i.test(t)) return `${title}\n1. Describe the three-layer structure.\n2. Where is it most commonly found?\n3. Are these cells a granuloma?`
  if (/pneumonia|lung|alveol/i.test(t)) return `${title}\n1. Identify the type of pneumonia.\n2. Describe histological features.\n3. Name causative organisms.`
  return `${title}\n1. Identify the specimen/structure shown.\n2. Describe the morphological features.\n3. What is the diagnosis?`
}

function extractTags(text: string): string[] {
  const terms = ['kidney','nephropathy','diabetes','pancreas','retina','rheumatoid','pannus','nodule','pneumonia','lung','amyloid','PAS','Congo','histology']
  return terms.filter(tag => text.toLowerCase().includes(tag.toLowerCase())).slice(0, 5)
}
