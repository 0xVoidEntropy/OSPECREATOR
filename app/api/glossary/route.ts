import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface GlossaryResult {
  term: string
  definition: string
  image: string | null
  source: 'Cleveland Clinic'
  url: string
}

// A plain browser-like UA + headers; Cleveland Clinic's bot protection
// rejects generic/non-browser requests outright.
const HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

const BASE = 'https://my.clevelandclinic.org'

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

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// The search results page links to article paths like
// /health/articles/22062-epithelium, /health/diseases/..., /health/symptoms/..., /health/body/...
function extractFirstArticlePath(html: string): string | null {
  const matches = html.matchAll(/href="(\/health\/(?:articles|diseases|symptoms|treatments|body|drugs|procedures)\/[a-z0-9-]+)"/gi)
  for (const m of matches) {
    return m[1]
  }
  return null
}

async function findArticleUrl(term: string): Promise<string | null> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(term)}`, {
    cache: 'no-store',
    headers: HEADERS,
  })
  if (!res.ok) return null
  const html = await res.text()
  const path = extractFirstArticlePath(html)
  return path ? `${BASE}${path}` : null
}

function extractMeta(html: string, attr: 'name' | 'property', key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`,
    'i'
  )
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`,
    'i'
  )
  const m = html.match(re) ?? html.match(alt)
  return m ? decodeEntities(m[1]).trim() : null
}

function extractJsonLdDescription(html: string): { description?: string; image?: string } {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        const description = typeof item?.description === 'string' ? item.description : undefined
        let image: string | undefined
        if (typeof item?.image === 'string') image = item.image
        else if (Array.isArray(item?.image)) image = item.image[0]
        else if (typeof item?.image?.url === 'string') image = item.image.url
        if (description || image) return { description, image }
      }
    } catch {
      // not valid JSON-LD, skip
    }
  }
  return {}
}

async function fetchArticle(url: string, originalTerm: string): Promise<GlossaryResult | null> {
  const res = await fetch(url, { cache: 'no-store', headers: HEADERS })
  if (!res.ok) return null
  const html = await res.text()

  const jsonLd = extractJsonLdDescription(html)
  const description =
    jsonLd.description ??
    extractMeta(html, 'property', 'og:description') ??
    extractMeta(html, 'name', 'description')

  if (!description) return null

  const image =
    jsonLd.image ??
    extractMeta(html, 'property', 'og:image') ??
    null

  return {
    term: originalTerm,
    definition: shorten(decodeEntities(description)),
    image,
    source: 'Cleveland Clinic',
    url,
  }
}

async function fromClevelandClinic(term: string): Promise<GlossaryResult | null> {
  const url = await findArticleUrl(term).catch(() => null)
  if (!url) return null
  return fetchArticle(url, term).catch(() => null)
}

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('term')?.trim()
  if (!term) return NextResponse.json({ error: 'Missing term' }, { status: 400 })

  try {
    const result = await fromClevelandClinic(term)
    if (result) return NextResponse.json(result)

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 502 })
  }
}
