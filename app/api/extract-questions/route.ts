import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface PageData {
  page_number: number
  text_content: string
  image_url: string
}

const SKIP_TITLES = /^(college|university|department|faculty|objectives?|contents?|references?|outline|introduction|thank you|the end|ims |prepared by|presented by|virtual slides?|glass slides?|morphological changes|lab\b|laboratory|session \d|lecture \d|week \d|revision|summary|overview|agenda|schedule|timetable|learning outcomes?|at the end|by the end)/i

// Slides that are clearly non-specimen: all-text diagram slides, etc.
const SPECIMEN_KEYWORDS = /histol|pathol|specimen|micro|macro|gross|biopsy|stain|H&E|PAS|kidney|liver|lung|heart|brain|spleen|skin|bone|muscle|vessel|artery|vein|glomerul|nephro|hepat|pneumo|carcinom|adenom|sarcoma|lymphom|necrosis|fibrosis|inflam|edema|thrombus|infarct|nodule|granuloma|pannus|synovit|islet|pancrea|retina|alveol|tumor|tumour|cancer|lesion|cell|tissue|organ/i

export async function POST(request: Request): Promise<Response> {
  try {
    return await handler(request)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function handler(request: Request) {
  const { lectureId, subjectId, startIndex = 0, batchSize = 8 } = await request.json()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const geminiKey = process.env.GOOGLE_AI_API_KEY

  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  if (!lectureId || !subjectId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: pages } = await admin
    .from('lecture_pages')
    .select('page_number, text_content, image_url')
    .eq('lecture_id', lectureId)
    .order('page_number')

  if (!pages?.length) return NextResponse.json({ error: 'No pages found — re-upload the PDF first' }, { status: 404 })

  const { data: subject } = await admin.from('subjects').select('name').eq('id', subjectId).single()
  const subjectName = subject?.name || 'Medicine'

  const imagePages = (pages as PageData[]).filter(p => {
    if (!p.image_url) return false
    const firstLine = (p.text_content || '').trim().split(/\s{3,}|\n/)[0] || ''
    return !SKIP_TITLES.test(firstLine.trim())
  })

  if (!imagePages.length) return NextResponse.json({ error: 'No content slides found — try re-uploading the PDF' }, { status: 400 })

  const toInsert: Array<Record<string, unknown>> = []
  const slidesToProcess = imagePages.slice(startIndex, startIndex + batchSize)

  const aiKey = openRouterKey || geminiKey

  if (aiKey) {
    const useOpenRouter = !!openRouterKey
    const isGeminiOAuth = !useOpenRouter && (geminiKey?.startsWith('AQ.') || geminiKey?.startsWith('ya29.'))

    const prompt = (subjectName: string) =>
      `You are a medical OSPE examiner creating exam questions from ${subjectName} lecture slides.

Look at this slide image carefully.

If it is a title slide, objectives slide, table of contents, references, a diagram with no clinical specimen, or has nothing examinable — output exactly: SKIP

Otherwise output a JSON object (no markdown, no code block, just raw JSON):
{"question":"Station — [specific topic name]\\n1. [first clinical question]\\n2. [second question about features/morphology]\\n3. [third question about diagnosis/mechanism]","answer":"1. [full answer to question 1]\\n2. [full answer to question 2]\\n3. [full answer to question 3]","hint":"[one teaching point or mnemonic]","difficulty":"easy","tags":["pathology","kidney"]}

Rules:
- Replace difficulty with easy, medium, or hard
- Tags should be 2-5 relevant medical terms
- Answers must be specific and detailed, not generic
- Do not wrap in markdown or add any text before/after the JSON`

    for (const page of slidesToProcess) {
      try {
        const imgRes = await fetch(page.image_url)
        if (!imgRes.ok) continue
        const imgBuffer = await imgRes.arrayBuffer()
        // Buffer.from avoids stack overflow that btoa+spread causes on large images
        const base64 = Buffer.from(imgBuffer).toString('base64')
        const dataUrl = `data:image/jpeg;base64,${base64}`

        let raw = ''

        if (useOpenRouter) {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openRouterKey}`,
              'HTTP-Referer': 'https://ospecreator.vercel.app',
              'X-Title': 'OSPE Study Helper',
            },
            body: JSON.stringify({
              model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: prompt(subjectName) },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ]
              }],
              max_tokens: 600,
            })
          })
          if (!res.ok) continue
          const json = await res.json().catch(() => null)
          raw = json?.choices?.[0]?.message?.content || ''
        } else if (isGeminiOAuth) {
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt(subjectName) }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }] })
          })
          if (!res.ok) continue
          const json = await res.json().catch(() => null)
          raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        } else {
          const { GoogleGenerativeAI } = await import('@google/generative-ai')
          const model = new GoogleGenerativeAI(geminiKey!).getGenerativeModel({ model: 'gemini-1.5-flash' })
          const result = await model.generateContent([prompt(subjectName), { inlineData: { data: base64, mimeType: 'image/jpeg' } }])
          raw = result.response.text()
        }

        raw = raw.trim()
        if (!raw) continue
        // Handle both {"skip":true} and plain SKIP response
        if (/^\s*SKIP\s*$/i.test(raw) || raw.includes('"skip":true') || raw.includes('"skip": true')) continue

        // Strip markdown code fences if model wrapped in ```json ... ```
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

        // Extract first complete JSON object
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) continue

        let parsed: Record<string, unknown>
        try { parsed = JSON.parse(jsonMatch[0]) } catch { continue }
        if (!parsed.question || !parsed.answer || parsed.skip) continue

        const q = parsed as { question: string; answer: string; hint?: string; difficulty?: string; tags?: string[] }
        toInsert.push({
          subject_id: subjectId,
          station_number: 100 + toInsert.length,
          question_text: String(q.question).slice(0, 1000),
          answer: String(q.answer).slice(0, 2000),
          hint: String(q.hint || '').slice(0, 300),
          difficulty: ['easy','medium','hard'].includes(q.difficulty ?? '') ? q.difficulty : 'medium',
          tags: Array.isArray(q.tags) ? q.tags.slice(0, 5) : [],
          image_url: page.image_url,
        })
      } catch { /* skip slide */ }

      await new Promise(r => setTimeout(r, 200))
    }
  }

  // Rule-based fallback — only for slides with detectable specimen content
  if (!toInsert.length) {
    const seen = new Set<string>()
    for (const page of imagePages) {
      const text = (page.text_content || '').trim()
      const lines = text.split(/\s{3,}|\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 2)
      const title = lines[0] || ''
      if (!title) continue
      // Skip duplicates
      const key = title.toLowerCase().slice(0, 35)
      if (seen.has(key)) continue
      seen.add(key)
      // Only generate questions for slides that mention actual clinical/specimen content
      const allText = title + ' ' + lines.join(' ')
      if (!SPECIMEN_KEYWORDS.test(allText)) continue
      const content = lines.slice(1).filter((l: string) => l.length > 4)
      toInsert.push({
        subject_id: subjectId,
        station_number: 100 + toInsert.length,
        question_text: buildQuestion(title),
        answer: content.length ? content.slice(0, 10).join('\n') : 'Identify and describe the specimen shown.',
        hint: content.slice(0, 2).join(' | ').slice(0, 250),
        difficulty: 'medium',
        tags: extractTags(allText),
        image_url: page.image_url,
      })
      if (toInsert.length >= 20) break
    }
  }

  const nextIndex = startIndex + batchSize
  const hasMore = nextIndex < imagePages.length

  if (!toInsert.length) {
    // No questions this batch but may have more slides
    const dbg = { openRouter: !!openRouterKey, gemini: !!geminiKey, slides: imagePages.length, processed: slidesToProcess?.length ?? 0 }
    if (hasMore) return NextResponse.json({ success: true, count: 0, hasMore: true, nextIndex, usedAI: !!aiKey, debug: dbg })
    return NextResponse.json({ error: 'No questions generated', debug: dbg }, { status: 400 })
  }

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length, hasMore, nextIndex, usedAI: !!aiKey, debug: { openRouter: !!openRouterKey, gemini: !!geminiKey } })
}

function buildQuestion(title: string): string {
  if (/kidney|nephropat|glomerul/i.test(title)) return `${title}\n1. Identify the renal pathology.\n2. Describe histological features.\n3. What is the diagnosis?`
  if (/pancrea|islet/i.test(title)) return `${title}\n1. Identify the tissue.\n2. Describe changes.\n3. Type I or Type II DM?`
  if (/retina/i.test(title)) return `${title}\n1. Two types of diabetic retinopathy?\n2. Features of type shown?\n3. What drives neovascularization?`
  if (/pannus|synovit|joint/i.test(title)) return `${title}\n1. Identify the process.\n2. Cells involved?\n3. End result?`
  if (/nodule/i.test(title)) return `${title}\n1. Three-layer structure?\n2. Most common location?\n3. Is this a granuloma?`
  if (/pneumonia|lung|alveol/i.test(title)) return `${title}\n1. Type of pneumonia?\n2. Histological features?\n3. Causative organisms?`
  return `${title}\n1. Identify the specimen shown.\n2. Describe the morphological features.\n3. What is the diagnosis?`
}

function extractTags(text: string): string[] {
  const terms = ['kidney','nephropathy','diabetes','pancreas','retina','rheumatoid','pannus','nodule','pneumonia','lung','amyloid','histology']
  return terms.filter(t => text.toLowerCase().includes(t.toLowerCase())).slice(0, 5)
}
