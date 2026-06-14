'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, Settings, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react'

type Step = { label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string }

export default function SetupPage() {
  const [serviceKey, setServiceKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; steps: string[]; errors: string[] } | null>(null)
  const [copied, setCopied] = useState(false)

  const runSetup = async () => {
    if (!serviceKey.trim()) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch(`/api/setup?key=${encodeURIComponent(serviceKey)}`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({
        success: false,
        message: 'Network error: ' + String(e),
        steps: [],
        errors: [String(e)],
      })
    }
    setLoading(false)
  }

  const copyKey = () => {
    navigator.clipboard.writeText(serviceKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Settings className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">One-Click Setup</h1>
          <p className="text-slate-400 text-sm">Set up your database automatically — no SQL editor needed</p>
        </div>

        {!result && (
          <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6">
            {/* Instructions */}
            <div className="mb-6 space-y-3">
              <h3 className="font-semibold text-white text-sm">3 steps to get started:</h3>
              {[
                { n: 1, text: 'Create a free project at', link: 'https://supabase.com', linkText: 'supabase.com' },
                { n: 2, text: 'Go to Project Settings → API → copy the "service_role" secret key' },
                { n: 3, text: 'Paste it below and click Run Setup' },
              ].map(s => (
                <div key={s.n} className="flex items-start gap-3">
                  <span className="w-5 h-5 bg-cyan-500 rounded-full text-xs text-white flex items-center justify-center shrink-0 mt-0.5 font-bold">{s.n}</span>
                  <p className="text-slate-300 text-sm">
                    {s.text}{' '}
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-1">
                        {s.linkText} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-200/80 text-xs">
                The service_role key has full database access. Only use it here during setup — it never gets saved.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Supabase Service Role Key
                </label>
                <input
                  type="password"
                  value={serviceKey}
                  onChange={e => setServiceKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                />
              </div>

              <button
                onClick={runSetup}
                disabled={loading || !serviceKey.trim()}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your database...</>
                ) : (
                  <><Settings className="w-4 h-4" /> Run Setup</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <div className={`border rounded-2xl p-5 ${
              result.success
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                {result.success
                  ? <CheckCircle className="w-6 h-6 text-emerald-400" />
                  : <AlertCircle className="w-6 h-6 text-amber-400" />
                }
                <p className={`font-bold ${result.success ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {result.message}
                </p>
              </div>

              {result.steps.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {result.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-slate-300">{step.replace('✓ ', '')}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-700/50">
                  <p className="text-xs font-medium text-slate-400 mb-2">Warnings / Errors:</p>
                  {result.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span className="text-slate-400">{err.replace('✗ ', '').replace('⚠ ', '')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result.success && (
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-5 text-center">
                <p className="text-slate-300 text-sm mb-4">
                  Also make sure you have set your Supabase URL and anon key as environment variables in Vercel:
                </p>
                <div className="bg-slate-800 rounded-xl p-3 text-left font-mono text-xs text-slate-300 mb-4">
                  <p>NEXT_PUBLIC_SUPABASE_URL</p>
                  <p>NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
                </div>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all"
                >
                  Go to the App →
                </a>
              </div>
            )}

            {!result.success && (
              <button
                onClick={() => setResult(null)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        )}

        <p className="text-center text-slate-700 text-xs mt-6">Made by Dr. Alhassan #44 · OSPE Study Helper</p>
      </div>
    </div>
  )
}
