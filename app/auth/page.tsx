'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Mail, Lock, User, AlertCircle, Loader2, Microscope, ArrowRight, HelpCircle, BookOpen, Clock, TrendingUp } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'

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
    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      })
      if (error) setError(error.message)
      else setMessage('Password reset email sent! Check your inbox.')
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
    <div className="min-h-screen bg-[#0A0F1E] relative overflow-hidden flex flex-col">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      {/* Top app bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 border-b border-white/10 bg-[#0A0F1E]/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4cd7f6] to-[#0053db] flex items-center justify-center">
            <Microscope className="w-4 h-4 text-[#003640]" />
          </div>
          <span className="text-lg font-bold text-[#4cd7f6] tracking-tight">OSPE Study Helper</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400 text-sm">
          <span className="hidden md:inline opacity-60">Integrated Medical Sciences Protocol</span>
          <HelpCircle className="w-5 h-5 cursor-help hover:text-[#4cd7f6] transition-colors" />
        </div>
      </header>

      <main className="relative z-10 flex-grow grid grid-cols-1 lg:grid-cols-2 w-full max-w-6xl mx-auto pt-16 px-4 md:px-6">
        {/* Hero Section: Left */}
        <div className="hidden lg:flex flex-col justify-center items-start pr-12 relative overflow-hidden">
          <div className="relative w-full h-[500px]">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-600/5 to-transparent rounded-3xl blur-2xl" />
            {/* Floating info chips */}
            <div className="absolute top-1/4 left-0 bg-[rgba(22,29,47,0.7)] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] p-4 rounded-xl">
              <p className="text-xs text-[#4cd7f6] uppercase tracking-widest mb-1">Active Module</p>
              <p className="text-lg font-semibold text-white">Musculoskeletal Lab</p>
              <p className="text-xs text-slate-400">Anatomy Rotation: Block 02</p>
            </div>
            <div className="absolute bottom-1/4 right-0 bg-[rgba(22,29,47,0.7)] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4cd7f6] animate-pulse" />
                <p className="text-sm text-white">System Status: Synchronized</p>
              </div>
            </div>
          </div>
          <div className="mt-8 space-y-4">
            <h1 className="text-3xl font-bold leading-tight text-white max-w-md">
              Precision Clinical Assessment &amp;{' '}
              <span className="text-[#4cd7f6]">
                OSPE Simulation
              </span>
            </h1>
            <p className="text-slate-400 max-w-sm leading-relaxed">
              Access the industry standard for high-fidelity objective structured clinical examinations. Precision data for the modern resident.
            </p>
          </div>
        </div>

        {/* Auth Card: Right */}
        <div className="flex flex-col justify-center items-center py-12 w-full">
          <div className="w-full max-w-md">
            <div className="bg-[rgba(22,29,47,0.7)] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] w-full rounded-2xl overflow-hidden p-8 transition-shadow duration-300 hover:shadow-2xl hover:shadow-cyan-500/5 animate-modal-in">
              {/* Card Header */}
              <div className="text-center mb-8">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4cd7f6] to-[#0053db] items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                  <Microscope className="w-8 h-8 text-[#003640]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">OSPE Study Helper</h2>
                <p className="text-xs font-medium text-[#4cd7f6] tracking-widest uppercase opacity-80">
                  IMS — Integrated Medical Sciences
                </p>
              </div>

              {/* Tabs */}
              {mode !== 'forgot' ? (
                <div className="relative flex border-b border-white/10 mb-8">
                  {(['login', 'signup'] as Mode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setError(null); setMessage(null) }}
                      className={`flex-1 py-3 text-sm font-medium transition-colors duration-200 ${
                        mode === m
                          ? 'text-[#4cd7f6]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m === 'login' ? 'Sign In' : 'Sign Up'}
                    </button>
                  ))}
                  <span
                    className="absolute bottom-0 left-0 w-1/2 h-0.5 bg-[#4cd7f6] transition-transform duration-200"
                    style={{
                      transform: mode === 'signup' ? 'translateX(100%)' : 'translateX(0%)',
                      transitionTimingFunction: 'var(--ease-out-strong)',
                    }}
                  />
                </div>
              ) : (
                <h2 className="text-white font-semibold text-lg mb-6 animate-fade-rise-in">Reset Password</h2>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {mode === 'signup' && (
                  <div className="space-y-2 animate-fade-rise-in">
                    <label className="block text-xs font-medium text-slate-400 ml-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        required
                        placeholder="Dr. Ahmed Al-Farsi"
                        className="w-full bg-[#0A0F1E] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4cd7f6]/50 focus:border-[#4cd7f6] transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-400 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="student@university.edu.sa"
                      className="w-full bg-[#0A0F1E] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4cd7f6]/50 focus:border-[#4cd7f6] transition-all"
                    />
                  </div>
                </div>

                {mode !== 'forgot' && (
                  <div className="space-y-2 animate-fade-rise-in">
                    <div className="flex justify-between items-center px-1">
                      <label className="block text-xs font-medium text-slate-400">Password</label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => { setMode('forgot'); setError(null); setMessage(null) }}
                          className="text-xs text-[#4cd7f6] hover:underline transition-colors"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Minimum 6 characters"
                        className="w-full bg-[#0A0F1E] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4cd7f6]/50 focus:border-[#4cd7f6] transition-all"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 animate-fade-rise-in">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                {message && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 animate-fade-rise-in">
                    <p className="text-green-400 text-xs">{message}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="press-scale w-full bg-gradient-to-br from-[#4cd7f6] to-[#0053db] text-[#003640] font-semibold py-4 rounded-xl shadow-xl shadow-cyan-500/10 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2 animate-fade-rise-in">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {mode === 'login' ? 'Signing in...' : mode === 'forgot' ? 'Sending...' : 'Creating account...'}
                    </span>
                  ) : (
                    <>
                      {mode === 'login' ? 'Sign In' : mode === 'forgot' ? 'Send Reset Email' : 'Create Account'}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center space-y-2">
                <p className="text-slate-500 text-xs">
                  {mode === 'forgot' ? 'Remember it? ' : mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setMessage(null) }}
                    className="text-[#4cd7f6] hover:text-cyan-300 font-medium transition-colors"
                  >
                    {mode === 'forgot' ? 'Sign in' : mode === 'login' ? 'Sign up free' : 'Sign in'}
                  </button>
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                { icon: BookOpen, label: 'All Subjects' },
                { icon: Clock, label: '5-min Stations' },
                { icon: TrendingUp, label: 'Track Progress' },
              ].map((f, i) => (
                <div
                  key={f.label}
                  className="bg-[rgba(22,29,47,0.7)] border border-white/10 rounded-xl p-3 text-center animate-fade-rise-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <f.icon className="w-5 h-5 text-[#4cd7f6] mx-auto mb-1.5" />
                  <p className="text-slate-400 text-xs">{f.label}</p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <p className="text-center text-slate-600 text-xs mt-6">Made by Dr. Alhassan #44</p>
          </div>
        </div>
      </main>
    </div>
  )
}
