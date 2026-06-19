import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as mammoth from 'mammoth'
import * as cheerio from 'cheerio'
import { verifyAdmin } from '@/lib/verifyAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface ParsedQA { label: string; question: string; hint: string; answer: string }
interface ParsedImage { mime: string; data: Buffer }
interface ParsedEntity { title: string; images: ParsedImage[]; qas: ParsedQA[] }

function parseEntities(html: string): ParsedEntity[] {
  const $ = cheerio.load(html)
  const entities: ParsedEntity[] = []
  let current: ParsedEntity | null = null
  let pendingQ: ParsedQA | null = null
  // 'idle' | 'question' | 'hint' | 'answer'
  let state: 'idle' | 'question' | 'hint' | 'answer' = 'idle'

  $('body').children().each((_, el) => {
    const tag = el.tagName?.toLowerCase()
    const $el = $(el)

    if (tag === 'h1' || tag === 'h2') {
      const text = $el.text().trim()
      if (/^\d+[.)]\s/.test(text)) {
        if (current) entities.push(current)
        current = { title: text.replace(/^\d+[.)]\s*/, ''), images: [], qas: [] }
        pendingQ = null
        state = 'idle'
      }
      return
    }

    if (!current) return

    const img = $el.find('img').first()
    if (img.length) {
      const src = img.attr('src') || ''
      const m = src.match(/^data:(image\/[a-z]+);base64,(.+)$/)
      if (m) current.images.push({ mime: m[1], data: Buffer.from(m[2], 'base64') })
      return
    }

    const text = $el.text().trim()
    if (!text) return

    const qMatch = text.match(/^Q\d+\s*—\s*(.+)$/)
    if (qMatch) {
      if (pendingQ) current.qas.push(pendingQ)
      pendingQ = { label: qMatch[1], question: '', hint: '', answer: '' }
      state = 'question'
      return
    }
    if (/^Hint\b/i.test(text)) { state = 'hint'; return }
    if (/^Answer$/i.test(text)) { state = 'answer'; return }
    if (/^Not tested/i.test(text)) { return }

    if (pendingQ) {
      if (state === 'question' && !pendingQ.question) pendingQ.question = text
      else if (state === 'hint' && !pendingQ.hint) pendingQ.hint = text
      else if (state === 'answer' && !pendingQ.answer) {
        pendingQ.answer = text
        state = 'idle'
        current.qas.push(pendingQ)
        pendingQ = null
      }
    }
    // else: category subtitle / caption lines — not needed for question data
  })

  if (pendingQ && current) (current as ParsedEntity).qas.push(pendingQ)
  if (current) entities.push(current)
  return entities
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handler(request)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function handler(request: Request) {
  if (!(await verifyAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  const lectureId = form.get('lectureId') as string | null
  const subjectId = form.get('subjectId') as string | null
  if (!file || !lectureId || !subjectId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { value: html } = await mammoth.convertToHtml({ buffer })
  const entities = parseEntities(html)

  let stationCounter = 0
  let questionCount = 0
  let pageNumber = 0

  for (const entity of entities) {
    if (!entity.qas.length) continue
    pageNumber++

    // Image is optional — biochem/physiology-style labs are pure text Q&A
    let primaryImage: string | null = null
    if (entity.images.length) {
      const uploadedUrls: string[] = []
      for (let i = 0; i < entity.images.length; i++) {
        const img = entity.images[i]
        const ext = img.mime.split('/')[1] || 'jpg'
        const path = `${lectureId}/entity-${pageNumber}-img-${i + 1}.${ext}`
        const { error: upErr } = await admin.storage.from('slide-images').upload(path, img.data, { contentType: img.mime, upsert: true })
        if (upErr) continue
        const { data: { publicUrl } } = admin.storage.from('slide-images').getPublicUrl(path)
        uploadedUrls.push(publicUrl)
      }
      primaryImage = uploadedUrls[0] || null
    }

    if (primaryImage) {
      await admin.from('lecture_pages').insert({
        lecture_id: lectureId,
        subject_id: subjectId,
        page_number: pageNumber,
        image_url: primaryImage,
        text_content: entity.title,
      })
    }

    const validQas = entity.qas.filter(qa => qa.question && qa.answer)
    if (!validQas.length) continue

    // All Q&A for one entity share a single station/card — the image (if any)
    // is shown once, and each sub-question gets its own hint/answer reveal.
    const row = {
      subject_id: subjectId,
      lecture_id: lectureId,
      station_number: 100 + stationCounter++,
      question_text: entity.title.slice(0, 1000),
      answer: null,
      hint: null,
      difficulty: 'medium',
      tags: [],
      image_url: primaryImage,
      image_crop: null,
      sub_questions: validQas.map(qa => ({
        label: qa.label,
        question: qa.question.slice(0, 1000),
        hint: qa.hint.slice(0, 300),
        answer: qa.answer.slice(0, 3000),
      })),
    }

    const { error: insertErr } = await admin.from('questions').insert(row)
    if (!insertErr) questionCount++
  }

  return NextResponse.json({ success: true, entities: entities.length, count: questionCount })
}
