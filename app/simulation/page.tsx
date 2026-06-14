'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Question, Subject } from '@/types'
import {
  ArrowLeft, Clock, ChevronRight, ChevronLeft, Lightbulb, Eye, EyeOff,
  CheckCircle, Play, RotateCcw, Trophy, Loader2, X
} from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

const STATION_DURATION = 5 * 60 // 5 minutes in seconds

function SimulationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const subjectFilter = searchParams.get('subject')

  const supabase = createClient()
  const [questions, setQuestions] = useState<Question[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(STATION_DURATION)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [results, setResults] = useState<Map<string, boolean | null>>(new Map())
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(subjectFilter)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    setUserId(session.user.id)

    const [{ data: qData }, { data: sData }] = await Promise.all([
      supabase.from('questions').select('*, subjects(*)').order('created_at'),
      supabase.from('subjects').select('*').order('name'),
    ])

    if (qData) {
      const shuffled = [...qData].sort(() => Math.random() - 0.5)
      setQuestions(shuffled)
    }
    if (sData) setSubjects(sData)
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (running && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            handleNextStation()
            return STATION_DURATION
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running, currentIdx])

  const handleNextStation = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setShowAnswer(false)
    setShowHint(false)
    setTimeLeft(STATION_DURATION)

    const filtered = getFilteredQuestions()
    if (currentIdx >= filtered.length - 1) {
      setRunning(false)
      setFinished(true)
    } else {
      setCurrentIdx(prev => prev + 1)
    }
  }

  const handlePrevStation = () => {
    if (currentIdx > 0) {
      setCurrentIdx(prev => prev - 1)
      setShowAnswer(false)
      setShowHint(false)
      setTimeLeft(STATION_DURATION)
    }
  }

  const getFilteredQuestions = () => {
    if (!selectedSubject) return questions
    return questions.filter(q => q.subject_id === selectedSubject)
  }

  const startSimulation = () => {
    const filtered = getFilteredQuestions()
    if (filtered.length === 0) return
    setCurrentIdx(0)
    setTimeLeft(STATION_DURATION)
    setShowAnswer(false)
    setShowHint(false)
    setStarted(true)
    setFinished(false)
    setResults(new Map())
    setRunning(true)
  }

  const markResult = async (correct: boolean | null) => {
    const filtered = getFilteredQuestions()
    const q = filtered[currentIdx]
    if (!q || !userId) return

    setResults(prev => new Map(prev).set(q.id, correct))

    if (correct !== null) {
      const { data: existing } = await supabase
        .from('user_progress')
        .select('id, attempts')
        .eq('user_id', userId)
        .eq('question_id', q.id)
        .single()

      const data = {
        user_id: userId,
        question_id: q.id,
        answered: true,
        correct,
        attempts: (existing?.attempts || 0) + 1,
        last_attempted: new Date().toISOString(),
      }

      if (existing) {
        await supabase.from('user_progress').update(data).eq('id', existing.id)
      } else {
        await supabase.from('user_progress').insert(data)
      }
    }
  }

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setStarted(false)
    setFinished(false)
    setRunning(false)
    setCurrentIdx(0)
    setTimeLeft(STATION_DURATION)
    setShowAnswer(false)
    setShowHint(false)
    setResults(new Map())
    loadData()
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isUrgent = timeLeft <= 60
  const filtered = getFilteredQuestions()
  const currentQ = filtered[currentIdx]
  const score = [...results.values()].filter(v => v === true).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    )
  }

  // Finished screen
  if (finished) {
    const total = results.size
    const pct = total > 0 ? Math.round((score / total) * 100) : 0
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Station Complete!</h2>
          <p className="text-slate-400 mb-8">You've completed all {total} stations</p>

          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
            <div className="text-5xl font-bold text-cyan-400 mb-1">{pct}%</div>
            <p className="text-slate-400 text-sm">{score} correct out of {total}</p>
            <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-white py-3 rounded-xl font-medium transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
        <footer className="fixed bottom-4 w-full text-center">
          <p className="text-slate-700 text-xs">Made by Dr. Alhassan #44</p>
        </footer>
      </div>
    )
  }

  // Setup screen
  if (!started) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">OSPE Station Simulation</h1>
            <p className="text-slate-400">5 minutes per station — just like the real exam</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-white mb-4">How it works</h3>
            <div className="space-y-3">
              {[
                { icon: '⏱️', text: 'Each station has a 5-minute countdown timer' },
                { icon: '💡', text: 'Use the Hint button if you get stuck' },
                { icon: '👁️', text: 'Reveal the answer to check yourself' },
                { icon: '✓', text: 'Mark stations as correct or missed' },
                { icon: '📊', text: 'See your score at the end' },
              ].map(item => (
                <div key={item.text} className="flex items-start gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <p className="text-slate-300 text-sm">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Subject filter */}
          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-white mb-4">Filter by Subject (optional)</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedSubject(null)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  !selectedSubject ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Subjects
              </button>
              {subjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSubject(s.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                    selectedSubject === s.id ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{s.icon}</span> {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="text-center mb-4">
            <p className="text-slate-400 text-sm">
              {filtered.length} questions {selectedSubject ? `in ${subjects.find(s => s.id === selectedSubject)?.name}` : 'across all subjects'}
            </p>
          </div>

          <button
            onClick={startSimulation}
            disabled={filtered.length === 0}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-lg transition-all shadow-lg shadow-cyan-500/20"
          >
            <Play className="w-5 h-5" /> Start Simulation
          </button>
        </div>
        <footer className="mt-16 pb-6">
          <p className="text-center text-slate-700 text-xs">Made by Dr. Alhassan #44</p>
        </footer>
      </div>
    )
  }

  // Simulation screen
  if (!currentQ) return null

  const currentResult = results.get(currentQ.id)

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Timer bar */}
      <div className={`h-1 bg-slate-800 relative overflow-hidden`}>
        <div
          className={`h-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-cyan-500'}`}
          style={{ width: `${(timeLeft / STATION_DURATION) * 100}%` }}
        />
      </div>

      {/* Header */}
      <div className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setRunning(false); setStarted(false) }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Station {currentIdx + 1} of {filtered.length}</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono font-bold text-sm ${
                isUrgent
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 timer-urgent'
                  : 'bg-slate-800 text-cyan-400'
              }`}>
                <Clock className="w-4 h-4" />
                {formatTime(timeLeft)}
              </div>
            </div>
            <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-600 rounded-full"
                style={{ width: `${((currentIdx) / filtered.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Subject badge */}
          {currentQ.subjects && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{(currentQ.subjects as Subject).icon}</span>
              <span className="text-sm text-slate-400">{(currentQ.subjects as Subject).name}</span>
              {currentQ.station_number && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  Station {currentQ.station_number}
                </span>
              )}
            </div>
          )}

          {/* IMAGE — shown prominently */}
          {currentQ.image_url && (
            <div className="mb-4 rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800">
              <img
                src={currentQ.image_url}
                alt={`Station ${currentQ.station_number}`}
                className="w-full object-contain max-h-72"
                loading="lazy"
              />
            </div>
          )}

          {/* Question text */}
          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-4">
            <p className="text-slate-100 text-base leading-relaxed whitespace-pre-line">{currentQ.question_text}</p>
          </div>

          {/* Hint */}
          {showHint && currentQ.hint && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 mb-4 answer-reveal">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Hint</span>
              </div>
              <p className="text-amber-100/80 text-sm leading-relaxed">{currentQ.hint}</p>
            </div>
          )}

          {/* Answer */}
          {showAnswer && currentQ.answer && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5 mb-4 answer-reveal">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Model Answer</span>
              </div>
              <p className="text-cyan-100/90 text-sm leading-relaxed whitespace-pre-line">{currentQ.answer}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            {currentQ.hint && (
              <button
                onClick={() => setShowHint(!showHint)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  showHint
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-amber-300'
                }`}
              >
                <Lightbulb className="w-4 h-4" />
                {showHint ? 'Hide Hint' : 'Show Hint'}
              </button>
            )}

            {currentQ.answer && (
              <button
                onClick={() => setShowAnswer(!showAnswer)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  showAnswer
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-cyan-300'
                }`}
              >
                {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
              </button>
            )}
          </div>

          {/* Self assessment */}
          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-5 mb-6">
            <p className="text-slate-400 text-xs mb-3 uppercase tracking-wider font-medium">How did you do?</p>
            <div className="flex gap-3">
              <button
                onClick={() => markResult(false)}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                  currentResult === false
                    ? 'bg-red-500/30 text-red-300 border-2 border-red-500/50'
                    : 'bg-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-300 border-2 border-transparent'
                }`}
              >
                ✗ Missed it
              </button>
              <button
                onClick={() => markResult(true)}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                  currentResult === true
                    ? 'bg-emerald-500/30 text-emerald-300 border-2 border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-300 border-2 border-transparent'
                }`}
              >
                ✓ Got it!
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevStation}
              disabled={currentIdx === 0}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              onClick={handleNextStation}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white py-3 rounded-xl text-sm font-bold transition-all"
            >
              {currentIdx === filtered.length - 1 ? 'Finish' : 'Next Station'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <footer className="py-3">
        <p className="text-center text-slate-700 text-xs">Made by Dr. Alhassan #44</p>
      </footer>
    </div>
  )
}

export default function SimulationPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    }>
      <SimulationContent />
    </Suspense>
  )
}
