import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface GlossaryResult {
  term: string
  definition: string
  image: string | null
  source: 'MedlinePlus' | 'Wikipedia'
  url: string
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function fromMedlinePlus(term: string): Promise<GlossaryResult | null> {
  const res = await fetch(
    `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(term)}&retmax=1`,
    { cache: 'no-store' }
  )
  if (!res.ok) return null
  const xml = await res.text()

  const docMatch = xml.match(/<document[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/document>/)
  if (!docMatch) return null
  const [, url, body] = docMatch

  const titleMatch = body.match(/<content name="title">([\s\S]*?)<\/content>/)
  const summaryMatch = body.match(/<content name="FullSummary">([\s\S]*?)<\/content>/)
  const snippetMatch = body.match(/<content name="snippet">([\s\S]*?)<\/content>/)

  const rawDef = summaryMatch?.[1] ?? snippetMatch?.[1]
  if (!rawDef) return null

  const definition = stripHtml(rawDef).slice(0, 600)
  if (!definition || (titleMatch && stripHtml(titleMatch[1]).length === 0)) return null

  return {
    term,
    definition,
    image: null,
    source: 'MedlinePlus',
    url,
  }
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
    definition: data.extract,
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

    const medline = await fromMedlinePlus(term).catch(() => null)
    if (medline) return NextResponse.json(medline)

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 502 })
  }
}
