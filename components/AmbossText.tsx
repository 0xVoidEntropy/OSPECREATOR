'use client'
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Loader2, GripHorizontal } from 'lucide-react'
import { MEDICAL_TERMS_REGEX } from '@/lib/medicalTerms'

interface LookupResult {
  definition: string
  image: string | null
  source: 'Wikipedia'
  url: string
}

const CACHE_KEY = 'ospe_glossary_cache_v2'
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

const CARD_WIDTH = 340
const GAP = 16

function TermHighlight({ term }: { term: string }) {
  const key = term.toLowerCase()
  const [result, setResult] = useState<LookupResult | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !(e.target as HTMLElement)?.closest('[data-glossary-card]')) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const startDrag = (e: React.MouseEvent) => {
    if (!pos) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, origTop: pos.top, origLeft: pos.left }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({
        top: Math.min(Math.max(dragRef.current.origTop + dy, 4), window.innerHeight - 60),
        left: Math.min(Math.max(dragRef.current.origLeft + dx, 4), window.innerWidth - 60),
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const toggle = async () => {
    if (open) { setOpen(false); return }

    const rect = anchorRef.current?.getBoundingClientRect()
    const station = anchorRef.current?.closest('[class*="rounded-2xl"]') as HTMLElement | null
    const stationRect = station?.getBoundingClientRect() ?? rect

    if (stationRect) {
      const fitsRight = stationRect.right + GAP + CARD_WIDTH < window.innerWidth - 12
      const left = fitsRight ? stationRect.right + GAP : Math.max(stationRect.left - GAP - CARD_WIDTH, 12)
      const top = Math.min(Math.max(stationRect.top + 8, 12), window.innerHeight - 220)
      setPos({ top, left })
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

      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          data-glossary-card
          className="fixed z-[100]"
          style={{ top: pos.top, left: pos.left, width: CARD_WIDTH }}
        >
          <span className="block bg-white text-slate-900 border border-slate-200 rounded-xl shadow-2xl shadow-black/40 overflow-hidden text-left">
            <span
              onMouseDown={startDrag}
              className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none"
            >
              <span className="flex items-center gap-2">
                <GripHorizontal className="w-4 h-4 text-slate-300 shrink-0" />
                <span className="w-5 h-5 rounded-md bg-blue-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0">W</span>
                <span className="text-base font-semibold text-slate-900 capitalize leading-tight">{term}</span>
              </span>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-base leading-none">✕</button>
            </span>

            {result?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.image} alt={term} className="w-full h-36 object-cover" />
            )}

            <span className="block px-4 py-3">
              {loading && (
                <span className="flex items-center gap-1.5 text-base text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Looking up...
                </span>
              )}
              {!loading && result === null && (
                <span className="block text-base leading-relaxed text-slate-500">
                  No Wikipedia entry found for this term.
                </span>
              )}
              {!loading && result && (
                <span className="block text-base leading-relaxed text-slate-700">
                  {result.definition}
                </span>
              )}
            </span>

            {result && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-base font-medium text-blue-700 hover:text-blue-600 bg-slate-50 px-4 py-2.5 border-t border-slate-100"
              >
                Read more on Wikipedia <ExternalLink className="w-4 h-4" />
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

// Underlines recognized medical terms. Clicking a term opens a draggable card
// (drag the header to move it anywhere) with a definition + photo fetched from
// Wikipedia, cached in localStorage so the same term isn't re-fetched every time.
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
