'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Question, Subject, UserProgress, Lecture, LecturePage } from '@/types'
import { findBestImage } from '@/lib/matchImage'
import CroppedImage from '@/components/CroppedImage'
import AmbossText from '@/components/AmbossText'
import TranslateButton from '@/components/TranslateButton'
import {
  ArrowLeft, Lightbulb, Eye, EyeOff, CheckCircle, Clock,
  BookOpen, FileText, ExternalLink, Loader2, ImageIcon, X, ZoomIn, Plus, RotateCcw
} from 'lucide-react'
import Link from 'next/link'

interface QuestionState {
  showAnswer: boolean
  showHint: boolean
  showAddImage: boolean
}

export default function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [subject, setSubject] = useState<Subject | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [progress, setProgress] = useState<Map<string, UserProgress>>(new Map())
  const [questionStates, setQuestionStates] = useState<Map<string, QuestionState>>(new Map())
  const [userId, setUserId] = useState<string | null>(null)
  const [lecturePages, setLecturePages] = useState<LecturePage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStation, setActiveStation] = useState<number | null>(null)
  const [activeLab, setActiveLab] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'answered'>('all')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null)
  // Stagger the question list only on the page's first paint — re-applying it on every
  // filter/tab click (an occasional-but-frequent action) would feel slow and janky.
  const [firstMount, setFirstMount] = useState(true)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    setUserId(session.user.id)

    const [
      { data: subjectData },
      { data: questionsData },
      { data: progressData },
      { data: lecturesData },
      { data: pagesData },
    ] = await Promise.all([
      supabase.from('subjects').select('*').eq('id', subjectId).single(),
      supabase.from('questions').select('*').eq('subject_id', subjectId).order('station_number'),
      supabase.from('user_progress').select('*').eq('user_id', session.user.id),
      supabase.from('lectures').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false }),
      supabase.from('lecture_pages').select('*').eq('subject_id', subjectId),
    ])

    if (subjectData) setSubject(subjectData)
    if (questionsData) setQuestions(questionsData)
    if (lecturesData) setLectures(lecturesData)
    if (pagesData) setLecturePages(pagesData)

    if (progressData) {
      const map = new Map<string, UserProgress>()
      progressData.forEach(p => map.set(p.question_id, p))
      setProgress(map)
    }
    setLoading(false)
  }, [subjectId, router, supabase])

  useEffect(() => { loadData() }, [loadData])

  // Only the very first render of the list should stagger-in; subsequent filter/tab
  // changes swap content instantly (no re-stagger) since those happen tens of times/day.
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setFirstMount(false), 400)
      return () => clearTimeout(t)
    }
  }, [loading])

  const toggleState = (qId: string, key: keyof QuestionState) => {
    setQuestionStates(prev => {
      const next = new Map(prev)
      const cur = next.get(qId) || { showAnswer: false, showHint: false, showAddImage: false }
      next.set(qId, { ...cur, [key]: !cur[key] })
      return next
    })
  }

  const markAnswered = async (qId: string, correct: boolean) => {
    if (!userId) return
    const existing = progress.get(qId)
    const newData = {
      user_id: userId,
      question_id: qId,
      answered: true,
      correct,
      attempts: (existing?.attempts || 0) + 1,
      last_attempted: new Date().toISOString(),
    }
    if (existing) {
      await supabase.from('user_progress').update(newData).eq('id', existing.id)
    } else {
      await supabase.from('user_progress').insert(newData)
    }
    setProgress(prev => {
      const next = new Map(prev)
      next.set(qId, { ...newData, id: existing?.id || '', created_at: existing?.created_at || '' })
      return next
    })
  }

  const filteredQuestions = questions.filter(q => {
    const prog = progress.get(q.id)
    if (filter === 'answered') return prog?.answered
    if (filter === 'unanswered') return !prog?.answered
    return true
  })
    .filter(q => activeStation === null || q.station_number === activeStation)
    .filter(q => activeLab === null || q.lecture_id === activeLab)

  // Per-lab (lecture) progress, so a student can study one finished lab at a time
  // instead of the whole subject.
  const labStats = lectures.map(lec => {
    const labQuestions = questions.filter(q => q.lecture_id === lec.id)
    const labAnswered = labQuestions.filter(q => progress.get(q.id)?.answered).length
    return { lecture: lec, total: labQuestions.length, answered: labAnswered }
  }).filter(l => l.total > 0)

  const stations = [...new Set(questions.map(q => q.station_number).filter(Boolean))] as number[]
  // Display sequential 1..N station numbers regardless of the raw DB station_number values
  // (which may be large/non-contiguous, e.g. 100, 101, 102...).
  const stationDisplay = new Map<number, number>(stations.map((s, i) => [s, i + 1]))
  // Only count progress for questions that belong to this subject — `progress` holds
  // every question the user has ever answered across all subjects.
  const answered = questions.filter(q => progress.get(q.id)?.answered).length

  const deleteProgress = async () => {
    if (!userId) return
    if (!confirm('Reset all your progress for this subject and start again?')) return
    const ids = questions.map(q => q.id)
    if (ids.length) {
      const { error } = await supabase.from('user_progress').delete().eq('user_id', userId).in('question_id', ids)
      if (error) { alert(`Reset failed: ${error.message}`); return }
    }
    setProgress(prev => {
      const next = new Map(prev)
      ids.forEach(id => next.delete(id))
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0f1e]">
        <Loader2 className="w-8 h-8 text-[#4cd7f6] animate-spin" />
      </div>
    )
  }
  if (!subject) return null

  const colorMap: Record<string, { text: string; bg: string; border: string; badge: string }> = {
    '#0891b2': { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', badge: 'bg-cyan-500/20 text-cyan-300' },
    '#7c3aed': { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', badge: 'bg-violet-500/20 text-violet-300' },
    '#dc2626': { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-300' },
    '#059669': { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300' },
    '#d97706': { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300' },
    '#0284c7': { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', badge: 'bg-cyan-500/20 text-cyan-300' },
    '#9333ea': { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', badge: 'bg-violet-500/20 text-violet-300' },
  }
  const colors = colorMap[subject.color] || colorMap['#0891b2']

  return (
    <div className="min-h-screen bg-[#0a0f1e] clinical-overlay overflow-x-auto">
      {/* Zoom overlay */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-overlay-in"
          onClick={() => setZoomedImage(null)}
        >
          <button className="absolute top-4 right-4 text-white bg-slate-800 rounded-full p-2 hover:bg-slate-700 press-scale">
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImage}
            alt="Zoomed"
            className="max-w-full max-h-full object-contain rounded-xl animate-modal-in"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* PDF viewer overlay */}
      {activeLecture && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-overlay-in">
          <div className="flex items-center justify-between p-4 border-b border-white/10 glass-panel animate-modal-in">
            <p className="text-white font-medium">{activeLecture.title}</p>
            <div className="flex items-center gap-2">
              {activeLecture.file_url && (
                <a href={activeLecture.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-[#4cd7f6] hover:text-[#7ee4fb] text-sm flex items-center gap-1">
                  <ExternalLink className="w-4 h-4" /> Open in new tab
                </a>
              )}
              <button onClick={() => setActiveLecture(null)}
                className="text-white bg-slate-800 rounded-full p-2 hover:bg-slate-700 ml-2 press-scale">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {activeLecture.file_url ? (
            <iframe
              src={activeLecture.file_url}
              className="flex-1 w-full animate-modal-in"
              title={activeLecture.title}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 animate-modal-in">
              No file URL available
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#0a0f1e]/80 backdrop-blur-xl border-b border-white/10 shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 transition-all text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
            <span className="text-lg">{subject.icon}</span>
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tight">{subject.name}</h1>
            <p className="text-slate-500 text-xs font-[family-name:var(--font-mono)] tabular-nums">{answered} / {questions.length} answered</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={deleteProgress}
              className="flex items-center gap-2 bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-300 px-3 py-2 rounded-xl text-sm font-medium transition-colors border border-white/10"
              title="Reset progress for this subject"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset Progress</span>
            </button>
            <Link
              href={`/simulation?subject=${subjectId}`}
              className="flex items-center gap-2 bg-gradient-to-r from-[#06b6d4] to-[#0053db] hover:shadow-lg hover:shadow-cyan-500/20 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">5-min Simulation</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Progress */}
        <div className={`glass-panel border ${colors.border} rounded-xl p-5 mb-6 shadow-[0_2px_12px_rgba(2,8,23,0.5)]`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${colors.text} uppercase tracking-widest`}>Subject Progress</span>
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-slate-200 text-sm font-bold">{answered} / {questions.length}</span>
          </div>
          <div className="h-2 bg-slate-800/80 rounded-md overflow-hidden">
            {/* scaleX fill (transform-origin: left) instead of width-transition — GPU-only, simple overflow-hidden bar */}
            <div
              className="h-full w-full rounded-md origin-left transition-transform duration-700 ease-[var(--ease-in-out-strong)]"
              style={{
                transform: `scaleX(${questions.length ? answered / questions.length : 0})`,
                background: subject.color,
              }}
            />
          </div>
        </div>

        {/* Labs — study one finished lab/lecture at a time instead of the whole subject */}
        {labStats.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4" /> Study by Lab
              </h2>
              {activeLab !== null && (
                <button onClick={() => setActiveLab(null)} className="text-xs text-[#4cd7f6] hover:text-[#7ee4fb]">
                  Show all labs
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {labStats.map(({ lecture, total, answered: labAnswered }, idx) => {
                const done = total > 0 && labAnswered === total
                const isActive = activeLab === lecture.id
                const fill = total ? labAnswered / total : 0
                return (
                  <div
                    key={lecture.id}
                    className={`relative glass-panel border rounded-lg p-3 shadow-[0_2px_10px_rgba(2,8,23,0.45)] transition-all animate-fade-rise-in ${
                      isActive ? 'border-[#4cd7f6]/60 bg-[#4cd7f6]/5' : done ? 'border-emerald-500/30' : 'border-white/10 hover:border-white/20'
                    }`}
                    style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
                  >
                    <button
                      onClick={() => setActiveLab(isActive ? null : lecture.id)}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      <div className="w-9 h-9 bg-white/5 rounded-md flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[#4cd7f6]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300 truncate flex items-center gap-1.5">
                          {lecture.title}
                          {done && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </p>
                        <div className="h-1.5 bg-slate-800/80 rounded-md overflow-hidden mt-1.5">
                          <div
                            className={`h-full w-full rounded-md origin-left transition-transform duration-700 ease-[var(--ease-in-out-strong)] ${done ? 'bg-emerald-500' : 'bg-[#4cd7f6]'}`}
                            style={{ transform: `scaleX(${fill})` }}
                          />
                        </div>
                        <p className="font-[family-name:var(--font-mono)] tabular-nums text-xs text-slate-500 mt-1">{labAnswered}/{total} <span className="font-[family-name:var(--font-sans)]">done{isActive ? ' · studying this lab' : ''}</span></p>
                      </div>
                    </button>
                    {lecture.file_url && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveLecture(lecture) }}
                        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-[#4cd7f6] press-scale"
                        title="View lecture PDF"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Station filter */}
        {stations.length > 0 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
            <button
              onClick={() => setActiveStation(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors press-scale ${
                activeStation === null ? 'bg-gradient-to-r from-[#06b6d4] to-[#0053db] text-white' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              All Stations
            </button>
            {stations.map(s => (
              <button
                key={s}
                onClick={() => setActiveStation(activeStation === s ? null : s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors press-scale ${
                  activeStation === s ? 'bg-gradient-to-r from-[#06b6d4] to-[#0053db] text-white' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                Station <span className="font-[family-name:var(--font-mono)] tabular-nums">{stationDisplay.get(s)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex p-1 bg-white/5 rounded-lg border border-white/10 w-fit mb-6">
          {(['all', 'unanswered', 'answered'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-colors press-scale ${
                filter === f ? 'bg-gradient-to-r from-[#06b6d4] to-[#0053db] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f} <span className="font-[family-name:var(--font-mono)] tabular-nums">{f === 'all' ? `(${questions.length})` : f === 'answered' ? `(${answered})` : `(${questions.length - answered})`}</span>
            </button>
          ))}
        </div>

        {/* Questions */}
        <div className="space-y-5">
          {filteredQuestions.map((q, qIdx) => {
            const state = questionStates.get(q.id) || { showAnswer: false, showHint: false, showAddImage: false }
            const prog = progress.get(q.id)
            const isAnswered = prog?.answered
            // Use stored image first (from extraction), fall back to fuzzy match
            const matchedImage = q.image_url || findBestImage(
              q.question_text,
              q.answer || '',
              q.hint || '',
              lecturePages
            )

            return (
              <div
                key={q.id}
                className={`glass-panel border rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-colors duration-300 ${
                  isAnswered ? 'border-emerald-500/30' : 'border-white/10 hover:border-[#4cd7f6]/40'
                } ${firstMount ? 'animate-fade-rise-in' : ''}`}
                style={firstMount ? { animationDelay: `${Math.min(qIdx * 40, 320)}ms` } : undefined}
              >
                <div className="p-5">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {q.station_number && (
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${colors.badge}`}>
                        Station <span className="font-[family-name:var(--font-mono)] tabular-nums">{stationDisplay.get(q.station_number) ?? q.station_number}</span>
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                      q.difficulty === 'hard' ? 'bg-red-500/20 text-red-300' :
                      q.difficulty === 'easy' ? 'bg-green-500/20 text-green-300' :
                      'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {q.difficulty}
                    </span>
                    {isAnswered && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center gap-1 animate-fade-rise-in">
                        <CheckCircle className="w-3 h-3" /> Done
                      </span>
                    )}
                  </div>

                  {/* AUTO-MATCHED slide image from uploaded lectures */}
                  {matchedImage && (() => {
                    const crop = q.image_crop as { x: number; y: number; w: number; h: number } | null | undefined
                    return (
                    <div className="mb-4 relative group cursor-pointer" onClick={() => setZoomedImage(matchedImage)}>
                      <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-slate-800">
                        {crop ? (
                          <CroppedImage src={matchedImage} crop={crop} alt={`Slide for station ${q.station_number}`} />
                        ) : (
                        <img
                          src={matchedImage}
                          alt={`Slide for station ${q.station_number}`}
                          className="w-full object-contain max-h-80"
                          loading="lazy"
                        />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-xl px-3 py-1.5 flex items-center gap-2 text-white text-sm">
                            <ZoomIn className="w-4 h-4" /> Click to zoom
                          </div>
                        </div>
                      </div>
                    </div>
                  )})()}

                  {/* Question text */}
                  <div className="flex justify-end mb-2">
                    <TranslateButton />
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line mb-4"><AmbossText text={q.question_text} /></p>

                  {q.sub_questions && q.sub_questions.length > 0 ? (
                    <div className="space-y-4">
                      {q.sub_questions.map((sq, idx) => {
                        const subKey = `${q.id}::${idx}`
                        const subState = questionStates.get(subKey) || { showAnswer: false, showHint: false, showAddImage: false }
                        return (
                          <div key={idx} className="border-l-2 border-white/10 pl-3">
                            <p className="text-slate-300 text-sm leading-relaxed mb-2">
                              <span className="text-slate-500 font-medium">{sq.label}:</span> <AmbossText text={sq.question} />
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {sq.hint && (
                                <button
                                  onClick={() => toggleState(subKey, 'showHint')}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors press-scale ${
                                    subState.showHint
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-white/5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10'
                                  }`}
                                >
                                  <Lightbulb className="w-3.5 h-3.5" />
                                  {subState.showHint ? 'Hide Hint' : 'Show Hint'}
                                </button>
                              )}
                              {sq.answer && (
                                <button
                                  onClick={() => toggleState(subKey, 'showAnswer')}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors press-scale ${
                                    subState.showAnswer
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                      : 'bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                                  }`}
                                >
                                  {subState.showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  {subState.showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                                </button>
                              )}
                            </div>
                            {subState.showHint && sq.hint && (
                              <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Hint</span>
                                </div>
                                <p className="text-amber-100/80 text-sm leading-relaxed">{sq.hint}</p>
                              </div>
                            )}
                            {subState.showAnswer && sq.answer && (
                              <div className="mt-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Model Answer</span>
                                </div>
                                <p className="text-cyan-100/90 text-sm leading-relaxed whitespace-pre-line"><AmbossText text={sq.answer} /></p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {q.hint && (
                        <button
                          onClick={() => toggleState(q.id, 'showHint')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors press-scale ${
                            state.showHint
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-white/5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10'
                          }`}
                        >
                          <Lightbulb className="w-3.5 h-3.5" />
                          {state.showHint ? 'Hide Hint' : 'Show Hint'}
                        </button>
                      )}
                      {q.answer && (
                        <button
                          onClick={() => toggleState(q.id, 'showAnswer')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors press-scale ${
                            state.showAnswer
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                          }`}
                        >
                          {state.showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {state.showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4">
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => markAnswered(q.id, false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors press-scale ${
                          isAnswered && prog?.correct === false
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-white/5 text-slate-500 hover:text-red-300 hover:bg-red-500/10'
                        }`}
                      >
                        ✗ Missed
                      </button>
                      <button
                        onClick={() => markAnswered(q.id, true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors press-scale ${
                          isAnswered && prog?.correct !== false
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/5 text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10'
                        }`}
                      >
                        ✓ Got it
                      </button>
                    </div>
                  </div>

                </div>

                {/* Hint (single-question stations only) */}
                {!q.sub_questions && state.showHint && q.hint && (
                  <div className="px-5 pb-4 answer-reveal">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Hint</span>
                      </div>
                      <p className="text-amber-100/80 text-sm leading-relaxed">{q.hint}</p>
                    </div>
                  </div>
                )}

                {/* Answer (single-question stations only) */}
                {!q.sub_questions && state.showAnswer && q.answer && (
                  <div className="px-5 pb-5 answer-reveal">
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Model Answer</span>
                      </div>
                      <p className="text-cyan-100/90 text-sm leading-relaxed whitespace-pre-line"><AmbossText text={q.answer} /></p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredQuestions.length === 0 && (
          <div className="relative text-center py-16 rounded-xl border border-white/10 overflow-hidden animate-fade-rise-in">
            <div className="clinical-overlay absolute inset-0 opacity-50" />
            <BookOpen className="relative w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="relative text-slate-400">No questions found</p>
          </div>
        )}
      </div>

      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <p className="text-center text-slate-600 text-xs">Made by Dr. Alhassan #44 · IMS OSPE Study Helper</p>
      </footer>
    </div>
  )
}
