'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Question, Subject, SubQuestion } from '@/types'
import { ArrowLeft, ChevronLeft, ChevronRight, Shuffle, Loader2, Layers, Play } from 'lucide-react'
import Link from 'next/link'

interface Crop { x: number; y: number; w: number; h: number }
interface FlashCard {
  id: string
  question: string
  hint: string
  answer: string
  image_url: string | null
  image_crop: Crop | null
  subjectName: string
  station: number | null
}

function CroppedImage({ imageUrl, crop }: { imageUrl: string; crop: Crop | null }) {
  if (!crop || !crop.w || !crop.h) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="w-full object-contain max-h-56" />
  }
  return (
    <div style={{ paddingBottom: `${(crop.h / crop.w) * 100}%`, position: 'relative', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" style={{
        position: 'absolute',
        width: `${100 / (crop.w / 100)}%`,
        height: `${100 / (crop.h / 100)}%`,
        left: `${-crop.x / crop.w * 100}%`,
        top: `${-crop.y / crop.h * 100}%`,
        maxWidth: 'none',
      }} />
    </div>
  )
}

function buildCards(qs: Question[], subjectsById: Map<string, Subject>): FlashCard[] {
  const cards: FlashCard[] = []
  for (const q of qs) {
    const subjectName = subjectsById.get(q.subject_id)?.name || 'Subject'
    if (q.sub_questions?.length) {
      q.sub_questions.forEach((sq: SubQuestion, idx) => {
        cards.push({
          id: `${q.id}-${idx}`,
          question: sq.question,
          hint: sq.hint,
          answer: sq.answer,
          image_url: q.image_url,
          image_crop: q.image_crop,
          subjectName,
          station: q.station_number,
        })
      })
    } else {
      cards.push({
        id: q.id,
        question: q.question_text,
        hint: q.hint || '',
        answer: q.answer || '',
        image_url: q.image_url,
        image_crop: q.image_crop,
        subjectName,
        station: q.station_number,
      })
    }
  }
  return cards
}

function FlashcardsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const subjectFilter = searchParams.get('subject')
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(subjectFilter ? [subjectFilter] : []))
  const [started, setStarted] = useState(false)
  const [cards, setCards] = useState<FlashCard[]>([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }

    const [{ data: qData }, { data: sData }] = await Promise.all([
      supabase.from('questions').select('*'),
      supabase.from('subjects').select('*').order('year').order('block').order('display_order'),
    ])
    if (qData) setQuestions(qData)
    if (sData) setSubjects(sData)
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { loadData() }, [loadData])

  const subjectsById = new Map(subjects.map(s => [s.id, s]))
  const available = questions.filter(q => selected.size === 0 || selected.has(q.subject_id))
  const availableCardCount = buildCards(available, subjectsById).length

  const start = () => {
    const pool = questions.filter(q => selected.size === 0 || selected.has(q.subject_id))
    const built = [...buildCards(pool, subjectsById)].sort(() => Math.random() - 0.5)
    if (built.length === 0) return
    setCards(built)
    setIdx(0)
    setFlipped(false)
    setStarted(true)
  }

  const shuffleCards = () => {
    setCards(prev => [...prev].sort(() => Math.random() - 0.5))
    setIdx(0)
    setFlipped(false)
  }

  const next = () => { setIdx(prev => (prev + 1) % cards.length); setFlipped(false) }
  const prev = () => { setIdx(prev => (prev - 1 + cards.length) % cards.length); setFlipped(false) }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /></div>
  }

  if (!started) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Flashcards</h1>
            <p className="text-slate-400">Flip through questions and answers at your own pace</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-white mb-4">Select Subjects (optional — leave empty for all)</h3>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelected(prev => {
                    const next = new Set(prev)
                    if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                    return next
                  })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                    selected.has(s.id) ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{s.icon}</span> {s.name}
                </button>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-3">{availableCardCount} card(s) available</p>
          </div>

          <button
            onClick={start}
            disabled={availableCardCount === 0}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-lg transition-all shadow-lg shadow-emerald-500/20"
          >
            <Play className="w-5 h-5" /> Start Flashcards
          </button>
        </div>
      </div>
    )
  }

  const card = cards[idx]

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <div className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setStarted(false)} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <span className="text-slate-400 text-sm">{idx + 1} / {cards.length}</span>
          <button onClick={shuffleCards} className="text-slate-400 hover:text-emerald-400 transition-colors">
            <Shuffle className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="max-w-xl w-full">
          <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
            <span>{card.subjectName}</span>
            {card.station && <span className="px-2 py-0.5 rounded bg-slate-800">Station {card.station}</span>}
          </div>

          <button
            onClick={() => setFlipped(f => !f)}
            className="w-full text-left bg-slate-900/60 border border-slate-700/40 hover:border-emerald-500/40 rounded-2xl p-6 min-h-[18rem] flex flex-col transition-colors"
          >
            {!flipped ? (
              <div className="flex-1 flex flex-col">
                {card.image_url && (
                  <div className="mb-4 rounded-xl overflow-hidden border border-slate-700/50 bg-slate-800">
                    <CroppedImage imageUrl={card.image_url} crop={card.image_crop} />
                  </div>
                )}
                <p className="text-slate-100 text-base leading-relaxed whitespace-pre-line flex-1">{card.question}</p>
                <p className="text-slate-500 text-xs mt-4">Tap to reveal answer</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {card.hint && (
                  <p className="text-amber-300 text-xs mb-2 uppercase tracking-wider font-medium">Hint: {card.hint}</p>
                )}
                <p className="text-cyan-100 text-base leading-relaxed whitespace-pre-line flex-1">{card.answer || 'No answer provided'}</p>
                <p className="text-slate-500 text-xs mt-4">Tap to flip back</p>
              </div>
            )}
          </button>

          <div className="flex items-center gap-3 mt-4">
            <button onClick={prev} className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors">
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button onClick={next} className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white py-3 rounded-xl text-sm font-bold transition-all">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlashcardsDisabled() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard') }, [router])
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
    </div>
  )
}

export default function FlashcardsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    }>
      <FlashcardsDisabled />
    </Suspense>
  )
}
