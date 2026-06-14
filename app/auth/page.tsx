'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { BookOpen, Mail, Lock, User, AlertCircle, Loader2, Microscope } from 'lucide-react'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Account created! You can now log in.')
        setMode('login')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e] p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Microscope className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">OSPE Study Helper</h1>
          <p className="text-slate-400 text-sm">IMS — Integrated Medical Sciences</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* Tab switcher */}
          <div className="flex bg-slate-800/50 rounded-xl p-1 mb-6">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setMessage(null) }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                  mode === m
                    ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    placeholder="Dr. Ahmed Al-Farsi"
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="student@university.edu.sa"
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {message && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                <p className="text-green-400 text-xs">{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
              ) : (
                <>{mode === 'login' ? 'Sign In' : 'Create Account'}</>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-500 text-xs">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
                className="text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {mode === 'login' ? 'Sign up free' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { icon: '📚', label: 'All Subjects' },
            { icon: '⏱️', label: '5-min Stations' },
            { icon: '📈', label: 'Track Progress' },
          ].map(f => (
            <div key={f.label} className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{f.icon}</div>
              <p className="text-slate-400 text-xs">{f.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">Made by Dr. Alhassan #44</p>
      </div>
    </div>
  )
}
