'use client'
import { Fragment, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { MEDICAL_TERMS_REGEX } from '@/lib/medicalTerms'

interface LookupResult {
  definition: string
  image: string | null
  source: 'MedlinePlus' | 'Wikipedia'
  url: string
}

const cache = new Map<string, LookupResult | null>()

function TermHighlight({ term }: { term: string }) {
  const key = term.toLowerCase()
  const [result, setResult] = useState<LookupResult | null | undefined>(cache.get(key))
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (cache.has(key) || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/glossary?term=${encodeURIComponent(term)}`)
      const data = res.ok ? await res.json() : null
      cache.set(key, data)
      setResult(data)
    } catch {
      cache.set(key, null)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="relative inline-block group/term" onMouseEnter={load}>
      <span
        className="cursor-help border-b-2 border-dotted border-blue-700 text-inherit hover:bg-blue-900/15 transition-colors rounded-sm"
        style={{ borderColor: '#1d4ed8' }}
      >
        {term}
      </span>
      <span className="invisible group-hover/term:visible opacity-0 group-hover/term:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 z-50 pointer-events-none group-hover/term:pointer-events-auto">
        <span className="block bg-white text-slate-900 border border-slate-200 rounded-xl shadow-xl shadow-black/30 overflow-hidden text-left">
          <span className="flex items-center gap-2 px-3.5 pt-3 pb-2 border-b border-slate-100">
            <span className="w-5 h-5 rounded-md bg-blue-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">A</span>
            <span className="text-[13px] font-semibold text-slate-900 capitalize leading-tight">{term}</span>
          </span>

          {result?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.image} alt={term} className="w-full h-28 object-cover" />
          )}

          <span className="block px-3.5 py-2.5">
            {loading && (
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Looking up...
              </span>
            )}
            {!loading && result === null && (
              <span className="block text-[12px] leading-snug text-slate-500">
                No reference entry found for this term.
              </span>
            )}
            {!loading && result && (
              <>
                <span className="block text-[10px] font-medium uppercase tracking-wide text-blue-700 mb-1">
                  {result.source}
                </span>
                <span className="block text-[12px] leading-snug text-slate-600 line-clamp-6">
                  {result.definition}
                </span>
              </>
            )}
          </span>

          {result && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-600 bg-slate-50 px-3.5 py-2 border-t border-slate-100"
            >
              Read more on {result.source} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </span>
        <span className="block w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1.5" />
      </span>
    </span>
  )
}

interface Props {
  text: string | null | undefined
}

// Underlines recognized medical terms (navy dotted underline, AMBOSS-style) and shows
// a hover card with a live definition fetched from NIH MedlinePlus (falling back to
// Wikipedia) — never from AMBOSS or other proprietary/paywalled sources.
export default function AmbossText({ text }: Props) {
  if (!text) return null
  const parts = text.split(MEDICAL_TERMS_REGEX)
  if (parts.length === 1) return <>{text}</>

  return (
    <>
      {parts.map((part, i) => {
        const isTerm = i % 2 === 1
        return (
          <Fragment key={i}>
            {isTerm ? <TermHighlight term={part} /> : part}
          </Fragment>
        )
      })}
    </>
  )
}
