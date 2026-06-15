import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) return NextResponse.json({ error: 'No GOOGLE_AI_API_KEY set' })

  const isOAuth = key.startsWith('AQ.') || key.startsWith('ya29.')
  
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isOAuth
          ? { 'Authorization': `Bearer ${key}` }
          : { 'x-goog-api-key': key }),
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "hello" in one word' }] }]
      })
    })
    const json = await res.json()
    return NextResponse.json({ status: res.status, keyFormat: isOAuth ? 'OAuth AQ.' : 'API Key AIzaSy', response: json })
  } catch (e) {
    return NextResponse.json({ error: String(e) })
  }
}
