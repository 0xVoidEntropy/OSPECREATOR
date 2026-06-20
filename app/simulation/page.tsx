'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Question, Subject } from '@/types'
import {
  ArrowLeft, Clock, ChevronRight, ChevronLeft, Lightbulb, Eye, EyeOff,
  Play, RotateCcw, Trophy, Loader2, X, Shuffle, ListChecks, Folder, FolderOpen, CheckCheck, XCircle, CheckCircle
} from 'lucide-react'
import { LecturePage } from '@/types'
import { findBestImage } from '@/lib/matchImage'
import CroppedImage from '@/components/CroppedImage'
import AmbossText from '@/components/AmbossText'
import Link from 'next/link'
import { Suspense } from 'react'

const STATION_DURATION = 5 * 60 // 5 minutes in seconds
const MAX_STATIONS = 25
const STORAGE_KEY = 'ospe_simulation_state_v1'

const yearLabel = (y: number) => y === 1 ? '1st Year' : y === 2 ? '2nd Year' : y === 3 ? '3rd Year' : `${y}th Year`

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

function ratioColor(ratio: number) {
  if (ratio >= 1) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  if (ratio >= 0.75) return 'bg-lime-500/20 text-lime-300 border-lime-500/40'
  if (ratio >= 0.5) return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  if (ratio >= 0.25) return 'bg-orange-500/20 text-orange-300 border-orange-500/40'
  return 'bg-red-500/20 text-red-300 border-red-500/40'
}

function SimulationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const subjectFilter = searchParams.get('subject')

  const supabase = createClient()
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lecturePages, setLecturePages] = useState<LecturePage[]>([])
  const [stations, setStations] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(STATION_DURATION)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [subAnswers, setSubAnswers] = useState<(boolean | null)[]>([])
  const [revealedSubs, setRevealedSubs] = useState<boolean[]>([])
  const [stationScores, setStationScores] = useState<number[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // mode + selection state
  const [mode, setMode] = useState<'random' | 'custom' | null>(null)
  const [folderYear, setFolderYear] = useState<number | null>(null)
  const [folderBlock, setFolderBlock] = useState<string | null>(null)
  const [customSelected, setCustomSelected] = useState<Set<string>>(
    new Set(subjectFilter ? [subjectFilter] : [])
  )
  const restoringRef = useRef(false)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    setUserId(session.user.id)

    const [{ data: qData }, { data: sData }, { data: pData }] = await Promise.all([
      supabase.from('questions').select('*, subjects(*)').order('created_at'),
      supabase.from('subjects').select('*').order('year').order('block').order('display_order'),
      supabase.from('lecture_pages').select('*'),
    ])

    if (qData) setAllQuestions(qData)
    if (sData) setSubjects(sData)
    if (pData) setLecturePages(pData)

    // Resume an in-progress session (survives refresh) if one was saved.
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.started && !s.finished && Array.isArray(s.stations) && s.stations.length) {
          restoringRef.current = true
          setStations(s.stations)
          setCurrentIdx(s.currentIdx ?? 0)
          setTimeLeft(s.timeLeft ?? STATION_DURATION)
          setStationScores(s.stationScores ?? [])
          setSubAnswers(s.subAnswers ?? [])
          setRevealedSubs(s.revealedSubs ?? [])
          setShowAnswer(s.showAnswer ?? false)
          setShowHint(s.showHint ?? false)
          setMode(s.mode ?? null)
          setFolderYear(s.folderYear ?? null)
          setFolderBlock(s.folderBlock ?? null)
          if (Array.isArray(s.customSelected)) setCustomSelected(new Set(s.customSelected))
          setStarted(true)
          setRunning(true)
        }
      } catch { /* ignore corrupt saved state */ }
    }

    setLoading(false)
  }, [router, supabase])

  useEffect(() => { loadData() }, [loadData])

  // Persist progress on every change so a refresh/crash resumes exactly where the user left off.
  useEffect(() => {
    if (!started || finished) return
    if (typeof window === 'undefined') return
    const state = {
      started, finished: false, stations, currentIdx, timeLeft, stationScores,
      subAnswers, revealedSubs, showAnswer, showHint, mode, folderYear, folderBlock,
      customSelected: [...customSelected],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [started, finished, stations, currentIdx, timeLeft, stationScores, subAnswers, revealedSubs, showAnswer, showHint, mode, folderYear, folderBlock, customSelected])

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

  const currentQ = stations[currentIdx]
  const subCount = currentQ?.sub_questions?.length || 1

  // reset per-station grading state whenever the station changes
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return }
    setSubAnswers(new Array(subCount).fill(null))
    setRevealedSubs(new Array(subCount).fill(false))
    setShowAnswer(false)
    setShowHint(false)
  }, [currentIdx, stations])

  const currentRatio = subAnswers.length
    ? subAnswers.filter(a => a === true).length / subAnswers.length
    : 0

  const recordStationScore = async () => {
    const ratio = subAnswers.length ? subAnswers.filter(a => a === true).length / subAnswers.length : 0
    setStationScores(prev => [...prev, ratio])

    if (currentQ && userId) {
      const correct = ratio === 1
      const { data: existing } = await supabase
        .from('user_progress')
        .select('id, attempts')
        .eq('user_id', userId)
        .eq('question_id', currentQ.id)
        .single()

      const data = {
        user_id: userId,
        question_id: currentQ.id,
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

  const handleNextStation = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(STATION_DURATION)
    await recordStationScore()

    if (currentIdx >= stations.length - 1) {
      setRunning(false)
      setFinished(true)
      if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    } else {
      setCurrentIdx(prev => prev + 1)
    }
  }

  const handlePrevStation = () => {
    if (currentIdx > 0) {
      setCurrentIdx(prev => prev - 1)
      setTimeLeft(STATION_DURATION)
    }
  }

  const buildStations = (subjectIds: string[]) => {
    const pool = allQuestions.filter(q => subjectIds.includes(q.subject_id))
    return shuffle(pool).slice(0, MAX_STATIONS)
  }

  const startSimulation = () => {
    let subjectIds: string[] = []
    if (mode === 'random' && folderYear !== null && folderBlock !== null) {
      subjectIds = subjects
        .filter(s => s.year === folderYear && (s.block ?? 'General') === folderBlock)
        .map(s => s.id)
    } else if (mode === 'custom') {
      subjectIds = [...customSelected]
    }
    const built = buildStations(subjectIds)
    if (built.length === 0) return
    setStations(built)
    setCurrentIdx(0)
    setTimeLeft(STATION_DURATION)
    setStarted(true)
    setFinished(false)
    setStationScores([])
    setRunning(true)
  }

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    setStarted(false)
    setFinished(false)
    setRunning(false)
    setCurrentIdx(0)
    setTimeLeft(STATION_DURATION)
    setStationScores([])
    setMode(null)
    setFolderYear(null)
    setFolderBlock(null)
    loadData()
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isUrgent = timeLeft <= 60

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    )
  }

  // Finished screen
  if (finished) {
    const grade25 = stationScores.length > 0
      ? ((stationScores.reduce((a, b) => a + b, 0) / stationScores.length) * 25)
      : 0
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Station Complete!</h2>
          <p className="text-slate-400 mb-8">You've completed all {stationScores.length} stations</p>

          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
            <div className="text-5xl font-bold text-cyan-400 mb-1">{grade25.toFixed(1)} / 25</div>
            <p className="text-slate-400 text-sm">Weighted grade across all stations</p>
            <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                style={{ width: `${(grade25 / 25) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-4 mb-6 max-h-72 overflow-y-auto text-left">
            <p className="text-slate-500 text-xs uppercase tracking-wider font-medium mb-3 px-1">Per-station breakdown</p>
            <div className="space-y-1.5">
              {stations.map((s, i) => {
                const ratio = stationScores[i] ?? 0
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg bg-slate-800/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-[10px] font-bold border ${ratioColor(ratio)}`}>
                        {i + 1}
                      </span>
                      <span className="text-slate-300 text-xs truncate">{(s.subjects as Subject | undefined)?.name || 'Station'}</span>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${ratio === 1 ? 'text-emerald-400' : ratio === 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      {Math.round(ratio * 100)}%
                    </span>
                  </div>
                )
              })}
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
      </div>
    )
  }

  // Setup screen
  if (!started) {
    const withYear = subjects.filter(s => s.year != null)
    const years = [...new Set(withYear.map(s => s.year as number))].sort()
    const blocksForYear = folderYear !== null
      ? [...new Set(withYear.filter(s => s.year === folderYear).map(s => s.block ?? 'General'))].sort()
      : []
    const randomCount = (folderYear !== null && folderBlock !== null)
      ? allQuestions.filter(q => subjects.some(s => s.id === q.subject_id && s.year === folderYear && (s.block ?? 'General') === folderBlock)).length
      : 0
    const customCount = allQuestions.filter(q => customSelected.has(q.subject_id)).length

    // Group subjects by Year > Block so same-named subjects from different
    // blocks (which look like duplicates in a flat list) are distinguishable.
    const customGroups = (() => {
      const groups = new Map<string, { label: string; subjects: typeof subjects }>()
      for (const s of subjects) {
        const key = `${s.year ?? 'x'}|${s.block ?? ''}`
        const label = s.year != null ? `${yearLabel(s.year)}${s.block ? ` · ${s.block}` : ''}` : 'Other'
        if (!groups.has(key)) groups.set(key, { label, subjects: [] })
        groups.get(key)!.subjects.push(s)
      }
      return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
    })()

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

          {/* Mode picker */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => { setMode('random'); setFolderYear(null); setFolderBlock(null) }}
              className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${mode === 'random' ? 'bg-cyan-500/15 border-cyan-500/50' : 'bg-slate-900/60 border-slate-700/40 hover:border-slate-600'}`}
            >
              <Shuffle className="w-5 h-5 text-cyan-400" />
              <div className="text-left">
                <p className="font-semibold text-white text-sm">Random by Block</p>
                <p className="text-slate-500 text-xs">25 mixed stations</p>
              </div>
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${mode === 'custom' ? 'bg-cyan-500/15 border-cyan-500/50' : 'bg-slate-900/60 border-slate-700/40 hover:border-slate-600'}`}
            >
              <ListChecks className="w-5 h-5 text-cyan-400" />
              <div className="text-left">
                <p className="font-semibold text-white text-sm">Choose Subjects</p>
                <p className="text-slate-500 text-xs">Pick exactly what to study</p>
              </div>
            </button>
          </div>

          {mode === 'random' && (
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-4">Choose a Year &amp; Block</h3>
              {folderYear === null && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {years.map(yr => (
                    <button key={yr} onClick={() => setFolderYear(yr)}
                      className="group bg-slate-800/60 border border-slate-700/40 hover:border-cyan-500/40 rounded-xl p-4 text-left transition-all">
                      <Folder className="w-5 h-5 text-cyan-400 mb-2 group-hover:hidden" />
                      <FolderOpen className="w-5 h-5 text-cyan-400 mb-2 hidden group-hover:block" />
                      <p className="font-medium text-white text-sm">{yearLabel(yr)}</p>
                    </button>
                  ))}
                </div>
              )}
              {folderYear !== null && folderBlock === null && (
                <div>
                  <button onClick={() => setFolderYear(null)} className="text-xs text-slate-400 hover:text-cyan-400 mb-3 inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Years
                  </button>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {blocksForYear.map(blk => (
                      <button key={blk} onClick={() => setFolderBlock(blk)}
                        className="group bg-slate-800/60 border border-slate-700/40 hover:border-cyan-500/40 rounded-xl p-4 text-left transition-all">
                        <Folder className="w-5 h-5 text-violet-400 mb-2 group-hover:hidden" />
                        <FolderOpen className="w-5 h-5 text-violet-400 mb-2 hidden group-hover:block" />
                        <p className="font-medium text-white text-sm">{blk}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {folderYear !== null && folderBlock !== null && (
                <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{yearLabel(folderYear)} · {folderBlock}</p>
                    <p className="text-slate-500 text-xs">{randomCount} question(s) available, up to {MAX_STATIONS} stations</p>
                  </div>
                  <button onClick={() => setFolderBlock(null)} className="text-xs text-cyan-400 hover:text-cyan-300">Change</button>
                </div>
              )}
            </div>
          )}

          {mode === 'custom' && (
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-4">Select Subjects</h3>
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {customGroups.map(group => (
                  <div key={group.label}>
                    <p className="text-slate-500 text-xs uppercase tracking-wider font-medium mb-2">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.subjects.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setCustomSelected(prev => {
                            const next = new Set(prev)
                            if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                            return next
                          })}
                          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                            customSelected.has(s.id) ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>{s.icon}</span> {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-3">{customCount} question(s) available, up to {MAX_STATIONS} stations</p>
            </div>
          )}

          <button
            onClick={startSimulation}
            disabled={
              mode === null ||
              (mode === 'random' && (folderYear === null || folderBlock === null || randomCount === 0)) ||
              (mode === 'custom' && (customSelected.size === 0 || customCount === 0))
            }
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-lg transition-all shadow-lg shadow-cyan-500/20"
          >
            <Play className="w-5 h-5" /> Start Simulation
          </button>
        </div>
      </div>
    )
  }

  // Simulation screen
  if (!currentQ) return null

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
            onClick={() => { if (timerRef.current) clearInterval(timerRef.current); if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY); setRunning(false); setStarted(false) }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Station {currentIdx + 1} of {stations.length}</span>
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
                style={{ width: `${((currentIdx) / stations.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Station-by-station right/wrong overview, updates live as you go */}
        <div className="max-w-3xl mx-auto px-4 pb-3 flex flex-wrap gap-1.5">
          {stations.map((_, i) => {
            const done = i < stationScores.length
            const isCurrent = i === currentIdx
            const ratio = done ? stationScores[i] : (isCurrent ? currentRatio : 0)
            const colorClass = done || isCurrent ? ratioColor(ratio) : 'bg-slate-800 text-slate-500 border-slate-700'
            return (
              <span
                key={i}
                title={`Station ${i + 1}${done ? ` — ${Math.round(ratio * 100)}%` : ''}`}
                className={`w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-bold border ${colorClass} ${isCurrent ? 'ring-2 ring-cyan-400' : ''}`}
              >
                {i + 1}
              </span>
            )
          })}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Subject badge + ratio badge */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {currentQ.subjects && (
              <>
                <span className="text-xl">{(currentQ.subjects as Subject).icon}</span>
                <span className="text-sm text-slate-400">{(currentQ.subjects as Subject).name}</span>
              </>
            )}
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              Station {currentIdx + 1}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ratioColor(currentRatio)}`}>
              {subAnswers.filter(a => a === true).length} / {subAnswers.length} correct
            </span>
          </div>

          {/* AUTO-MATCHED slide image from uploaded lectures */}
          {(() => {
            const img = currentQ.image_url || findBestImage(currentQ.question_text, currentQ.answer || '', currentQ.hint || '', lecturePages)
            if (!img) return null
            const crop = currentQ.image_url ? currentQ.image_crop : null
            return (
              <div className="mb-4 rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800 relative">
                {crop ? (
                  <CroppedImage src={img} crop={crop} alt={`Slide for station ${currentQ.station_number}`} />
                ) : (
                  <img
                    src={img}
                    alt={`Slide for station ${currentQ.station_number}`}
                    className="w-full object-contain max-h-72"
                    loading="lazy"
                  />
                )}
              </div>
            )
          })()}

          {/* Question text */}
          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 mb-4">
            <p className="text-slate-100 text-base leading-relaxed whitespace-pre-line"><AmbossText text={currentQ.question_text} /></p>
          </div>

          {/* Hint */}
          {showHint && currentQ.hint && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 mb-4 answer-reveal">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Hint</span>
              </div>
              <p className="text-amber-100/80 text-sm leading-relaxed"><AmbossText text={currentQ.hint} /></p>
            </div>
          )}

          {/* Answer */}
          {showAnswer && currentQ.answer && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5 mb-4 answer-reveal">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Model Answer — check yourself below</span>
              </div>
              <p className="text-cyan-100/90 text-sm leading-relaxed whitespace-pre-line"><AmbossText text={currentQ.answer} /></p>
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

          {/* Sub-question grading */}
          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-5 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-xs uppercase tracking-wider font-medium">
                {currentQ.sub_questions?.length ? `Sub-questions (${currentQ.sub_questions.length})` : 'How did you do?'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSubAnswers(new Array(subCount).fill(true))}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" /> Got it all
                </button>
                <button
                  onClick={() => setSubAnswers(new Array(subCount).fill(false))}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
                >
                  <XCircle className="w-3 h-3" /> Don't know any
                </button>
              </div>
            </div>

            {currentQ.sub_questions?.length ? (
              currentQ.sub_questions.map((sq, idx) => (
                <div key={idx} className="border-l-2 border-slate-700 pl-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-cyan-300 text-xs font-medium">{sq.label}</p>
                      <p className="text-slate-300 text-sm"><AmbossText text={sq.question} /></p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {sq.answer && (
                        <button
                          onClick={() => setRevealedSubs(prev => prev.map((r, i) => i === idx ? !r : r))}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            revealedSubs[idx] ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-400 hover:text-cyan-300'
                          }`}
                        >
                          {revealedSubs[idx] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )}
                      <button
                        onClick={() => setSubAnswers(prev => prev.map((a, i) => i === idx ? false : a))}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          subAnswers[idx] === false ? 'bg-red-500/30 text-red-300 border border-red-500/50' : 'bg-slate-800 text-slate-400 hover:bg-red-500/10'
                        }`}
                      >✗</button>
                      <button
                        onClick={() => setSubAnswers(prev => prev.map((a, i) => i === idx ? true : a))}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          subAnswers[idx] === true ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' : 'bg-slate-800 text-slate-400 hover:bg-emerald-500/10'
                        }`}
                      >✓</button>
                    </div>
                  </div>
                  {revealedSubs[idx] && sq.answer && (
                    <div className="mt-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
                      <p className="text-cyan-100/90 text-xs leading-relaxed whitespace-pre-line"><AmbossText text={sq.answer} /></p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                {showAnswer && currentQ.answer && (
                  <p className="text-cyan-100/80 text-sm whitespace-pre-line"><AmbossText text={currentQ.answer} /></p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setSubAnswers([false])}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      subAnswers[0] === false ? 'bg-red-500/30 text-red-300 border-2 border-red-500/50' : 'bg-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-300 border-2 border-transparent'
                    }`}
                  >✗ Missed it</button>
                  <button
                    onClick={() => setSubAnswers([true])}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      subAnswers[0] === true ? 'bg-emerald-500/30 text-emerald-300 border-2 border-emerald-500/50' : 'bg-slate-800 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-300 border-2 border-transparent'
                    }`}
                  >✓ Got it!</button>
                </div>
              </>
            )}
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
              {currentIdx === stations.length - 1 ? 'Finish' : 'Next Station'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
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
