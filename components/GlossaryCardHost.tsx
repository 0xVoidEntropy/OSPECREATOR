'use client'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, GripHorizontal } from 'lucide-react'
import {
  subscribe, getState, closeCard, movePos,
  loadCachedResult, persistResult, LookupResult,
} from '@/lib/glossaryBus'

const CARD_WIDTH = 340

export default function GlossaryCardHost() {
  const [{ term, pos }, setState] = useState(getState())
  const [result, setResult] = useState<LookupResult | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null)

  useEffect(() => {
    return subscribe((s) => setState({ ...s }))
  }, [])

  useEffect(() => {
    if (!term) return
    const key = term.toLowerCase()
    const cached = loadCachedResult(key)
    if (cached !== undefined) { setResult(cached); return }

    setResult(undefined)
    setLoading(true)
    fetch(`/api/glossary?term=${encodeURIComponent(term)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { persistResult(key, data); setResult(data) })
      .catch(() => { persistResult(key, null); setResult(null) })
      .finally(() => setLoading(false))
  }, [term])

  useEffect(() => {
    if (!term) return
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) closeCard()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCard() }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [term])

  const beginDrag = (clientX: number, clientY: number) => {
    if (!pos) return
    dragRef.current = { startX: clientX, startY: clientY, origTop: pos.top, origLeft: pos.left }
  }

  const handleDrag = (clientX: number, clientY: number) => {
    if (!dragRef.current) return
    const dx = clientX - dragRef.current.startX
    const dy = clientY - dragRef.current.startY
    movePos({
      top: Math.min(Math.max(dragRef.current.origTop + dy, 4), window.innerHeight - 60),
      left: Math.min(Math.max(dragRef.current.origLeft + dx, 4), window.innerWidth - 60),
    })
  }

  const endDrag = () => { dragRef.current = null }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDrag(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault()
      const t = e.touches[0]
      if (t) handleDrag(t.clientX, t.clientY)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', endDrag)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', endDrag)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', endDrag)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', endDrag)
    }
  }, [pos])

  if (!term || !pos) return null

  return (
    <div
      ref={cardRef}
      className="fixed z-[100]"
      style={{ top: pos.top, left: pos.left, width: CARD_WIDTH }}
    >
      <div className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-2xl shadow-black/40 overflow-hidden text-left">
        <div
          onMouseDown={(e) => beginDrag(e.clientX, e.clientY)}
          onTouchStart={(e) => { const t = e.touches[0]; if (t) beginDrag(t.clientX, t.clientY) }}
          className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-slate-300 shrink-0" />
            <div className="w-5 h-5 rounded-md bg-red-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0">CC</div>
            <div className="text-base font-semibold text-slate-900 capitalize leading-tight">{term}</div>
          </div>
          <button onClick={closeCard} className="text-slate-400 hover:text-slate-600 text-base leading-none">✕</button>
        </div>

        {result?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.image} alt={term} className="w-full h-36 object-cover" />
        )}

        <div className="px-4 py-3">
          {loading && (
            <div className="flex items-center gap-1.5 text-base text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking up...
            </div>
          )}
          {!loading && result === null && (
            <div className="text-base leading-relaxed text-slate-500">
              No Cleveland Clinic entry found for this term.
            </div>
          )}
          {!loading && result && (
            <div className="text-base leading-relaxed text-slate-700">
              {result.definition}
            </div>
          )}
        </div>

        {result && (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-base font-medium text-blue-700 hover:text-blue-600 bg-slate-50 px-4 py-2.5 border-t border-slate-100"
          >
            Read more on Cleveland Clinic <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  )
}
