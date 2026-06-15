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

const SKIP_TITLES = /^(college|university|department|faculty|objectives?|contents?|references?|outline|introduction|thank you|the end|ims|ims ospe|prepared by|presented by|dr\.|prof\.)/i

export async function POST(request: Request): Promise<Response> {
  try {
    return await handler(request)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function handler(request: Request) {
  const { lectureId, subjectId } = await request.json()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
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

  const imagePagesAll = (pages as PageData[]).filter(p => p.image_url)
  if (!imagePagesAll.length) return NextResponse.json({ error: 'No image slides stored — re-upload the PDF' }, { status: 400 })

  // Skip pure title/intro slides based on text content
  const imagePages = imagePagesAll.filter(p => {
    const firstLine = (p.text_content || '').trim().split(/\s{3,}|\n/)[0] || ''
    return !SKIP_TITLES.test(firstLine.trim())
  })

  const toInsert: Array<Record<string, unknown>> = []

  if (geminiKey) {
    // Support both AIzaSy (API key) and AQ. (OAuth token) formats
    const isOAuthToken = geminiKey.startsWith('AQ.') || geminiKey.startsWith('ya29.')

    for (const page of imagePages) {
      try {
        const imgRes = await fetch(page.image_url)
        if (!imgRes.ok) continue
        const imgBuffer = await imgRes.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)))

        const prompt = `You are a medical OSPE examiner looking at a ${subjectName} lecture slide image.

Analyse what you see in this slide and generate ONE OSPE exam station question.

If this slide is just a title, intro, objectives, references, or has no clinical specimen/pathology image — reply ONLY with: {"skip":true}

Otherwise reply ONLY with this JSON (no markdown, no code blocks):
{"question":"Station X — [Topic]\\n1. [Question]\\n2. [Question]\\n3. [Question]","answer":"1. [Answer]\\n2. [Answer]\\n3. [Answer]","hint":"[Key teaching point or mnemonic]","difficulty":"easy|medium|hard","tags":["tag1","tag2"]}`

        let raw = ''

        if (isOAuthToken) {
          // Use REST API directly with Bearer token
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${geminiKey}`,
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: 'image/jpeg', data: base64 } }
                ]
              }]
            })
          })
          const json = await res.json()
          raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        } else {
          // Use SDK with API key
          const { GoogleGenerativeAI } = await import('@google/generative-ai')
          const genAI = new GoogleGenerativeAI(geminiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
          const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64, mimeType: 'image/jpeg' } }
          ])
          raw = result.response.text()
        }

        raw = raw.trim()
        if (!raw || raw.includes('"skip":true')) continue

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
      } catch { /* skip this slide */ }

      await new Promise(r => setTimeout(r, 300))
    }
  }

  // Fallback: rule-based from text if Gemini not set or produced nothing
  if (!toInsert.length) {
    const usedTitles = new Set<string>()
    for (const page of imagePages) {
      const lines = (page.text_content || '').trim()
        .split(/\s{3,}|\n/).map(l => l.trim()).filter(l => l.length > 2)
      const title = lines[0] || `Slide ${page.page_number}`
      if (SKIP_TITLES.test(title)) continue
      const key = title.toLowerCase().slice(0, 35)
      if (usedTitles.has(key)) continue
      usedTitles.add(key)
      const content = lines.slice(1).filter(l => l.length > 4)
      toInsert.push({
        subject_id: subjectId,
        station_number: 100 + toInsert.length,
        question_text: buildFallbackQuestion(title),
        answer: content.length ? content.slice(0, 10).join('\n') : 'Identify and describe the specimen shown.',
        hint: content.slice(0, 2).join(' | ').slice(0, 250),
        difficulty: 'medium',
        tags: extractTags(title + ' ' + content.join(' ')),
        image_url: page.image_url,
      })
      if (toInsert.length >= 20) break
    }
  }

  if (!toInsert.length) return NextResponse.json({ error: 'No questions could be generated', totalSlides: imagePages.length }, { status: 400 })

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: toInsert.length })
}

function buildFallbackQuestion(title: string): string {
  const t = title.toLowerCase()
  if (/kidney|nephropat|glomerul/i.test(t)) return `${title}\n1. Identify the renal pathology shown.\n2. Describe the histological features.\n3. What is the diagnosis?`
  if (/pancrea|islet/i.test(t)) return `${title}\n1. Identify the tissue.\n2. Describe pathological changes.\n3. Type I or Type II DM?`
  if (/retina/i.test(t)) return `${title}\n1. Name the two types of diabetic retinopathy.\n2. Features of the type shown?\n3. What drives neovascularization?`
  if (/pannus|synovit|joint/i.test(t)) return `${title}\n1. Identify the process.\n2. Name cells involved.\n3. End result?`
  if (/nodule/i.test(t)) return `${title}\n1. Describe the three-layer structure.\n2. Most common location?\n3. Is this a granuloma?`
  if (/pneumonia|lung|alveol/i.test(t)) return `${title}\n1. Identify the pneumonia type.\n2. Histological features?\n3. Causative organisms?`
  return `${title}\n1. Identify the specimen shown.\n2. Describe the morphological features.\n3. What is the diagnosis?`
}

function extractTags(text: string): string[] {
  const terms = ['kidney','nephropathy','diabetes','pancreas','retina','rheumatoid','pannus','nodule','pneumonia','lung','amyloid','histology']
  return terms.filter(tag => text.toLowerCase().includes(tag.toLowerCase())).slice(0, 5)
}
