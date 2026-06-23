'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'
import { ArrowLeft, Loader2, FolderOpen, ClipboardEdit, Trash2, Database, Info, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'

const PdfProcessor = nextDynamic(() => import('@/components/PdfProcessor'), { ssr: false })

const YEAR_LABELS: Record<number, string> = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year' }
const SUBJECT_COLORS: Record<string, string> = {
  pathology: '#dc2626', histology: '#7c3aed', anatomy: '#0284c7',
  microbiology: '#059669', biochemistry: '#d97706', physiology: '#0891b2',
  pharmacology: '#9333ea', 'community medicine': '#16a34a',
}
const SUBJECT_ICONS: Record<string, string> = {
  pathology: '🔬', histology: '🧬', anatomy: '🦴',
  microbiology: '🦠', biochemistry: '⚗️', physiology: '❤️',
  pharmacology: '💊', 'community medicine': '🏥',
}

interface FileWithSubject { file: File; subject: string; index: number }
interface ProcessingJob { lectureId: string; subjectId: string; fileUrl: string; fileName: string; remainingFiles: FileWithSubject[] }

function detectSubject(relativePath: string): string {
  // path format: BlockFolder/SubjectFolder/file.pdf  or SubjectFolder/file.pdf
  const parts = relativePath.split('/')
  // subject is the folder directly containing the file (second-to-last part)
  const folder = parts.length >= 2 ? parts[parts.length - 2] : ''
  return folder.trim() || 'General'
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number>(3)
  const [block, setBlock] = useState('')
  const [preview, setPreview] = useState<Record<string, string[]>>({}) // subject → filenames
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null)
  const [allLectures, setAllLectures] = useState<{ id: string; title: string; created_at: string; questionCount: number }[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const allFilesRef = useRef<FileWithSubject[]>([])

  const addLog = useCallback((msg: string) => setLog(prev => [...prev, msg]), [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  const loadAllLectures = useCallback(async () => {
    const { data: lectures } = await supabase.from('lectures').select('id, title, created_at').order('created_at', { ascending: false })
    if (!lectures) return
    const { data: counts } = await supabase.from('questions').select('lecture_id')
    const countMap: Record<string, number> = {}
    for (const row of counts || []) {
      if (!row.lecture_id) continue
      countMap[row.lecture_id] = (countMap[row.lecture_id] || 0) + 1
    }
    setAllLectures(lectures.map(l => ({ ...l, questionCount: countMap[l.id] || 0 })))
  }, [supabase])

  useEffect(() => { loadAllLectures() }, [loadAllLectures])

  const deleteLecture = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its questions? This can't be undone.`)) return
    setAllLectures(prev => prev.filter(l => l.id !== id))
    await supabase.from('lectures').delete().eq('id', id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      if (session.user.email !== ADMIN_EMAIL) { router.replace('/dashboard'); return }
      setUserId(session.user.id)
      setAccessToken(session.access_token)
      setLoading(false)
    })
  }, [router, supabase])

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []).filter(f => /\.(pdf|docx)$/i.test(f.name))
    const grouped: Record<string, string[]> = {}
    const withSubject: FileWithSubject[] = rawFiles.map((f, i) => {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const subject = detectSubject(rel)
      grouped[subject] = [...(grouped[subject] || []), f.name]
      return { file: f, subject, index: i }
    })
    allFilesRef.current = withSubject
    setPreview(grouped)
  }

  const getOrCreateSubject = async (name: string, yr: number, blk: string): Promise<string> => {
    const cleanName = name.trim()
    const cleanBlock = blk.trim()
    // Case/whitespace-insensitive match so re-uploading the same subject under a
    // slightly different folder name casing doesn't spawn a duplicate row.
    const { data: existing } = await supabase
      .from('subjects')
      .select('id')
      .ilike('name', cleanName)
      .eq('year', yr)
      .ilike('block', cleanBlock)
      .order('created_at', { ascending: true })
      .limit(1)
    if (existing && existing.length) return existing[0].id
    const key = cleanName.toLowerCase()
    const { data: created, error } = await supabase.from('subjects').insert({
      name: cleanName, year: yr, block: cleanBlock, display_order: 0,
      icon: SUBJECT_ICONS[key] || '📚',
      color: SUBJECT_COLORS[key] || '#0891b2',
      description: `${cleanName} — Year ${yr}, ${cleanBlock} block`,
    }).select('id').single()
    if (error) throw new Error(`Subject creation failed: ${error.message}`)
    return created.id
  }

  const processNext = useCallback(async (remaining: FileWithSubject[]) => {
    if (!remaining.length) {
      addLog('✓ All files complete!')
      setProcessing(false)
      return
    }
    const [next, ...rest] = remaining
    const isDocx = next.file.name.toLowerCase().endsWith('.docx')
    addLog(`[${next.index + 1}] Uploading "${next.file.name}" (${next.subject})…`)
    const path = `lectures/${Date.now()}-${next.file.name}`
    const { error: upErr } = await supabase.storage.from('lectures').upload(path, next.file, {
      contentType: isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
      upsert: true,
    })
    if (upErr) { addLog(`✗ Upload failed: ${upErr.message}`); processNext(rest); return }
    const { data: { publicUrl } } = supabase.storage.from('lectures').getPublicUrl(path)
    try {
      const subjectId = await getOrCreateSubject(next.subject, year, block)
      const { data: lec, error: lecErr } = await supabase.from('lectures').insert({
        subject_id: subjectId, title: next.file.name.replace(/\.(pdf|docx)$/i, ''), file_url: publicUrl, uploaded_by: userId,
      }).select().single()
      if (lecErr || !lec) { addLog(`✗ Record error: ${lecErr?.message}`); processNext(rest); return }

      if (isDocx) {
        addLog(`Parsing Q&A and images from "${next.file.name}"…`)
        const fd = new FormData()
        fd.append('file', next.file)
        fd.append('lectureId', lec.id)
        fd.append('subjectId', subjectId)
        const res = await fetch('/api/extract-docx', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) { addLog(`✗ Parse failed: ${data.error}`); processNext(rest); return }
        addLog(`✓ ${data.count} questions from "${next.file.name}" (${data.entities} entities)`)
        loadAllLectures()
        processNext(rest)
        return
      }

      addLog(`Extracting slides from "${next.file.name}"…`)
      setCurrentJob({ lectureId: lec.id, subjectId, fileUrl: publicUrl, fileName: next.file.name, remainingFiles: rest })
    } catch (err) { addLog(`✗ ${String(err)}`); processNext(rest) }
  }, [supabase, userId, accessToken, year, block, addLog]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSlidesComplete = useCallback(async () => {
    if (!currentJob) return
    const { lectureId, subjectId, fileName, remainingFiles } = currentJob
    setCurrentJob(null)
    addLog(`Generating questions for "${fileName}"…`)
    let total = 0, nextIndex = 0, hasMore = true
    while (hasMore) {
      const res = await fetch('/api/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ lectureId, subjectId, startIndex: nextIndex, batchSize: 1 }),
      })
      const data = await res.json()
      if (!res.ok) { addLog(`✗ Extraction: ${data.error}`); break }
      total += data.count || 0
      hasMore = data.hasMore || false
      nextIndex = data.nextIndex || 0
    }
    addLog(`✓ ${total} questions from "${fileName}"`)
    loadAllLectures()
    processNext(remainingFiles)
  }, [currentJob, accessToken, addLog, processNext, loadAllLectures])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const files = allFilesRef.current
    if (!files.length || !block.trim() || !userId) return
    setProcessing(true)
    setLog([])
    setCurrentJob(null)
    addLog(`Starting import of ${files.length} PDFs across ${Object.keys(preview).length} subject(s)…`)
    processNext(files)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-[#0A0F1E]"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>

  const subjectCount = Object.keys(preview).length
  const fileCount = allFilesRef.current.length

  return (
    <div className="min-h-screen bg-[#0A0F1E]">
      <div className="border-b border-white/10 bg-[#0A0F1E]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-white font-bold">Admin — Curriculum Import</h1>
            <p className="text-slate-500 text-xs">Upload a block folder — subjects auto-detected from subfolders</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: form + progress */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-6 space-y-5 border border-white/10">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Year</label>
                <select value={year} onChange={e => setYear(+e.target.value)} disabled={processing}
                  className="w-full bg-[#161D2F] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors">
                  {[1,2,3].map(y => <option key={y} value={y}>{YEAR_LABELS[y]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Block name</label>
                <input value={block} onChange={e => setBlock(e.target.value)} disabled={processing} required
                  placeholder="e.g. GIT, Respiratory"
                  className="w-full bg-[#161D2F] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Block folder</label>
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors duration-200 group ${subjectCount ? 'border-violet-500/60 bg-violet-500/5' : 'border-violet-500/30 hover:border-violet-500/60'} ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !processing && document.getElementById('folder-input')?.click()}
              >
                <input id="folder-input" type="file" accept=".pdf,.docx"
                  {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                  multiple onChange={handleFolderSelect} className="hidden" disabled={processing} />
                <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mb-3 mx-auto group-hover:scale-110 transition-transform">
                  <FolderOpen className="w-8 h-8 text-violet-400" />
                </div>
                <p className="text-slate-300 text-sm font-medium">Click to select a block folder</p>
                <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">PDFs and .docx Q&amp;A labs both supported — subjects detected automatically from subfolders</p>
              </div>

              {subjectCount > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between animate-fade-rise-in">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Detected {subjectCount} subject(s)</p>
                    <span className="px-3 py-1 bg-violet-500/10 text-violet-300 rounded-full text-xs font-medium">{fileCount} file(s) queued</span>
                  </div>
                  {Object.entries(preview).sort().map(([subj, fnames], idx) => (
                    <div
                      key={subj}
                      className="bg-[#161D2F] border border-white/5 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-rise-in"
                      style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
                    >
                      <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 text-base">
                        {SUBJECT_ICONS[subj.toLowerCase()] || '📁'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium mb-1">
                          {subj}
                          <span className="text-slate-500 text-xs font-normal ml-2">{fnames.length} file(s)</span>
                        </p>
                        <div className="space-y-0.5">
                          {fnames.map((n, i) => <p key={i} className="text-slate-500 text-xs truncate">· {n}</p>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={processing || !fileCount || !block.trim()}
              className="press-scale w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-[#6D28D9] hover:from-violet-400 hover:to-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-all duration-200">
              {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><Database className="w-4 h-4" /> Import {fileCount || 0} file(s)</>}
            </button>
          </form>

          {(log.length > 0 || currentJob) && (
            <div className="glass-panel rounded-2xl overflow-hidden border border-white/10 flex flex-col animate-fade-rise-in">
              <div className="bg-[#161D2F] px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Live Extraction Log</span>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/40"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40"></div>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {currentJob && (
                  <div className="bg-[#161D2F] border border-violet-500/20 rounded-xl p-4 animate-fade-rise-in">
                    <p className="text-violet-400 text-sm font-medium mb-2">Extracting slides: {currentJob.fileName}</p>
                    <PdfProcessor
                      lectureId={currentJob.lectureId}
                      subjectId={currentJob.subjectId}
                      fileUrl={currentJob.fileUrl}
                      onComplete={handleSlidesComplete}
                      onError={err => {
                        addLog(`✗ Slide extraction: ${err}`)
                        const { remainingFiles } = currentJob
                        setCurrentJob(null)
                        processNext(remainingFiles)
                      }}
                    />
                  </div>
                )}
                <div className="space-y-1 max-h-80 overflow-y-auto font-mono text-xs scrollbar-hide">
                  {log.map((l, i) => (
                    <p key={i} className={`animate-log-fade-in ${l.startsWith('✓') ? 'text-emerald-400' : l.startsWith('✗') ? 'text-red-400' : 'text-slate-400'}`}>{l}</p>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: all lectures */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-white">All Lectures</h2>
              <span className="px-3 py-1 bg-violet-500/10 text-violet-300 rounded-full text-xs font-medium">{allLectures.length} total</span>
            </div>

            {!allLectures.length ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                <Info className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-slate-500 text-sm">No lectures uploaded yet.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                {allLectures.map((l, idx) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between bg-[#161D2F] hover:bg-white/5 border border-white/5 rounded-xl px-4 py-3 transition-colors animate-fade-rise-in"
                    style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
                  >
                    <Link href={`/admin/review/${l.id}`} className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{l.title}</p>
                      <p className="text-slate-500 text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400/70" />
                        {l.questionCount} question(s) generated · {new Date(l.created_at).toLocaleDateString()}
                      </p>
                    </Link>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <Link href={`/admin/review/${l.id}`} className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-xs press-scale">
                        <ClipboardEdit className="w-3.5 h-3.5" /> Review
                      </Link>
                      <button onClick={() => deleteLecture(l.id, l.title)}
                        className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs press-scale">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
