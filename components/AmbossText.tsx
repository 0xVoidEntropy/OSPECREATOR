'use client'
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Loader2 } from 'lucide-react'
import { MEDICAL_TERMS_REGEX } from '@/lib/medicalTerms'

interface LookupResult {
  definition: string
  image: string | null
  source: 'Wikipedia'
  url: string
}

const CACHE_KEY = 'ospe_glossary_cache_v1'
const memCache = new Map<string, LookupResult | null>()

function loadPersisted(key: string): LookupResult | null | undefined {
  if (memCache.has(key)) return memCache.get(key)
  try {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    if (key in store) {
      memCache.set(key, store[key])
      return store[key]
    }
  } catch {}
  return undefined
}

function persist(key: string, value: LookupResult | null) {
  memCache.set(key, value)
  try {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    store[key] = value
    localStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {}
}

const CARD_WIDTH = 320
const LINE_LENGTH = 28

function TermHighlight({ term }: { term: string }) {
  const key = term.toLowerCase()
  const [result, setResult] = useState<LookupResult | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [layout, setLayout] = useState<{ top: number; left: number; lineTop: number; lineLeft: number; lineWidth: number; side: 'right' | 'left' } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = async () => {
    if (open) { setOpen(false); return }

    const rect = anchorRef.current?.getBoundingClientRect()
    const station = anchorRef.current?.closest('[class*="rounded-2xl"]') as HTMLElement | null
    const stationRect = station?.getBoundingClientRect() ?? rect

    if (rect && stationRect) {
      const fitsRight = stationRect.right + LINE_LENGTH + CARD_WIDTH < window.innerWidth - 12
      const side: 'right' | 'left' = fitsRight ? 'right' : 'left'
      const lineTop = rect.top + rect.height / 2
      const left = side === 'right' ? stationRect.right + LINE_LENGTH : stationRect.left - LINE_LENGTH - CARD_WIDTH
      const lineLeft = side === 'right' ? rect.right : left + CARD_WIDTH
      const lineWidth = side === 'right'
        ? Math.max(stationRect.right + LINE_LENGTH - rect.right, LINE_LENGTH)
        : Math.max(rect.left - (left + CARD_WIDTH), LINE_LENGTH)
      const top = Math.min(Math.max(stationRect.top + 8, 12), window.innerHeight - 220)
      setLayout({ top, left, lineTop, lineLeft, side, lineWidth })
    }
    setOpen(true)

    const cached = loadPersisted(key)
    if (cached !== undefined) { setResult(cached); return }

    setLoading(true)
    try {
      const res = await fetch(`/api/glossary?term=${encodeURIComponent(term)}`)
      const data = res.ok ? await res.json() : null
      persist(key, data)
      setResult(data)
    } catch {
      persist(key, null)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <span ref={anchorRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        className="cursor-pointer border-b-2 border-dotted text-inherit hover:bg-blue-900/15 transition-colors rounded-sm bg-transparent p-0 m-0 font-inherit"
        style={{ borderColor: '#1d4ed8' }}
      >
        {term}
      </button>

      {open && layout && typeof document !== 'undefined' && createPortal(
        <>
          <span
            className="fixed z-[99] border-t-2 border-dotted"
            style={{ top: layout.lineTop, left: layout.lineLeft, width: layout.lineWidth, borderColor: '#1d4ed8' }}
          />
          <span
            className="fixed z-[100]"
            style={{ top: layout.top, left: layout.left, width: CARD_WIDTH }}
          >
            <span className="block bg-white text-slate-900 border border-slate-200 rounded-xl shadow-2xl shadow-black/40 overflow-hidden text-left">
              <span className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-slate-100">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-blue-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">W</span>
                  <span className="text-[15px] font-semibold text-slate-900 capitalize leading-tight">{term}</span>
                </span>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm leading-none">✕</button>
              </span>

              {result?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.image} alt={term} className="w-full h-36 object-cover" />
              )}

              <span className="block px-4 py-3">
                {loading && (
                  <span className="flex items-center gap-1.5 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Looking up...
                  </span>
                )}
                {!loading && result === null && (
                  <span className="block text-sm leading-relaxed text-slate-500">
                    No Wikipedia entry found for this term.
                  </span>
                )}
                {!loading && result && (
                  <span className="block text-sm leading-relaxed text-slate-700">
                    {result.definition}
                  </span>
                )}
              </span>

              {result && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-600 bg-slate-50 px-4 py-2.5 border-t border-slate-100"
                >
                  Read more on Wikipedia <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </span>
          </span>
        </>,
        document.body
      )}
    </span>
  )
}

interface Props {
  text: string | null | undefined
}

// Underlines recognized medical terms. Clicking a term opens a side card (connected
// by a dotted line) with a definition + photo fetched from Wikipedia, cached in
// localStorage so the same term isn't re-fetched every time.
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
