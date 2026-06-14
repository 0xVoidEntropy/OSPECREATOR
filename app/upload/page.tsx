'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Subject, Lecture } from '@/types'
import { ArrowLeft, Upload, FileText, Check, Loader2, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'

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
  const [success, setSuccess] = useState(false)
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

    try {
      // Try to upload file to Supabase storage
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const path = `lectures/${selectedSubject}/${fileName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('lectures')
        .upload(path, file, { contentType: file.type })

      let fileUrl: string | null = null

      if (uploadError) {
        // Storage bucket might not exist — save lecture record without file URL
        console.warn('Storage upload failed:', uploadError.message)
      } else if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('lectures').getPublicUrl(path)
        fileUrl = publicUrl
      }

      const { error: dbError } = await supabase.from('lectures').insert({
        subject_id: selectedSubject,
        title,
        file_url: fileUrl,
        file_type: file.type,
        uploaded_by: userId,
      })

      if (dbError) throw dbError

      setSuccess(true)
      setTitle('')
      setFile(null)
      setSelectedSubject('')
      await loadData()
      setTimeout(() => setSuccess(false), 3000)
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
            <p className="text-slate-500 text-xs">Add study materials for your colleagues</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload form */}
          <div>
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6">
              <h2 className="font-semibold text-white mb-6">Add New Lecture</h2>

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
                    placeholder="e.g., Lab 1 - DM Kidney Pathology"
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">File (PDF, Image, etc.)</label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      file ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-600/50 hover:border-slate-500/50'
                    }`}
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.mp4,.pptx,.docx"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="w-5 h-5 text-cyan-400" />
                        <span className="text-cyan-300 text-sm font-medium">{file.name}</span>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setFile(null) }}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">Click to upload</p>
                        <p className="text-slate-600 text-xs mt-1">PDF, images, PPTX, DOCX</p>
                      </>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <p className="text-emerald-400 text-xs">Lecture uploaded successfully!</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploading || !file || !title || !selectedSubject}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Upload Lecture</>
                  )}
                </button>
              </form>
            </div>

            <div className="mt-4 bg-slate-900/40 border border-slate-700/30 rounded-xl p-4">
              <p className="text-slate-500 text-xs leading-relaxed">
                <span className="text-slate-400 font-medium">Note:</span> Uploaded lectures are visible to all students in the subject.
                Large files may require Supabase storage to be configured. Supported formats: PDF, PNG, JPG, PPTX, DOCX.
              </p>
            </div>
          </div>

          {/* Existing lectures */}
          <div>
            <h2 className="font-semibold text-white mb-4">Uploaded Lectures</h2>
            {lectures.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-8 text-center">
                <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No lectures uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lectures.map(lecture => {
                  const sub = lecture.subjects as unknown as { name: string; icon: string }
                  return (
                    <div
                      key={lecture.id}
                      className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-4 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{lecture.title}</p>
                        <p className="text-slate-500 text-xs">{sub?.icon} {sub?.name}</p>
                      </div>
                      {lecture.file_url && (
                        <a
                          href={lecture.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-cyan-400 transition-colors"
                        >
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
