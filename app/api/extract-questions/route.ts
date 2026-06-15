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

  const aiKey = openRouterKey || geminiKey

  if (aiKey) {
    const useOpenRouter = !!openRouterKey
    const isGeminiOAuth = !useOpenRouter && (geminiKey?.startsWith('AQ.') || geminiKey?.startsWith('ya29.'))

    const prompt = (subjectName: string) =>
      `You are a medical OSPE examiner. Look at this ${subjectName} lecture slide image and generate ONE OSPE exam station question.

If the slide is a title page, objectives, references, or has no clinical specimen — reply ONLY: {"skip":true}

Otherwise reply ONLY with this exact JSON (no markdown):
{"question":"Station — [Topic]\\n1. [Clinical question about what is shown]\\n2. [Morphology/features question]\\n3. [Diagnosis or mechanism question]","answer":"1. [Detailed answer]\\n2. [Detailed answer]\\n3. [Detailed answer]","hint":"[Mnemonic or key teaching point]","difficulty":"easy|medium|hard","tags":["tag1","tag2"]}`

    // Process a batch of slides (caller loops with startIndex to process all)
    const slidesToProcess = imagePages.slice(startIndex, startIndex + batchSize)

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
        if (!raw || raw.includes('"skip":true')) continue

        const jsonMatch = raw.match(/\{[\s\S]*?\}(?=\s*$|\s*\n)/) || raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) continue

        const parsed = JSON.parse(jsonMatch[0])
        if (!parsed.question || !parsed.answer) continue

        toInsert.push({
          subject_id: subjectId,
          station_number: 100 + toInsert.length,
          question_text: parsed.question.slice(0, 1000),
          answer: parsed.answer.slice(0, 2000),
          hint: (parsed.hint || '').slice(0, 300),
          difficulty: ['easy','medium','hard'].includes(parsed.difficulty) ? parsed.difficulty : 'medium',
          tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
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
    if (hasMore) return NextResponse.json({ success: true, count: 0, hasMore: true, nextIndex, usedAI: !!aiKey })
    return NextResponse.json({ error: 'No questions generated', slides: imagePages.length, aiAvailable: !!aiKey }, { status: 400 })
  }

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length, hasMore, nextIndex, usedAI: !!aiKey })
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
