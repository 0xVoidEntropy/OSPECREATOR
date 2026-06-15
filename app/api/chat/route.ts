import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const { messages } = await request.json()
  const openRouterKey = process.env.OPENROUTER_API_KEY
  if (!openRouterKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY not set' }, { status: 500 })

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterKey}`,
      'HTTP-Referer': 'https://ospecreator.vercel.app',
      'X-Title': 'OSPE Study Helper',
    },
    body: JSON.stringify({
      model: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
      messages,
      max_tokens: 1000,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    return NextResponse.json({ error: err.slice(0, 200) }, { status: res.status })
  }

  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content || ''
  return NextResponse.json({ content })
}
