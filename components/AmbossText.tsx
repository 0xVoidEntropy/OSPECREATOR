'use client'
import { Fragment } from 'react'
import { ExternalLink } from 'lucide-react'
import { MEDICAL_TERMS_REGEX, ambossSearchUrl } from '@/lib/medicalTerms'

function TermHighlight({ term }: { term: string }) {
  return (
    <span className="relative inline-block group/term">
      <span
        className="cursor-help border-b-2 border-dotted border-blue-700 text-inherit hover:bg-blue-900/15 transition-colors rounded-sm"
        style={{ borderColor: '#1d4ed8' }}
      >
        {term}
      </span>
      <span className="invisible group-hover/term:visible opacity-0 group-hover/term:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 z-50 pointer-events-none group-hover/term:pointer-events-auto">
        <span className="block bg-slate-950 border border-blue-800/50 rounded-xl shadow-xl shadow-black/40 p-3">
          <span className="flex items-center gap-2 mb-1.5">
            <span className="w-5 h-5 rounded-md bg-blue-700 text-white text-[10px] font-bold flex items-center justify-center">A</span>
            <span className="text-xs font-semibold text-white capitalize">{term}</span>
          </span>
          <span className="block text-[11px] text-slate-400 mb-2">
            Look this term up in the AMBOSS Knowledge Library.
          </span>
          <a
            href={ambossSearchUrl(term)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300"
          >
            Open in AMBOSS <ExternalLink className="w-3 h-3" />
          </a>
        </span>
        <span className="block w-3 h-3 bg-slate-950 border-r border-b border-blue-800/50 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1.5" />
      </span>
    </span>
  )
}

interface Props {
  text: string | null | undefined
}

// Underlines recognized medical terms (navy dotted underline, AMBOSS-style) and shows
// a hover card that deep-links out to AMBOSS's own Knowledge Library search — it does
// not display any AMBOSS content itself, since that content is proprietary to AMBOSS.
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
