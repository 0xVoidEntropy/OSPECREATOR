'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'
import { ArrowLeft, Loader2, Save, Trash2, Crop as CropIcon } from 'lucide-react'
import Link from 'next/link'
import CroppedImage from '@/components/CroppedImage'

interface Crop { x: number; y: number; w: number; h: number }
interface SubQuestion { label: string; question: string; hint: string; answer: string }
interface QuestionRow {
  id: string
  station_number: number | null
  question_text: string
  answer: string | null
  hint: string | null
  image_url: string | null
  image_crop: Crop | null
  difficulty: string
  sub_questions: SubQuestion[] | null
  dirty?: boolean
  saving?: boolean
}

function CroppedPreview({ imageUrl, crop }: { imageUrl: string; crop: Crop }) {
  if (!crop.w || !crop.h) return null
  return <CroppedImage src={imageUrl} crop={crop} />
}

function CropEditor({ imageUrl, crop, onChange }: { imageUrl: string; crop: Crop | null; onChange: (c: Crop) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<Crop | null>(null)
  const [draft, setDraft] = useState<Crop | null>(crop)

  useEffect(() => setDraft(crop), [crop])

  const toPct = (clientX: number, clientY: number) => {
    const el = boxRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
    }
  }

  // Paint the overlay box directly via the DOM on every frame (no React re-render
  // mid-drag) so dragging stays smooth even on large slide images; React state is
  // only committed once per animation frame for the live crop preview pane.
  const paintOverlay = (c: Crop) => {
    const el = overlayRef.current
    if (!el) return
    el.style.display = c.w > 0 ? 'block' : 'none'
    el.style.left = `${c.x}%`
    el.style.top = `${c.y}%`
    el.style.width = `${c.w}%`
    el.style.height = `${c.h}%`
  }

  const scheduleDraftUpdate = (c: Crop) => {
    pendingRef.current = c
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (pendingRef.current) setDraft(pendingRef.current)
      })
    }
  }

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const p = toPct(e.clientX, e.clientY)
    dragStartRef.current = p
    const next = { x: p.x, y: p.y, w: 0, h: 0 }
    paintOverlay(next)
    setDraft(next)
  }
  const handleMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return
    const start = dragStartRef.current
    const p = toPct(e.clientX, e.clientY)
    const x = Math.min(start.x, p.x)
    const y = Math.min(start.y, p.y)
    const w = Math.abs(p.x - start.x)
    const h = Math.abs(p.y - start.y)
    const next = { x, y, w, h }
    paintOverlay(next)
    scheduleDraftUpdate(next)
  }
  const handleUp = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const finalCrop = pendingRef.current || draft
    if (finalCrop) setDraft(finalCrop)
    if (dragStartRef.current && finalCrop && finalCrop.w > 1 && finalCrop.h > 1) onChange(finalCrop)
    dragStartRef.current = null
    pendingRef.current = null
  }

  return (
    <div className="grid grid-cols-2 gap-3 items-start animate-fade-rise-in">
      <div
        ref={boxRef}
        className="relative w-full select-none cursor-crosshair border border-slate-700 rounded-lg overflow-hidden touch-none self-start"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="slide" className="w-full block pointer-events-none" draggable={false} />
        <div
          ref={overlayRef}
          className="absolute border-2 border-cyan-400 bg-cyan-400/15 will-change-transform"
          style={{ display: draft && draft.w > 0 ? 'block' : 'none', left: `${draft?.x ?? 0}%`, top: `${draft?.y ?? 0}%`, width: `${draft?.w ?? 0}%`, height: `${draft?.h ?? 0}%` }}
        />
      </div>
      <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900 flex items-center justify-center">
        {draft && draft.w > 0 ? (
          <CroppedPreview imageUrl={imageUrl} crop={draft} />
        ) : (
          <span className="text-xs text-slate-500 p-3">Drag a box to preview crop live</span>
        )}
      </div>
    </div>
  )
}

export default function ReviewLecturePage() {
  const router = useRouter()
  const params = useParams<{ lectureId: string }>()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [lectureTitle, setLectureTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [cropEditingId, setCropEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    if (session.user.email !== ADMIN_EMAIL) { router.replace('/dashboard'); return }

    const { data: lecture } = await supabase.from('lectures').select('title').eq('id', params.lectureId).single()
    setLectureTitle(lecture?.title || 'Lecture')

    const { data: qs } = await supabase.from('questions')
      .select('id, station_number, question_text, answer, hint, image_url, image_crop, sub_questions, difficulty')
      .eq('lecture_id', params.lectureId)
      .order('station_number')
    setQuestions((qs || []) as QuestionRow[])
    setLoading(false)
  }, [supabase, params.lectureId, router])

  useEffect(() => { load() }, [load])

  const updateField = (id: string, field: keyof QuestionRow, value: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value, dirty: true } : q))
  }

  const updateCrop = (id: string, crop: Crop | null) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, image_crop: crop, dirty: true } : q))
  }

  const updateSubQuestion = (id: string, idx: number, field: keyof SubQuestion, value: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== id || !q.sub_questions) return q
      const sub_questions = q.sub_questions.map((sq, i) => i === idx ? { ...sq, [field]: value } : sq)
      return { ...q, sub_questions, dirty: true }
    }))
  }

  const save = async (q: QuestionRow) => {
    setQuestions(prev => prev.map(p => p.id === q.id ? { ...p, saving: true } : p))
    const { error } = await supabase.from('questions').update({
      question_text: q.question_text, answer: q.answer, hint: q.hint,
      difficulty: q.difficulty, image_crop: q.image_crop, sub_questions: q.sub_questions,
    }).eq('id', q.id)
    setQuestions(prev => prev.map(p => p.id === q.id ? { ...p, saving: false, dirty: error ? p.dirty : false } : p))
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('questions').delete().eq('id', id)
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-slate-900 relative">
      <div className="absolute inset-0 clinical-overlay opacity-15 pointer-events-none" />
      <div className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40 relative">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-white font-bold">Review — {lectureTitle}</h1>
            <p className="text-slate-500 text-xs"><span className="font-mono-clinical">{questions.length}</span> question(s) generated — edit text or drag a crop box, then Save</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 relative">
        {!questions.length && <p className="text-slate-500 text-sm">No questions found for this lecture yet.</p>}
        {questions.map((q, qIdx) => (
          <div key={q.id} className="bg-slate-800 border border-slate-700/40 rounded-2xl p-5 space-y-3 animate-fade-rise-in shadow-lg shadow-black/20" style={{ animationDelay: `${Math.min(qIdx * 40, 320)}ms` }}>
            <div className="flex items-center justify-between">
              <span className="font-mono-clinical text-cyan-400 text-xs">Station {q.station_number}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => save(q)} disabled={!q.dirty || q.saving}
                  className="press-scale flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white transition-[opacity,background-color] duration-150">
                  {q.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                </button>
                <button onClick={() => remove(q.id)} className="press-scale flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 transition-colors duration-150">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>

            {q.image_url && (
              <div className="space-y-2">
                {cropEditingId === q.id ? (
                  <CropEditor imageUrl={q.image_url} crop={q.image_crop} onChange={c => updateCrop(q.id, c)} />
                ) : (
                  <div className="relative w-full max-w-md rounded-lg overflow-hidden border border-slate-700">
                    {q.image_crop ? (
                      <CroppedPreview imageUrl={q.image_url} crop={q.image_crop} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.image_url} alt="" className="w-full" />
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={() => setCropEditingId(cropEditingId === q.id ? null : q.id)}
                    className="press-scale flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition-colors duration-150">
                    <CropIcon className="w-3 h-3" /> {cropEditingId === q.id ? 'Done cropping' : 'Adjust crop'}
                  </button>
                  {q.image_crop && (
                    <button onClick={() => updateCrop(q.id, null)}
                      className="press-scale text-xs text-slate-500 hover:text-red-400 transition-colors duration-150">
                      Clear crop
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-500 mb-1">Question</label>
              <textarea value={q.question_text} onChange={e => updateField(q.id, 'question_text', e.target.value)}
                rows={3} className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white transition-colors duration-150" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Answer (HTML allowed)</label>
              <textarea value={q.answer || ''} onChange={e => updateField(q.id, 'answer', e.target.value)}
                rows={4} className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white transition-colors duration-150" />
            </div>
            {!q.sub_questions?.length && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hint</label>
                <input value={q.hint || ''} onChange={e => updateField(q.id, 'hint', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white transition-colors duration-150" />
              </div>
            )}

            {!!q.sub_questions?.length && (
              <div className="space-y-3 pt-2 border-t border-slate-700/50">
                <label className="block text-xs text-slate-500">Sub-questions ({q.sub_questions.length})</label>
                {q.sub_questions.map((sq, idx) => (
                  <div key={idx} className="border-l-2 border-slate-700 pl-3 space-y-2">
                    <input value={sq.label} onChange={e => updateSubQuestion(q.id, idx, 'label', e.target.value)}
                      placeholder="Label" className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-1.5 text-xs text-cyan-300 transition-colors duration-150" />
                    <textarea value={sq.question} onChange={e => updateSubQuestion(q.id, idx, 'question', e.target.value)}
                      placeholder="Question" rows={2} className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white transition-colors duration-150" />
                    <input value={sq.hint} onChange={e => updateSubQuestion(q.id, idx, 'hint', e.target.value)}
                      placeholder="Hint" className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white transition-colors duration-150" />
                    <textarea value={sq.answer} onChange={e => updateSubQuestion(q.id, idx, 'answer', e.target.value)}
                      placeholder="Answer" rows={2} className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white transition-colors duration-150" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
