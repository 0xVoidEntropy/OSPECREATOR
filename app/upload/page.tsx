'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Subject, Lecture } from '@/types'
import { ArrowLeft, Upload, FileText, Check, Loader2, X, ExternalLink, Cpu } from 'lucide-react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'

// Load PDF processor only client-side (uses canvas API)
const PdfProcessor = nextDynamic(() => import('@/components/PdfProcessor'), { ssr: false })

interface ProcessingJob {
  lectureId: string
  subjectId: string
  fileUrl: string
  title: string
}

export default function UploadPage() {
  const router = useRouter()
  const supabase = createClient()

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processingJob, setProcessingJob] = useState<ProcessingJob | null>(null)
  const [processSuccess, setProcessSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    setUserId(session.user.id)

    const [{ data: sData }, { data: lData }] = await Promise.all([
      supabase.from('subjects').select('*').order('name'),
      supabase.from('lectures').select('*, subjects(name, icon)').order('created_at', { ascending: false }),
    ])

    if (sData) setSubjects(sData)
    if (lData) setLectures(lData as Lecture[])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !selectedSubject || !title || !userId) return

    setUploading(true)
    setError(null)
    setProcessingJob(null)
    setProcessSuccess(false)

    try {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const path = `lectures/${selectedSubject}/${fileName}`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('lectures')
        .upload(path, file, { contentType: file.type })

      if (uploadErr) throw new Error(`File upload failed: ${uploadErr.message}`)

      const { data: { publicUrl } } = supabase.storage.from('lectures').getPublicUrl(path)

      const { data: lectureData, error: dbErr } = await supabase
        .from('lectures')
        .insert({
          subject_id: selectedSubject,
          title,
          file_url: publicUrl,
          file_type: file.type,
          uploaded_by: userId,
        })
        .select()
        .single()

      if (dbErr) throw new Error(dbErr.message)

      setTitle('')
      setFile(null)
      setSelectedSubject('')
      await loadData()

      // If PDF, start slide extraction
      if (file.type === 'application/pdf' && lectureData) {
        setProcessingJob({
          lectureId: lectureData.id,
          subjectId: lectureData.subject_id,
          fileUrl: publicUrl,
          title: lectureData.title,
        })
      } else {
        setProcessSuccess(true)
        setTimeout(() => setProcessSuccess(false), 4000)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <div className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-white font-bold">Upload Lecture</h1>
            <p className="text-slate-500 text-xs">PDF slides are automatically processed — images matched to questions</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload form */}
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6">
              <h2 className="font-semibold text-white mb-2">Add Lecture</h2>
              <p className="text-slate-500 text-xs mb-5">
                Upload a PDF of your lecture slides. Every slide will be extracted and automatically matched to the relevant OSPE questions.
              </p>

              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Subject</label>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    required
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="">Select subject...</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Lecture Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    required
                    placeholder="e.g., Lab 1 — DM Kidney Pathology"
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">PDF File</label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      file ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-600/50 hover:border-slate-500/50'
                    }`}
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="w-5 h-5 text-cyan-400" />
                        <span className="text-cyan-300 text-sm font-medium">{file.name}</span>
                        <button
                          type="button"
                          onClick={ev => { ev.stopPropagation(); setFile(null) }}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">Click to upload PDF</p>
                        <p className="text-slate-600 text-xs mt-1">Every slide will be extracted automatically</p>
                      </>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                {processSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <p className="text-emerald-400 text-xs">Lecture uploaded and slides extracted successfully!</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploading || !file || !title || !selectedSubject || !!processingJob}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Upload & Extract Slides</>
                  )}
                </button>
              </form>
            </div>

            {/* PDF processing status */}
            {processingJob && (
              <div className="bg-slate-900/60 border border-cyan-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
                  <div>
                    <p className="text-white text-sm font-medium">Extracting slides from "{processingJob.title}"</p>
                    <p className="text-slate-500 text-xs">Keep this tab open until complete</p>
                  </div>
                </div>
                <PdfProcessor
                  lectureId={processingJob.lectureId}
                  subjectId={processingJob.subjectId}
                  fileUrl={processingJob.fileUrl}
                  onComplete={count => {
                    setProcessingJob(null)
                    setProcessSuccess(true)
                    setTimeout(() => setProcessSuccess(false), 5000)
                  }}
                  onError={err => {
                    setProcessingJob(null)
                    setError(`Slide extraction failed: ${err}. The lecture was saved but slides were not extracted.`)
                  }}
                />
              </div>
            )}

            <div className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Cpu className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-slate-300 text-xs font-medium mb-1">How it works</p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Each slide is rendered as an image and stored. When you study, the app automatically matches each question to the most relevant slide from your uploaded lectures — based on the text content of the slide.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Existing lectures */}
          <div>
            <h2 className="font-semibold text-white mb-4">Uploaded Lectures</h2>
            {lectures.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-8 text-center">
                <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No lectures yet</p>
                <p className="text-slate-600 text-xs mt-1">Upload a PDF to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lectures.map(lecture => {
                  const sub = lecture.subjects as unknown as { name: string; icon: string }
                  return (
                    <div key={lecture.id} className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{lecture.title}</p>
                        <p className="text-slate-500 text-xs">{sub?.icon} {sub?.name}</p>
                      </div>
                      {lecture.file_url && (
                        <a href={lecture.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-slate-500 hover:text-cyan-400 transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <p className="text-center text-slate-600 text-xs">Made by Dr. Alhassan #44 · IMS OSPE Study Helper</p>
      </footer>
    </div>
  )
}
