import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface GlossaryResult {
  term: string
  definition: string
  image: string | null
  source: 'Wikipedia'
  url: string
}

// Wikimedia rejects/throttles requests without a descriptive User-Agent.
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'OSPEStudyHelper/1.0 (educational study app; contact via app)',
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

async function findBestTitle(term: string): Promise<string | null> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data?.[1]?.[0] ?? null
}

async function fetchSummary(title: string, originalTerm: string): Promise<GlossaryResult | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (!data.extract || data.type === 'disambiguation') return null

  return {
    term: originalTerm,
    definition: shorten(data.extract),
    image: data.originalimage?.source ?? data.thumbnail?.source ?? null,
    source: 'Wikipedia',
    url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  }
}

async function fromWikipedia(term: string): Promise<GlossaryResult | null> {
  const direct = await fetchSummary(term, term).catch(() => null)
  if (direct) return direct

  const bestTitle = await findBestTitle(term).catch(() => null)
  if (bestTitle && bestTitle.toLowerCase() !== term.toLowerCase()) {
    const viaSearch = await fetchSummary(bestTitle, term).catch(() => null)
    if (viaSearch) return viaSearch
  }
  return null
}

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('term')?.trim()
  if (!term) return NextResponse.json({ error: 'Missing term' }, { status: 400 })

  try {
    const wiki = await fromWikipedia(term)
    if (wiki) return NextResponse.json(wiki)

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 502 })
  }
}
