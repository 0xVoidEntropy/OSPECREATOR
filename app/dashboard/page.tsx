'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Subject } from '@/types'
import { BookOpen, LogOut, Clock, Trophy, Target, Upload, ChevronRight, Microscope, TrendingUp } from 'lucide-react'
import Link from 'next/link'

interface SubjectStats extends Subject {
  total: number
  answered: number
}

export default function Dashboard() {
  const [subjects, setSubjects] = useState<SubjectStats[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [totalStats, setTotalStats] = useState({ total: 0, answered: 0 })
  const router = useRouter()
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }

    setUser({
      email: session.user.email || '',
      name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Student',
    })

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

  const getSubjectBg = (color: string) => {
    const map: Record<string, string> = {
      '#0891b2': 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
      '#7c3aed': 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
      '#dc2626': 'from-red-500/20 to-red-600/10 border-red-500/30',
      '#059669': 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
      '#d97706': 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
      '#0284c7': 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
      '#9333ea': 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
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
      '#0284c7': 'bg-blue-500',
      '#9333ea': 'bg-purple-500',
    }
    return map[color] || 'bg-slate-500'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading your dashboard...</p>
        </div>
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
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm transition-colors"
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Questions', value: totalStats.total, icon: BookOpen, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { label: 'Answered', value: totalStats.answered, icon: Trophy, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Progress', value: `${overallPercent}%`, icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Subjects', value: subjects.length, icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-4">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Overall progress bar */}
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Overall Progress</span>
            <span className="text-sm font-bold text-cyan-400">{totalStats.answered} / {totalStats.total}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Link
            href="/simulation"
            className="group bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 hover:border-cyan-400/50 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/10"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">5-min Station Simulation</h3>
                <p className="text-slate-400 text-sm">Timed OSPE exam experience</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 ml-auto group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            href="/upload"
            className="group bg-gradient-to-r from-violet-500/20 to-purple-600/20 border border-violet-500/30 hover:border-violet-400/50 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/10"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Upload Lecture</h3>
                <p className="text-slate-400 text-sm">Add PDFs & study materials</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 ml-auto group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Subjects grouped by Year and Block */}
        <div className="space-y-8">
          <h3 className="text-lg font-bold text-white">Study by Subject</h3>
          {(() => {
            const withYear = subjects.filter(s => s.total > 0 && s.year != null)
            const noYear = subjects.filter(s => s.total > 0 && s.year == null)

            const years = [...new Set(withYear.map(s => s.year as number))].sort()

            const SubjectCard = ({ subject }: { subject: SubjectStats }) => {
              const pct = subject.total > 0 ? Math.round((subject.answered / subject.total) * 100) : 0
              return (
                <Link
                  href={`/subjects/${subject.id}`}
                  className={`group bg-gradient-to-br ${getSubjectBg(subject.color)} border rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-2xl">{subject.icon}</span>
                    <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded-lg">
                      {subject.answered}/{subject.total}
                    </span>
                  </div>
                  <h4 className="font-bold text-white mb-1">{subject.name}</h4>
                  <p className="text-slate-400 text-xs mb-4 line-clamp-2">{subject.description}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-slate-300 font-medium">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getProgressColor(subject.color)} rounded-full transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-slate-500">{subject.total} questions</span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              )
            }

            const yearLabel = (y: number) => y === 1 ? '1st Year' : y === 2 ? '2nd Year' : '3rd Year'

            return (
              <>
                {years.map(yr => {
                  const yearSubjects = withYear.filter(s => s.year === yr)
                  const blocks = [...new Set(yearSubjects.map(s => s.block ?? ''))].sort()
                  return (
                    <div key={yr}>
                      <h4 className="text-base font-bold text-cyan-400 mb-4">{yearLabel(yr)}</h4>
                      <div className="space-y-6">
                        {blocks.map(blk => {
                          const blockSubjects = yearSubjects.filter(s => (s.block ?? '') === blk)
                          return (
                            <div key={blk}>
                              <p className="text-sm font-semibold text-slate-300 mb-3 pl-1 border-l-2 border-slate-600 pl-3">{blk}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {blockSubjects.map(s => <SubjectCard key={s.id} subject={s} />)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {noYear.length > 0 && (
                  <div>
                    <h4 className="text-base font-bold text-slate-400 mb-4">Other Subjects</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {noYear.map(s => <SubjectCard key={s.id} subject={s} />)}
                    </div>
                  </div>
                )}
              </>
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
