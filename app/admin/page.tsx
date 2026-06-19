'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Upload, Loader2, FolderOpen, ClipboardEdit } from 'lucide-react'
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
  return folder || 'General'
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number>(3)
  const [block, setBlock] = useState('')
  const [preview, setPreview] = useState<Record<string, string[]>>({}) // subject → filenames
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null)
  const [completedLectures, setCompletedLectures] = useState<{ id: string; fileName: string; count: number }[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const allFilesRef = useRef<FileWithSubject[]>([])

  const addLog = useCallback((msg: string) => setLog(prev => [...prev, msg]), [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      setUserId(session.user.id)
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
    const { data: existing } = await supabase.from('subjects').select('id').eq('name', name).eq('year', yr).eq('block', blk).maybeSingle()
    if (existing) return existing.id
    const key = name.toLowerCase()
    const { data: created, error } = await supabase.from('subjects').insert({
      name, year: yr, block: blk, display_order: 0,
      icon: SUBJECT_ICONS[key] || '📚',
      color: SUBJECT_COLORS[key] || '#0891b2',
      description: `${name} — Year ${yr}, ${blk} block`,
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
        const res = await fetch('/api/extract-docx', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) { addLog(`✗ Parse failed: ${data.error}`); processNext(rest); return }
        addLog(`✓ ${data.count} questions from "${next.file.name}" (${data.entities} entities)`)
        setCompletedLectures(prev => [...prev, { id: lec.id, fileName: next.file.name, count: data.count }])
        processNext(rest)
        return
      }

      addLog(`Extracting slides from "${next.file.name}"…`)
      setCurrentJob({ lectureId: lec.id, subjectId, fileUrl: publicUrl, fileName: next.file.name, remainingFiles: rest })
    } catch (err) { addLog(`✗ ${String(err)}`); processNext(rest) }
  }, [supabase, userId, year, block, addLog]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSlidesComplete = useCallback(async () => {
    if (!currentJob) return
    const { lectureId, subjectId, fileName, remainingFiles } = currentJob
    setCurrentJob(null)
    addLog(`Generating questions for "${fileName}"…`)
    let total = 0, nextIndex = 0, hasMore = true
    while (hasMore) {
      const res = await fetch('/api/extract-questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId, subjectId, startIndex: nextIndex, batchSize: 1 }),
      })
      const data = await res.json()
      if (!res.ok) { addLog(`✗ Extraction: ${data.error}`); break }
      total += data.count || 0
      hasMore = data.hasMore || false
      nextIndex = data.nextIndex || 0
    }
    addLog(`✓ ${total} questions from "${fileName}"`)
    setCompletedLectures(prev => [...prev, { id: lectureId, fileName, count: total }])
    processNext(remainingFiles)
  }, [currentJob, addLog, processNext])

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

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-white font-bold">Admin — Curriculum Import</h1>
            <p className="text-slate-500 text-xs">Upload a block folder — subjects auto-detected from subfolders</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700/40 rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Year</label>
              <select value={year} onChange={e => setYear(+e.target.value)} disabled={processing}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors">
                {[1,2,3].map(y => <option key={y} value={y}>{YEAR_LABELS[y]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Block name</label>
              <input value={block} onChange={e => setBlock(e.target.value)} disabled={processing} required
                placeholder="e.g. GIT, Respiratory"
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Block folder</label>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${Object.keys(preview).length ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-600/50 hover:border-slate-500/50'} ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !processing && document.getElementById('folder-input')?.click()}
            >
              <input id="folder-input" type="file" accept=".pdf,.docx"
                {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                multiple onChange={handleFolderSelect} className="hidden" disabled={processing} />
              <FolderOpen className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Click to select a block folder</p>
              <p className="text-slate-600 text-xs mt-1">PDFs and .docx Q&amp;A labs both supported — subjects detected automatically from subfolders</p>
            </div>

            {Object.keys(preview).length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Detected {Object.keys(preview).length} subject(s) — {allFilesRef.current.length} PDFs total</p>
                {Object.entries(preview).sort().map(([subj, fnames]) => (
                  <div key={subj} className="bg-slate-700/40 rounded-xl px-4 py-3">
                    <p className="text-white text-sm font-medium mb-1">
                      {SUBJECT_ICONS[subj.toLowerCase()] || '📁'} {subj}
                      <span className="text-slate-500 text-xs font-normal ml-2">{fnames.length} file(s)</span>
                    </p>
                    <div className="space-y-0.5">
                      {fnames.map((n, i) => <p key={i} className="text-slate-500 text-xs truncate pl-2">· {n}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={processing || !allFilesRef.current.length || !block.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><Upload className="w-4 h-4" /> Import {allFilesRef.current.length || 0} file(s)</>}
          </button>
        </form>

        {(log.length > 0 || currentJob) && (
          <div className="bg-slate-800 border border-slate-700/40 rounded-2xl p-6">
            <h2 className="font-semibold text-white mb-4">Progress</h2>
            {currentJob && (
              <div className="mb-4 bg-slate-700/40 border border-cyan-500/20 rounded-xl p-4">
                <p className="text-cyan-400 text-sm font-medium mb-2">Extracting slides: {currentJob.fileName}</p>
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
            <div className="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
              {log.map((l, i) => (
                <p key={i} className={l.startsWith('✓') ? 'text-emerald-400' : l.startsWith('✗') ? 'text-red-400' : 'text-slate-400'}>{l}</p>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {completedLectures.length > 0 && (
          <div className="bg-slate-800 border border-slate-700/40 rounded-2xl p-6">
            <h2 className="font-semibold text-white mb-4">Uploaded — review &amp; polish</h2>
            <div className="space-y-2">
              {completedLectures.map(l => (
                <Link key={l.id} href={`/admin/review/${l.id}`}
                  className="flex items-center justify-between bg-slate-700/40 hover:bg-slate-700/60 rounded-xl px-4 py-3 transition-colors">
                  <div>
                    <p className="text-white text-sm font-medium">{l.fileName}</p>
                    <p className="text-slate-500 text-xs">{l.count} question(s) generated</p>
                  </div>
                  <span className="flex items-center gap-1 text-cyan-400 text-xs"><ClipboardEdit className="w-3.5 h-3.5" /> Review</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
