import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const { lectureId, subjectId, serviceKey } = await request.json()

  if (!lectureId || !subjectId || !serviceKey) {
    return NextResponse.json({ error: 'Missing lectureId, subjectId, or serviceKey' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Fetch all page text content for this lecture
  const { data: pages, error: pagesErr } = await admin
    .from('lecture_pages')
    .select('page_number, text_content, image_url')
    .eq('lecture_id', lectureId)
    .order('page_number')

  if (pagesErr || !pages || pages.length === 0) {
    return NextResponse.json({ error: 'No pages found for this lecture' }, { status: 404 })
  }

  // Combine all slide text
  const slideText = pages
    .map(p => `[Slide ${p.page_number}]\n${p.text_content}`)
    .join('\n\n')

  // Get subject name
  const { data: subject } = await admin
    .from('subjects')
    .select('name')
    .eq('id', subjectId)
    .single()

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const prompt = `You are a medical education expert. I have extracted text from lecture slides about ${subject?.name || 'medicine'}.

Here is the slide content:
${slideText.slice(0, 12000)}

Extract OSPE (Objective Structured Practical Examination) questions from this content.
For each distinct topic/specimen/case in the slides, create one exam station question in this EXACT JSON format:

{
  "questions": [
    {
      "station_number": <number starting from 100 to avoid conflicts>,
      "question_text": "<multi-part question as a medical student would see it at an OSPE station>",
      "answer": "<detailed answer covering all parts>",
      "hint": "<concise exam tip or mnemonic>",
      "difficulty": "<easy|medium|hard>",
      "tags": ["<relevant keyword>", "<another keyword>"]
    }
  ]
}

Rules:
- Only extract questions where you have enough content to write a real answer
- Questions should be practical OSPE-style (identify structure, describe features, name cells, etc.)
- Generate 3-10 questions maximum
- Return ONLY valid JSON, no other text`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  const responseText = (message.content[0] as { type: string; text: string }).text

  let extracted: { questions: Array<{
    station_number: number
    question_text: string
    answer: string
    hint: string
    difficulty: string
    tags: string[]
  }> }

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    extracted = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: responseText.slice(0, 500) }, { status: 500 })
  }

  if (!extracted.questions?.length) {
    return NextResponse.json({ error: 'No questions extracted' }, { status: 400 })
  }

  // Insert questions
  const toInsert = extracted.questions.map(q => ({
    subject_id: subjectId,
    station_number: q.station_number,
    question_text: q.question_text,
    answer: q.answer,
    hint: q.hint,
    difficulty: q.difficulty || 'medium',
    tags: q.tags || [],
  }))

  const { error: insertErr } = await admin.from('questions').insert(toInsert)
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: toInsert.length,
    questions: toInsert.map(q => q.question_text.slice(0, 80)),
  })
}
