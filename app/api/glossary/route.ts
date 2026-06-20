import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface GlossaryResult {
  term: string
  definition: string
  image: string | null
  source: 'Wikipedia'
  url: string
}

function shorten(text: string, maxLen = 220): string {
  if (text.length <= maxLen) return text
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  let out = ''
  for (const s of sentences) {
    if ((out + s).length > maxLen) break
    out += s
  }
  return (out || text.slice(0, maxLen)).trim()
}

async function fromWikipedia(term: string): Promise<GlossaryResult | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
    { cache: 'no-store', headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (!data.extract || data.type === 'disambiguation') return null

  return {
    term,
    definition: shorten(data.extract),
    image: data.originalimage?.source ?? data.thumbnail?.source ?? null,
    source: 'Wikipedia',
    url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(term)}`,
  }
}

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('term')?.trim()
  if (!term) return NextResponse.json({ error: 'Missing term' }, { status: 400 })

  try {
    const wiki = await fromWikipedia(term).catch(() => null)
    if (wiki) return NextResponse.json(wiki)

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 502 })
  }
}
