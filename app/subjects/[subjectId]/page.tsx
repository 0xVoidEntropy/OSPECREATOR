'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Question, Subject, UserProgress, Lecture } from '@/types'
import {
  ArrowLeft, Lightbulb, Eye, EyeOff, CheckCircle, Circle, ChevronDown, ChevronUp,
  Clock, BookOpen, FileText, Upload, ExternalLink, Loader2
} from 'lucide-react'
import Link from 'next/link'

interface QuestionState {
  showAnswer: boolean
  showHint: boolean
  answered: boolean
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
  const [loading, setLoading] = useState(true)
  const [activeStation, setActiveStation] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'answered'>('all')

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    setUserId(session.user.id)

    const [
      { data: subjectData },
      { data: questionsData },
      { data: progressData },
      { data: lecturesData }
    ] = await Promise.all([
      supabase.from('subjects').select('*').eq('id', subjectId).single(),
      supabase.from('questions').select('*').eq('subject_id', subjectId).order('station_number'),
      supabase.from('user_progress').select('*').eq('user_id', session.user.id),
      supabase.from('lectures').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false }),
    ])

    if (subjectData) setSubject(subjectData)
    if (questionsData) setQuestions(questionsData)
    if (lecturesData) setLectures(lecturesData)

    if (progressData) {
      const map = new Map<string, UserProgress>()
      progressData.forEach(p => map.set(p.question_id, p))
      setProgress(map)
    }
    setLoading(false)
  }, [subjectId, router, supabase])

  useEffect(() => { loadData() }, [loadData])

  const toggleAnswer = (qId: string) => {
    setQuestionStates(prev => {
      const next = new Map(prev)
      const cur = next.get(qId) || { showAnswer: false, showHint: false, answered: false }
      next.set(qId, { ...cur, showAnswer: !cur.showAnswer })
      return next
    })
  }

  const toggleHint = (qId: string) => {
    setQuestionStates(prev => {
      const next = new Map(prev)
      const cur = next.get(qId) || { showAnswer: false, showHint: false, answered: false }
      next.set(qId, { ...cur, showHint: !cur.showHint })
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

  const stations = [...new Set(questions.map(q => q.station_number).filter(Boolean))] as number[]
  const answered = [...progress.values()].filter(p => p.answered).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    )
  }

  if (!subject) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-400">Subject not found</p>
      </div>
    )
  }

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
      {/* Header */}
      <div className={`border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40`}>
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
        <div className={`${colors.bg} border ${colors.border} rounded-2xl p-5 mb-8`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${colors.text}`}>Subject Progress</span>
            <span className="text-slate-300 text-sm font-bold">{answered} / {questions.length}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700`}
              style={{
                width: `${questions.length ? Math.round((answered / questions.length) * 100) : 0}%`,
                background: subject.color,
              }}
            />
          </div>
        </div>

        {/* Lectures section */}
        {lectures.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Uploaded Lectures
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lectures.map(lecture => (
                <a
                  key={lecture.id}
                  href={lecture.file_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/40 rounded-xl p-3 hover:border-slate-600 transition-colors group"
                >
                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex-1 truncate">{lecture.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Station filter tabs */}
        {stations.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
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
        <div className="space-y-4">
          {filteredQuestions
            .filter(q => activeStation === null || q.station_number === activeStation)
            .map((q, idx) => {
              const state = questionStates.get(q.id) || { showAnswer: false, showHint: false, answered: false }
              const prog = progress.get(q.id)
              const isAnswered = prog?.answered

              return (
                <div
                  key={q.id}
                  className={`bg-slate-900/60 border rounded-2xl overflow-hidden transition-all duration-200 ${
                    isAnswered
                      ? 'border-emerald-500/30'
                      : 'border-slate-700/40 hover:border-slate-600/60'
                  }`}
                >
                  {/* Question header */}
                  <div className="p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {q.station_number && (
                            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${colors.badge}`}>
                              Station {q.station_number}
                            </span>
                          )}
                          {q.difficulty && (
                            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                              q.difficulty === 'hard' ? 'bg-red-500/20 text-red-300' :
                              q.difficulty === 'easy' ? 'bg-green-500/20 text-green-300' :
                              'bg-yellow-500/20 text-yellow-300'
                            }`}>
                              {q.difficulty}
                            </span>
                          )}
                          {isAnswered && (
                            <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Done
                            </span>
                          )}
                        </div>
                        <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line">{q.question_text}</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {q.hint && (
                        <button
                          onClick={() => toggleHint(q.id)}
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
                          onClick={() => toggleAnswer(q.id)}
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

                  {/* Hint reveal */}
                  {state.showHint && q.hint && (
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

                  {/* Answer reveal */}
                  {state.showAnswer && q.answer && (
                    <div className="px-5 pb-5 answer-reveal">
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Answer</span>
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
            <p className="text-slate-600 text-sm mt-1">Try changing the filter</p>
          </div>
        )}
      </div>

      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <p className="text-center text-slate-600 text-xs">Made by Dr. Alhassan #44 · IMS OSPE Study Helper</p>
      </footer>
    </div>
  )
}
