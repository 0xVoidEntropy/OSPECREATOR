'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Question, Subject, UserProgress, Lecture, LecturePage } from '@/types'
import { findBestImage } from '@/lib/matchImage'
import {
  ArrowLeft, Lightbulb, Eye, EyeOff, CheckCircle, Clock,
  BookOpen, FileText, ExternalLink, Loader2, ImageIcon, X, ZoomIn, Plus
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
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'answered'>('all')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null)

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
  }).filter(q => activeStation === null || q.station_number === activeStation)

  const stations = [...new Set(questions.map(q => q.station_number).filter(Boolean))] as number[]
  const answered = [...progress.values()].filter(p => p.answered).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
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
    '#0284c7': { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', badge: 'bg-blue-500/20 text-blue-300' },
    '#9333ea': { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', badge: 'bg-purple-500/20 text-purple-300' },
  }
  const colors = colorMap[subject.color] || colorMap['#0891b2']

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Zoom overlay */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button className="absolute top-4 right-4 text-white bg-slate-800 rounded-full p-2 hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImage}
            alt="Zoomed"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* PDF viewer overlay */}
      {activeLecture && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <p className="text-white font-medium">{activeLecture.title}</p>
            <div className="flex items-center gap-2">
              {activeLecture.file_url && (
                <a href={activeLecture.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1">
                  <ExternalLink className="w-4 h-4" /> Open in new tab
                </a>
              )}
              <button onClick={() => setActiveLecture(null)}
                className="text-white bg-slate-800 rounded-full p-2 hover:bg-slate-700 ml-2">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {activeLecture.file_url ? (
            <iframe
              src={activeLecture.file_url}
              className="flex-1 w-full"
              title={activeLecture.title}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              No file URL available
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-2xl">{subject.icon}</span>
          <div>
            <h1 className="text-white font-bold">{subject.name}</h1>
            <p className="text-slate-500 text-xs">{answered} / {questions.length} answered</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/simulation?subject=${subjectId}`}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">5-min Simulation</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Progress */}
        <div className={`${colors.bg} border ${colors.border} rounded-2xl p-5 mb-6`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${colors.text}`}>Subject Progress</span>
            <span className="text-slate-300 text-sm font-bold">{answered} / {questions.length}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${questions.length ? Math.round((answered / questions.length) * 100) : 0}%`,
                background: subject.color,
              }}
            />
          </div>
        </div>

        {/* Lectures — clickable to open PDF inline */}
        {lectures.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Lecture Materials — Click to View
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lectures.map(lecture => (
                <button
                  key={lecture.id}
                  onClick={() => setActiveLecture(lecture)}
                  className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/40 rounded-xl p-3 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all group text-left"
                >
                  <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300 group-hover:text-white transition-colors truncate">{lecture.title}</p>
                    <p className="text-xs text-slate-500">Click to view inline</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Station filter */}
        {stations.length > 0 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
            <button
              onClick={() => setActiveStation(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeStation === null ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              All Stations
            </button>
            {stations.map(s => (
              <button
                key={s}
                onClick={() => setActiveStation(activeStation === s ? null : s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeStation === s ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Station {s}
              </button>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'unanswered', 'answered'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f} {f === 'all' ? `(${questions.length})` : f === 'answered' ? `(${answered})` : `(${questions.length - answered})`}
            </button>
          ))}
        </div>

        {/* Questions */}
        <div className="space-y-5">
          {filteredQuestions.map(q => {
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
                className={`bg-slate-900/60 border rounded-2xl overflow-hidden transition-all duration-200 ${
                  isAnswered ? 'border-emerald-500/30' : 'border-slate-700/40 hover:border-slate-600/60'
                }`}
              >
                <div className="p-5">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {q.station_number && (
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${colors.badge}`}>
                        Station {q.station_number}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                      q.difficulty === 'hard' ? 'bg-red-500/20 text-red-300' :
                      q.difficulty === 'easy' ? 'bg-green-500/20 text-green-300' :
                      'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {q.difficulty}
                    </span>
                    {isAnswered && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Done
                      </span>
                    )}
                  </div>

                  {/* AUTO-MATCHED slide image from uploaded lectures */}
                  {matchedImage && (() => {
                    const crop = q.image_crop as { x: number; y: number; w: number; h: number } | null | undefined
                    return (
                    <div className="mb-4 relative group cursor-pointer" onClick={() => setZoomedImage(matchedImage)}>
                      <div className="relative w-full rounded-xl overflow-hidden border border-slate-700/50 bg-slate-800">
                        {crop ? (
                          <div style={{ paddingBottom: `${(crop.h / crop.w) * 100}%`, position: 'relative', overflow: 'hidden' }}>
                            <img
                              src={matchedImage}
                              alt={`Slide for station ${q.station_number}`}
                              loading="lazy"
                              style={{
                                position: 'absolute',
                                width: `${100 / (crop.w / 100)}%`,
                                height: `${100 / (crop.h / 100)}%`,
                                left: `${-crop.x / crop.w * 100}%`,
                                top: `${-crop.y / crop.h * 100}%`,
                              }}
                            />
                          </div>
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
                        <div className="absolute bottom-2 right-2 bg-black/60 text-slate-400 text-xs px-2 py-1 rounded-lg">
                          From your lecture slides
                        </div>
                      </div>
                    </div>
                  )})()}

                  {/* Question text */}
                  <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line mb-4">{q.question_text}</p>

                  {q.sub_questions && q.sub_questions.length > 0 ? (
                    <div className="space-y-4">
                      {q.sub_questions.map((sq, idx) => {
                        const subKey = `${q.id}::${idx}`
                        const subState = questionStates.get(subKey) || { showAnswer: false, showHint: false, showAddImage: false }
                        return (
                          <div key={idx} className="border-l-2 border-slate-700 pl-3">
                            <p className="text-slate-300 text-sm leading-relaxed mb-2">
                              <span className="text-slate-500 font-medium">{sq.label}:</span> {sq.question}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {sq.hint && (
                                <button
                                  onClick={() => toggleState(subKey, 'showHint')}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    subState.showHint
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10'
                                  }`}
                                >
                                  <Lightbulb className="w-3.5 h-3.5" />
                                  {subState.showHint ? 'Hide Hint' : 'Show Hint'}
                                </button>
                              )}
                              {sq.answer && (
                                <button
                                  onClick={() => toggleState(subKey, 'showAnswer')}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    subState.showAnswer
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                      : 'bg-slate-800 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                                  }`}
                                >
                                  {subState.showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  {subState.showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                                </button>
                              )}
                            </div>
                            {subState.showHint && sq.hint && (
                              <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Hint</span>
                                </div>
                                <p className="text-amber-100/80 text-sm leading-relaxed">{sq.hint}</p>
                              </div>
                            )}
                            {subState.showAnswer && sq.answer && (
                              <div className="mt-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Model Answer</span>
                                </div>
                                <p className="text-cyan-100/90 text-sm leading-relaxed whitespace-pre-line">{sq.answer}</p>
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
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            state.showHint
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10'
                          }`}
                        >
                          <Lightbulb className="w-3.5 h-3.5" />
                          {state.showHint ? 'Hide Hint' : 'Show Hint'}
                        </button>
                      )}
                      {q.answer && (
                        <button
                          onClick={() => toggleState(q.id, 'showAnswer')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            state.showAnswer
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-slate-800 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isAnswered && prog?.correct === false
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-slate-800 text-slate-500 hover:text-red-300 hover:bg-red-500/10'
                        }`}
                      >
                        ✗ Missed
                      </button>
                      <button
                        onClick={() => markAnswered(q.id, true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isAnswered && prog?.correct !== false
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10'
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
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
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
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Model Answer</span>
                      </div>
                      <p className="text-cyan-100/90 text-sm leading-relaxed whitespace-pre-line">{q.answer}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredQuestions.length === 0 && (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No questions found</p>
          </div>
        )}
      </div>

      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <p className="text-center text-slate-600 text-xs">Made by Dr. Alhassan #44 · IMS OSPE Study Helper</p>
      </footer>
    </div>
  )
}
