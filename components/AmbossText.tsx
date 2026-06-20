'use client'
import { Fragment, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Loader2 } from 'lucide-react'
import { MEDICAL_TERMS_REGEX } from '@/lib/medicalTerms'

interface LookupResult {
  definition: string
  image: string | null
  source: 'Wikipedia'
  url: string
}

const cache = new Map<string, LookupResult | null>()
const CARD_WIDTH = 300

function TermHighlight({ term }: { term: string }) {
  const key = term.toLowerCase()
  const [result, setResult] = useState<LookupResult | null | undefined>(cache.get(key))
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)

  const show = async () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      const above = rect.top > 260
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, 12),
        window.innerWidth - CARD_WIDTH - 12
      )
      setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, above })
    }
    setOpen(true)

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
    <span
      ref={anchorRef}
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className="cursor-help border-b-2 border-dotted text-inherit hover:bg-blue-900/15 transition-colors rounded-sm"
        style={{ borderColor: '#1d4ed8' }}
      >
        {term}
      </span>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          className="fixed z-[100] pointer-events-none"
          style={{
            top: pos.above ? pos.top : pos.top,
            left: pos.left,
            width: CARD_WIDTH,
            transform: pos.above ? 'translateY(-100%)' : 'none',
          }}
        >
          <span className="block bg-white text-slate-900 border border-slate-200 rounded-xl shadow-2xl shadow-black/40 overflow-hidden text-left">
            <span className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-slate-100">
              <span className="w-5 h-5 rounded-md bg-blue-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">W</span>
              <span className="text-sm font-semibold text-slate-900 capitalize leading-tight">{term}</span>
            </span>

            {result?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.image} alt={term} className="w-full h-32 object-cover" />
            )}

            <span className="block px-4 py-3">
              {loading && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up...
                </span>
              )}
              {!loading && result === null && (
                <span className="block text-[13px] leading-relaxed text-slate-500">
                  No Wikipedia entry found for this term.
                </span>
              )}
              {!loading && result && (
                <span className="block text-[13px] leading-relaxed text-slate-700">
                  {result.definition}
                </span>
              )}
            </span>

            {result && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-600 bg-slate-50 px-4 py-2 border-t border-slate-100 pointer-events-auto"
              >
                Read more on Wikipedia <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </span>
        </span>,
        document.body
      )}
    </span>
  )
}

interface Props {
  text: string | null | undefined
}

// Underlines recognized medical terms (navy dotted underline) and shows a hover card,
// portaled to document.body so it floats above surrounding content cleanly, with a
// live definition + photo fetched from Wikipedia.
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
