'use client'
import { Fragment, useRef } from 'react'
import { MEDICAL_TERMS_REGEX } from '@/lib/medicalTerms'
import { openCard } from '@/lib/glossaryBus'

const CARD_WIDTH = 340
const GAP = 16

function TermHighlight({ term }: { term: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null)

  const handleClick = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    const station = anchorRef.current?.closest('[class*="rounded-2xl"]') as HTMLElement | null
    const stationRect = station?.getBoundingClientRect() ?? rect
    if (!stationRect) return

    const fitsRight = stationRect.right + GAP + CARD_WIDTH < window.innerWidth - 12
    const left = fitsRight ? stationRect.right + GAP : Math.max(stationRect.left - GAP - CARD_WIDTH, 12)
    const top = Math.min(Math.max(stationRect.top + 8, 12), window.innerHeight - 220)

    openCard(term, { top, left })
  }

  return (
    <button
      ref={anchorRef}
      type="button"
      onClick={handleClick}
      className="cursor-pointer border-b-2 border-dotted text-inherit hover:bg-blue-900/15 transition-colors rounded-sm bg-transparent p-0 m-0 font-inherit"
      style={{ borderColor: '#1d4ed8' }}
    >
      {term}
    </button>
  )
}

interface Props {
  text: string | null | undefined
}

// Underlines recognized medical terms. Clicking any term opens a single shared,
// draggable card (touch-friendly) with a definition + photo fetched from Wikipedia.
// The card remembers wherever you last dragged it and reopens there next time.
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
