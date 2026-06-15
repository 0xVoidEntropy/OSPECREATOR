'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Upload, FileText, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'

const PdfProcessor = nextDynamic(() => import('@/components/PdfProcessor'), { ssr: false })

const SUBJECT_NAMES = [
  'Pathology',
  'Histology',
  'Anatomy',
  'Microbiology',
  'Biochemistry',
  'Physiology',
  'Pharmacology',
  'Community Medicine',
]

const YEAR_LABELS: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
}

interface ProcessingJob {
  lectureId: string
  subjectId: string
  fileUrl: string
  fileName: string
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [year, setYear] = useState<number>(1)
  const [block, setBlock] = useState('')
  const [subjectName, setSubjectName] = useState(SUBJECT_NAMES[0])
  const [files, setFiles] = useState<File[]>([])

  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null)

  const logEndRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, msg])
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth'); return }
      setUserId(session.user.id)
      setLoading(false)
    }
    init()
  }, [router, supabase])

  const getOrCreateSubject = async (name: string, yr: number, blk: string): Promise<string> => {
    const { data: existing } = await supabase
      .from('subjects')
      .select('id')
      .eq('name', name)
      .eq('year', yr)
      .eq('block', blk)
      .maybeSingle()

    if (existing) return existing.id

    const { data: created, error } = await supabase
      .from('subjects')
      .insert({ name, year: yr, block: blk, display_order: 0, icon: '📚', color: '#0891b2', description: `${name} — Year ${yr}, Block: ${blk}` })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create subject: ${error.message}`)
    return created.id
  }

  const processNextFile = useCallback(async (
    fileList: File[],
    index: number,
    yr: number,
    blk: string,
    sName: string,
    uid: string,
    subjectId: string,
  ) => {
    if (index >= fileList.length) {
      addLog('All files processed successfully.')
      setProcessing(false)
      return
    }

    const file = fileList[index]
    addLog(`Processing file ${index + 1} of ${fileList.length}: ${file.name}`)

    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const path = `lectures/${subjectId}/${fileName}`

    addLog(`Uploading ${file.name} to storage...`)
    const { error: uploadErr } = await supabase.storage
      .from('lectures')
      .upload(path, file, { contentType: file.type })

    if (uploadErr) {
      addLog(`Error uploading ${file.name}: ${uploadErr.message}`)
      processNextFile(fileList, index + 1, yr, blk, sName, uid, subjectId)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('lectures').getPublicUrl(path)

    const { data: lectureData, error: dbErr } = await supabase
      .from('lectures')
      .insert({
        subject_id: subjectId,
        title: file.name.replace(/\.pdf$/i, ''),
        file_url: publicUrl,
        file_type: file.type,
        uploaded_by: uid,
      })
      .select()
      .single()

    if (dbErr) {
      addLog(`Error creating lecture record: ${dbErr.message}`)
      processNextFile(fileList, index + 1, yr, blk, sName, uid, subjectId)
      return
    }

    addLog(`Extracting slides from ${file.name}...`)
    setCurrentJob({
      lectureId: lectureData.id,
      subjectId,
      fileUrl: publicUrl,
      fileName: file.name,
    })
  }, [addLog, supabase])

  const handleSlidesDone = useCallback(async (job: ProcessingJob, fileList: File[], index: number, yr: number, blk: string, sName: string, uid: string, subjectId: string) => {
    setCurrentJob(null)
    addLog(`Slides extracted. Generating questions for ${job.fileName}...`)

    let totalCount = 0
    let nextIndex = 0
    let hasMore = true
    while (hasMore) {
      const res = await fetch('/api/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId: job.lectureId, subjectId: job.subjectId, startIndex: nextIndex, batchSize: 1 }),
      })
      const data = await res.json()
      if (!res.ok) {
        addLog(`Question extraction error: ${data.error}`)
        break
      }
      totalCount += data.count || 0
      hasMore = data.hasMore || false
      nextIndex = data.nextIndex || 0
      if (hasMore) addLog(`Generating questions... ${totalCount} done so far`)
    }
    addLog(`${totalCount} questions generated for ${job.fileName}`)

    processNextFile(fileList, index + 1, yr, blk, sName, uid, subjectId)
  }, [addLog, processNextFile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files.length || !block.trim() || !userId) return

    setProcessing(true)
    setLog([])
    setCurrentJob(null)

    try {
      addLog(`Creating/finding subject: ${subjectName} (Year ${year}, Block: ${block})`)
      const subjectId = await getOrCreateSubject(subjectName, year, block.trim())
      addLog(`Subject ID: ${subjectId}`)

      processNextFile(files, 0, year, block.trim(), subjectName, userId, subjectId)
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setProcessing(false)
    }
  }

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-white font-bold">Admin — Bulk Curriculum Upload</h1>
            <p className="text-slate-500 text-xs">Upload multiple lectures at once by year and block</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-slate-800 border border-slate-700/40 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-5">Upload Settings</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Year</label>
                <select
                  value={year}
                  onChange={e => setYear(Number(e.target.value))}
                  disabled={processing}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {[1, 2, 3].map(y => (
                    <option key={y} value={y}>{YEAR_LABELS[y]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Block</label>
                <input
                  type="text"
                  value={block}
                  onChange={e => setBlock(e.target.value)}
                  disabled={processing}
                  required
                  placeholder="e.g., GIT, Respiratory"
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Subject</label>
                <select
                  value={subjectName}
                  onChange={e => setSubjectName(e.target.value)}
                  disabled={processing}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {SUBJECT_NAMES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">PDF Files</label>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  files.length > 0 ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-600/50 hover:border-slate-500/50'
                } ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !processing && document.getElementById('admin-file-input')?.click()}
              >
                <input
                  id="admin-file-input"
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
                  className="hidden"
                  disabled={processing}
                />
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Click to select PDF files (multiple allowed)</p>
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-700/40 rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-sm text-slate-300 flex-1 truncate">{f.name}</span>
                      {!processing && (
                        <button type="button" onClick={() => removeFile(i)} className="text-slate-500 hover:text-red-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={processing || !files.length || !block.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
            >
              {processing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><Upload className="w-4 h-4" /> Upload {files.length > 0 ? `${files.length} File${files.length > 1 ? 's' : ''}` : 'Files'}</>
              )}
            </button>
          </form>
        </div>

        {(log.length > 0 || currentJob) && (
          <div className="bg-slate-800 border border-slate-700/40 rounded-2xl p-6">
            <h2 className="font-semibold text-white mb-4">Progress Log</h2>

            {currentJob && (
              <div className="mb-4 bg-slate-700/40 border border-cyan-500/20 rounded-xl p-4">
                <p className="text-cyan-400 text-sm font-medium mb-2">Extracting slides: {currentJob.fileName}</p>
                <PdfProcessor
                  lectureId={currentJob.lectureId}
                  subjectId={currentJob.subjectId}
                  fileUrl={currentJob.fileUrl}
                  onComplete={() => {
                    const job = currentJob
                    const fileList = files
                    const fileIndex = log.filter(l => l.startsWith('Processing file')).length - 1
                    handleSlidesDone(job, fileList, fileIndex, year, block, subjectName, userId!, currentJob.subjectId)
                  }}
                  onError={err => {
                    addLog(`Slide extraction error: ${err}`)
                    setCurrentJob(null)
                    const fileIndex = log.filter(l => l.startsWith('Processing file')).length - 1
                    processNextFile(files, fileIndex + 1, year, block, subjectName, userId!, currentJob.subjectId)
                  }}
                />
              </div>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {log.map((line, i) => (
                <p key={i} className="text-slate-400 text-xs font-mono">{line}</p>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
