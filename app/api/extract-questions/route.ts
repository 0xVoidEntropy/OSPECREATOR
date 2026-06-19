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

  const [{ data: pages }, { data: subject }] = await Promise.all([
    admin.from('lecture_pages').select('page_number, text_content, image_url').eq('lecture_id', lectureId).order('page_number'),
    admin.from('subjects').select('name').eq('id', subjectId).single(),
  ])

  if (!pages?.length) return NextResponse.json({ error: 'No pages found — re-upload the PDF first' }, { status: 404 })
  const subjectName = subject?.name || 'Medicine'

  // Let AI decide what to skip — no code-based title filtering
  const imagePages = (pages as PageData[]).filter(p => !!p.image_url)

  if (!imagePages.length) return NextResponse.json({ error: 'No content slides found — try re-uploading the PDF' }, { status: 400 })

  const toInsert: Array<Record<string, unknown>> = []
  const slidesToProcess = imagePages.slice(startIndex, startIndex + batchSize)
  const aiErrors: string[] = []

  const aiKey = openRouterKey || geminiKey

  if (aiKey) {
    const useOpenRouter = !!openRouterKey
    const isGeminiOAuth = !useOpenRouter && (geminiKey?.startsWith('AQ.') || geminiKey?.startsWith('ya29.'))

    const prompt = (subjectName: string) =>
      `You are a medical OSPE examiner and pathology/histology instructor. Analyze this ${subjectName} lecture slide image, which may contain ONE OR MORE specimen photos/micrographs (gross or histology), each possibly with arrows, arrowheads, circles, or labels pointing at findings.

OUTPUT "SKIP" (nothing else) if the slide has NO actual specimen/histology/gross-pathology photo (title, objectives, contents, references, pure text, diagram-only, blank).

Otherwise OUTPUT raw JSON only (no markdown), as an array — one entry per DISTINCT specimen image on the slide (usually 1, sometimes 2-4):
[
  {
    "identification": "what the specimen/structure is (organ, tissue, etc.)",
    "gross_description": "gross/macroscopic appearance — color, shape, size cues (empty string if this is a microscopic image instead)",
    "microscopic_description": "microscopic/histologic findings — cells, staining, architecture (empty string if this is a gross specimen photo instead)",
    "diagnosis": "the most likely disease/diagnosis this image illustrates",
    "arrows": "if there are arrows/arrowheads/circles/labels, describe each one, its color if relevant, and what it points to. Empty string if none.",
    "question": "Station — [topic]\\n1. [identify question]\\n2. [morphology question]\\n3. [diagnosis question]",
    "hint": "[key teaching point, without giving away the diagnosis]",
    "difficulty": "easy",
    "tags": ["tag1","tag2"],
    "crop": {"x":0,"y":0,"w":100,"h":100}
  }
]

"crop" = tight bounding box of THIS specimen photo only (not slide title/text, not other specimens on the same slide), as % of full slide dimensions.

Rules: difficulty = easy/medium/hard. Tags = 2-5 medical terms. Be specific and use correct medical terminology; if uncertain about the diagnosis, say so rather than guessing confidently. No text before or after the JSON array.`

    for (const page of slidesToProcess) {
      try {
        let raw = ''

        if (useOpenRouter) {
          const FREE_VISION_MODELS = [
            'google/gemini-2.0-flash',
          ]
          for (const model of FREE_VISION_MODELS) {
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), 6000)
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              signal: ctrl.signal,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openRouterKey}`,
                'HTTP-Referer': 'https://ospecreator.vercel.app',
                'X-Title': 'OSPE Study Helper',
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: [
                  { type: 'text', text: prompt(subjectName) },
                  { type: 'image_url', image_url: { url: page.image_url } },
                ]}],
                max_tokens: 500,
              })
            })
            clearTimeout(timer)
            if (!res.ok) {
              const errBody = await res.text().catch(() => '')
              aiErrors.push(`p${page.page_number}:${model}:${res.status}:${errBody.slice(0, 100)}`)
              continue
            }
            const json = await res.json().catch(() => null)
            raw = json?.choices?.[0]?.message?.content || ''
            if (raw) break  // success — stop trying models
          }
        } else {
          // Gemini: fetch image as base64
          const imgRes = await fetch(page.image_url)
          if (!imgRes.ok) continue
          const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')
          if (isGeminiOAuth) {
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
        }

        raw = raw.trim()
        if (!raw) continue
        // Handle both {"skip":true} and plain SKIP response
        if (/^\s*SKIP\s*$/i.test(raw) || raw.includes('"skip":true') || raw.includes('"skip": true')) continue

        // Strip markdown code fences if model wrapped in ```json ... ```
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

        // Extract a JSON array (preferred, multi-specimen) or fall back to a single object
        const arrayMatch = raw.match(/\[[\s\S]*\]/)
        const objectMatch = raw.match(/\{[\s\S]*\}/)
        let specimens: Record<string, unknown>[] = []
        try {
          if (arrayMatch) specimens = JSON.parse(arrayMatch[0])
          else if (objectMatch) specimens = [JSON.parse(objectMatch[0])]
        } catch { continue }
        if (!Array.isArray(specimens) || !specimens.length) continue

        for (const raw_s of specimens) {
          const s = raw_s as {
            question?: string; identification?: string; gross_description?: string
            microscopic_description?: string; diagnosis?: string; arrows?: string
            hint?: string; difficulty?: string; tags?: string[]
            crop?: { x: number; y: number; w: number; h: number }
          }
          if (!s || (!s.question && !s.identification && !s.diagnosis)) continue

          const rows: string[] = []
          if (s.identification) rows.push(`<b>Identification:</b> ${s.identification}`)
          if (s.gross_description) rows.push(`<b>Gross:</b> ${s.gross_description}`)
          if (s.microscopic_description) rows.push(`<b>Microscopic:</b> ${s.microscopic_description}`)
          if (s.diagnosis) rows.push(`<b>Diagnosis:</b> ${s.diagnosis}`)
          if (s.arrows) rows.push(`<b>Arrows/markers:</b> ${s.arrows}`)
          const answer = rows.join('<br><br>') || s.diagnosis || s.identification || ''
          if (!answer) continue

          const crop = s.crop && typeof s.crop.x === 'number' ? s.crop : null
          toInsert.push({
            subject_id: subjectId,
            station_number: 100 + toInsert.length,
            question_text: String(s.question || `Identify this specimen and state the diagnosis.`).slice(0, 1000),
            answer: answer.slice(0, 3000),
            hint: String(s.hint || '').slice(0, 300),
            difficulty: ['easy','medium','hard'].includes(s.difficulty ?? '') ? s.difficulty : 'medium',
            tags: Array.isArray(s.tags) ? s.tags.slice(0, 5) : [],
            image_url: page.image_url,
            image_crop: crop,
            lecture_id: lectureId,
          })
        }
      } catch { /* skip slide */ }

      await new Promise(r => setTimeout(r, 200))
    }
  }

  // Rule-based fallback — only when no AI key is configured
  if (!aiKey && !toInsert.length) {
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
        lecture_id: lectureId,
      })
      if (toInsert.length >= 20) break
    }
  }

  const nextIndex = startIndex + batchSize
  const hasMore = nextIndex < imagePages.length

  if (!toInsert.length) {
    // No questions this batch but may have more slides
    const dbg = { openRouter: !!openRouterKey, gemini: !!geminiKey, slides: imagePages.length, processed: slidesToProcess.length, aiErrors }
    if (hasMore) return NextResponse.json({ success: true, count: 0, hasMore: true, nextIndex, usedAI: !!aiKey, debug: dbg })
    return NextResponse.json({ error: 'No questions generated', debug: dbg }, { status: 400 })
  }

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length, hasMore, nextIndex, usedAI: !!aiKey, debug: { openRouter: !!openRouterKey, gemini: !!geminiKey, aiErrors } })
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
