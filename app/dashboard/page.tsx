'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Subject } from '@/types'
import { ADMIN_EMAIL } from '@/lib/admin'
import { BookOpen, LogOut, Clock, Trophy, Upload, ChevronRight, Microscope, TrendingUp, Folder, FolderOpen, ArrowLeft, RotateCcw, Languages } from 'lucide-react'
import Link from 'next/link'
import { getShowTranslate, setShowTranslate } from '@/lib/translateBus'

interface SubjectStats extends Subject {
  total: number
  answered: number
}

function SubjectCard({ subject, getSubjectBg, getProgressColor }: {
  subject: SubjectStats
  getSubjectBg: (color: string) => string
  getProgressColor: (color: string) => string
}) {
  const percent = subject.total > 0 ? Math.round((subject.answered / subject.total) * 100) : 0
  return (
    <Link
      href={`/subjects/${subject.id}`}
      className={`press-scale group relative block bg-gradient-to-br ${getSubjectBg(subject.color)} border rounded-xl p-5 shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl leading-none">{subject.icon}</span>
        <span className="font-[family-name:var(--font-mono)] tabular-nums text-xs font-medium text-slate-300 bg-slate-900/50 border border-white/10 px-2 py-0.5 rounded-md">
          {subject.answered}/{subject.total}
        </span>
      </div>
      <h4 className="font-bold text-white">{subject.name}</h4>
      {subject.description && <p className="text-slate-400 text-xs mt-1 line-clamp-2">{subject.description}</p>}
      {/* Fill animates via transform: scaleX instead of width — both transform/opacity stay
          GPU-only, and the parent's overflow-hidden + rounded-full clip the scaled fill cleanly.
          700ms ease-in-out is the documented progress-fill exception (constant/moving-on-screen). */}
      <div className="h-1.5 bg-slate-900/40 rounded-md overflow-hidden mt-3">
        <div
          className={`h-full w-full ${getProgressColor(subject.color)} rounded-md origin-left transition-transform duration-700`}
          style={{ transform: `scaleX(${percent / 100})`, transitionTimingFunction: 'var(--ease-in-out-strong)' }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="font-[family-name:var(--font-mono)] tabular-nums text-slate-500 text-xs">{subject.total} question(s)</span>
        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const [subjects, setSubjects] = useState<SubjectStats[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [totalStats, setTotalStats] = useState({ total: 0, answered: 0 })
  const [folderYear, setFolderYear] = useState<number | 'other' | null>(null)
  const [folderBlock, setFolderBlock] = useState<string | null>(null)
  const [showManage, setShowManage] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [translateOn, setTranslateOn] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { setTranslateOn(getShowTranslate()) }, [])

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }

    setUser({
      email: session.user.email || '',
      name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Student',
    })
    setUserId(session.user.id)

    const [{ data: subjectsData }, { data: questionsData }, { data: progressData }] = await Promise.all([
      supabase.from('subjects').select('*').order('year').order('block').order('display_order'),
      supabase.from('questions').select('id, subject_id'),
      supabase.from('user_progress').select('question_id, answered').eq('user_id', session.user.id),
    ])

    if (subjectsData && questionsData) {
      const answeredSet = new Set(
        (progressData || []).filter(p => p.answered).map(p => p.question_id)
      )

      const stats = subjectsData.map(s => {
        const subjectQs = questionsData.filter(q => q.subject_id === s.id)
        return {
          ...s,
          total: subjectQs.length,
          answered: subjectQs.filter(q => answeredSet.has(q.id)).length,
        }
      })

      setSubjects(stats)
      setTotalStats({
        total: questionsData.length,
        answered: answeredSet.size,
      })
    }
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const handleResetAllProgress = async () => {
    if (!userId) return
    if (!confirm('Reset ALL your progress across every subject and start again? This can\'t be undone.')) return
    const { error } = await supabase.from('user_progress').delete().eq('user_id', userId)
    if (error) { alert(`Reset failed: ${error.message}`); return }
    setSubjects(prev => prev.map(s => ({ ...s, answered: 0 })))
    setTotalStats(prev => ({ ...prev, answered: 0 }))
  }

  const getSubjectBg = (color: string) => {
    const map: Record<string, string> = {
      '#0891b2': 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
      '#7c3aed': 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
      '#dc2626': 'from-red-500/20 to-red-600/10 border-red-500/30',
      '#059669': 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
      '#d97706': 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
      '#0284c7': 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
      '#9333ea': 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
    }
    return map[color] || 'from-slate-500/20 to-slate-600/10 border-slate-500/30'
  }

  const getProgressColor = (color: string) => {
    const map: Record<string, string> = {
      '#0891b2': 'bg-cyan-500',
      '#7c3aed': 'bg-violet-500',
      '#dc2626': 'bg-red-500',
      '#059669': 'bg-emerald-500',
      '#d97706': 'bg-amber-500',
      '#0284c7': 'bg-cyan-500',
      '#9333ea': 'bg-violet-500',
    }
    return map[color] || 'bg-slate-500'
  }

  const yearLabel = (y: number) => y === 1 ? '1st Year' : y === 2 ? '2nd Year' : y === 3 ? '3rd Year' : `${y}th Year`

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e]">
        <nav className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Microscope className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-sm">OSPE Study Helper</h1>
                <p className="text-slate-500 text-xs">IMS Medical Sciences</p>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8 space-y-2">
            <div className="h-7 w-64 rounded-md bg-white/5 animate-pulse" />
            <div className="h-4 w-48 rounded-md bg-white/5 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-slate-900/60 border border-white/10 rounded-xl p-4 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="w-9 h-9 bg-white/5 rounded-lg mb-3" />
                <div className="h-7 w-16 bg-white/5 rounded-md mb-2" />
                <div className="h-3 w-20 bg-white/5 rounded-md" />
              </div>
            ))}
          </div>
          <div className="h-24 bg-slate-900/60 border border-white/10 rounded-xl mb-8 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="bg-slate-900/60 border border-white/10 rounded-xl p-5 h-32 animate-pulse" style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }} />
            ))}
          </div>
        </main>
      </div>
    )
  }

  const overallPercent = totalStats.total > 0 ? Math.round((totalStats.answered / totalStats.total) * 100) : 0

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Navbar */}
      <nav className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Microscope className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm">OSPE Study Helper</h1>
              <p className="text-slate-500 text-xs">IMS Medical Sciences</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-white text-sm font-medium">{user?.name}</p>
              <p className="text-slate-500 text-xs">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="press-scale flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm transition-colors duration-150"
              style={{ transitionTimingFunction: 'var(--ease-out-strong)' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome + Stats */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">Welcome back, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-slate-400 text-sm">Continue your OSPE preparation</p>
        </div>

        {/* Overall stats */}
        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="clinical-overlay absolute inset-0 -z-10 rounded-2xl opacity-60" />
          {[
            { label: 'Total Questions', value: totalStats.total, icon: BookOpen, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { label: 'Answered', value: totalStats.answered, icon: Trophy, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Progress', value: `${overallPercent}%`, icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
          ].map((s, i) => (
            <div
              key={s.label}
              className="bg-slate-900/60 border border-white/10 rounded-xl p-4 shadow-[0_2px_12px_rgba(2,8,23,0.5)] animate-fade-rise-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center mb-3`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="font-[family-name:var(--font-mono)] tabular-nums text-2xl font-bold text-white">{s.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
              {s.label === 'Answered' && subjects.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5 space-y-1 max-h-28 overflow-y-auto pr-1">
                  {subjects.map(subj => (
                    <div key={subj.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400 truncate flex items-center gap-1">
                        <span>{subj.icon}</span> {subj.name}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] tabular-nums text-slate-500 shrink-0">
                        {subj.answered}/{subj.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <button
            onClick={() => { const next = !translateOn; setTranslateOn(next); setShowTranslate(next) }}
            className="press-scale flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-300 bg-slate-900/60 border border-white/10 rounded-md px-3 py-1.5 transition-colors"
          >
            <Languages className="w-3.5 h-3.5" />
            Translate buttons
            <span className={`w-7 h-4 rounded-full relative transition-colors ${translateOn ? 'bg-cyan-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150 ${translateOn ? 'translate-x-3' : 'translate-x-0'}`} />
            </span>
          </button>

          {user?.email === ADMIN_EMAIL && (
            <button onClick={() => setShowManage(v => !v)} className="press-scale text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded-md px-3 py-1.5 transition-colors">
              {showManage ? 'Hide subject manager' : 'Manage subjects'}
            </button>
          )}
        </div>

        {/* Admin: flat subject manager — delete any subject without drilling into folders */}
        {showManage && user?.email === ADMIN_EMAIL && (
          <div className="bg-slate-900/60 border border-amber-500/30 rounded-xl p-5 mb-8 animate-fade-rise-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Manage Subjects</h3>
              <button onClick={() => setShowManage(false)} className="text-slate-500 hover:text-white text-xs press-scale">Close</button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {subjects.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-slate-800/50 border border-white/5 rounded-md px-3 py-2.5">
                  <span>{s.icon}</span>
                  <span className="text-sm text-white truncate">{s.name}</span>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums text-xs text-slate-500 shrink-0">
                    {s.year != null ? `Y${s.year}` : '—'}{s.block ? ` · ${s.block}` : ''} · {s.total} q
                  </span>
                </div>
              ))}
              {subjects.length === 0 && <p className="text-slate-500 text-sm">No subjects yet.</p>}
            </div>
          </div>
        )}

        {/* Overall progress bar */}
        <div className="bg-slate-900/60 border border-white/10 rounded-xl p-5 mb-8 shadow-[0_2px_12px_rgba(2,8,23,0.5)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Overall Progress</span>
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-sm font-bold text-cyan-400">{totalStats.answered} / {totalStats.total}</span>
          </div>
          {/* Fill animates via transform: scaleX (GPU-only) instead of width; the parent's
              overflow-hidden + rounded-full clip the scaled fill cleanly. 700ms ease-in-out is
              the documented progress-fill exception to the 300ms UI cap. */}
          <div className="h-2 bg-slate-800 rounded-md overflow-hidden">
            <div
              className="h-full w-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-md origin-left transition-transform duration-700"
              style={{ transform: `scaleX(${overallPercent / 100})`, transitionTimingFunction: 'var(--ease-in-out-strong)' }}
            />
          </div>
          <button
            onClick={handleResetAllProgress}
            className="mt-4 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-red-500/15 hover:text-red-300 transition-colors press-scale"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset all progress
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Link
            href="/simulation"
            className="press-scale group bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 hover:border-cyan-400/50 rounded-xl p-6 shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">5-min Station Simulation</h3>
                <p className="text-slate-400 text-sm">Timed OSPE exam experience</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 ml-auto group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {user?.email === ADMIN_EMAIL && (
            <Link
              href="/admin"
              className="press-scale group bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/30 hover:border-amber-400/50 rounded-xl p-6 shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/10"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Admin Import</h3>
                  <p className="text-slate-400 text-sm">Bulk upload curriculum PDFs</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 ml-auto group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          )}
        </div>

        {/* Subjects browsed as folders: Year > Block > Subject */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Study by Subject</h3>
            {(folderYear !== null) && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <button onClick={() => { setFolderYear(null); setFolderBlock(null) }} className="hover:text-cyan-400 transition-colors flex items-center gap-1 press-scale">
                  <ArrowLeft className="w-3 h-3" /> All Years
                </button>
                {folderBlock !== null && (
                  <>
                    <span className="text-slate-600">/</span>
                    <button onClick={() => setFolderBlock(null)} className="hover:text-cyan-400 transition-colors press-scale">
                      {folderYear === 'other' ? 'Other' : yearLabel(folderYear)}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {(() => {
            const withYear = subjects.filter(s => s.total > 0 && s.year != null)
            const noYear = subjects.filter(s => s.total > 0 && s.year == null)
            const years = [...new Set(withYear.map(s => s.year as number))].sort()

            // Level 1: year folders
            if (folderYear === null) {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {years.map((yr, i) => {
                    const yearSubjects = withYear.filter(s => s.year === yr)
                    const total = yearSubjects.reduce((a, s) => a + s.total, 0)
                    const answered = yearSubjects.reduce((a, s) => a + s.answered, 0)
                    return (
                      <button key={yr} onClick={() => setFolderYear(yr)}
                        className="press-scale group bg-slate-900/60 border border-white/10 hover:border-cyan-500/40 rounded-xl p-5 text-left shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10 animate-fade-rise-in"
                        style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                        <Folder className="w-7 h-7 text-cyan-400 mb-3 group-hover:hidden" />
                        <FolderOpen className="w-7 h-7 text-cyan-400 mb-3 hidden group-hover:block" />
                        <h4 className="font-bold text-white">{yearLabel(yr)}</h4>
                        <p className="text-slate-500 text-xs mt-1">{yearSubjects.length} subject(s) · <span className="font-[family-name:var(--font-mono)] tabular-nums">{answered}/{total}</span> done</p>
                      </button>
                    )
                  })}
                  {noYear.length > 0 && (
                    <button onClick={() => setFolderYear('other')}
                      className="press-scale group bg-slate-900/60 border border-white/10 hover:border-slate-500/40 rounded-xl p-5 text-left shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10 animate-fade-rise-in"
                      style={{ animationDelay: `${Math.min(years.length * 40, 320)}ms` }}>
                      <Folder className="w-7 h-7 text-slate-400 mb-3 group-hover:hidden" />
                      <FolderOpen className="w-7 h-7 text-slate-400 mb-3 hidden group-hover:block" />
                      <h4 className="font-bold text-white">Other Subjects</h4>
                      <p className="text-slate-500 text-xs mt-1">{noYear.length} subject(s)</p>
                    </button>
                  )}
                </div>
              )
            }

            // "Other" folder — no blocks, straight to subjects
            if (folderYear === 'other') {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {noYear.map((s, i) => (
                    <div key={s.id} className="animate-fade-rise-in" style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                      <SubjectCard subject={s} getSubjectBg={getSubjectBg} getProgressColor={getProgressColor} />
                    </div>
                  ))}
                </div>
              )
            }

            const yearSubjects = withYear.filter(s => s.year === folderYear)
            const blocks = [...new Set(yearSubjects.map(s => s.block ?? 'General'))].sort()

            // Level 2: block folders
            if (folderBlock === null) {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {blocks.map((blk, i) => {
                    const blockSubjects = yearSubjects.filter(s => (s.block ?? 'General') === blk)
                    const total = blockSubjects.reduce((a, s) => a + s.total, 0)
                    const answered = blockSubjects.reduce((a, s) => a + s.answered, 0)
                    return (
                      <button key={blk} onClick={() => setFolderBlock(blk)}
                        className="press-scale group bg-slate-900/60 border border-white/10 hover:border-cyan-500/40 rounded-xl p-5 text-left shadow-[0_2px_12px_rgba(2,8,23,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10 animate-fade-rise-in"
                        style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                        <Folder className="w-7 h-7 text-cyan-400 mb-3 group-hover:hidden" />
                        <FolderOpen className="w-7 h-7 text-cyan-400 mb-3 hidden group-hover:block" />
                        <h4 className="font-bold text-white">{blk}</h4>
                        <p className="text-slate-500 text-xs mt-1">{blockSubjects.length} subject(s) · <span className="font-[family-name:var(--font-mono)] tabular-nums">{answered}/{total}</span> done</p>
                      </button>
                    )
                  })}
                </div>
              )
            }

            // Level 3: subjects in this block
            const blockSubjects = yearSubjects.filter(s => (s.block ?? 'General') === folderBlock)
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {blockSubjects.map((s, i) => (
                  <div key={s.id} className="animate-fade-rise-in" style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                    <SubjectCard subject={s} getSubjectBg={getSubjectBg} getProgressColor={getProgressColor} />
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <p className="text-center text-slate-600 text-xs">Made by Dr. Alhassan #44 · IMS OSPE Study Helper</p>
      </footer>
    </div>
  )
}
