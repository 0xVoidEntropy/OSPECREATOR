'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  lectureId: string
  subjectId: string
  fileUrl: string
  onComplete: (pageCount: number) => void
  onError: (err: string) => void
}

export default function PdfProcessor({ lectureId, subjectId, fileUrl, onComplete, onError }: Props) {
  const [status, setStatus] = useState('Initializing PDF processor...')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    const process = async () => {
      try {
        // Dynamically import pdfjs-dist (client-side only)
        const pdfjsLib = await import('pdfjs-dist')

        // Set worker — use CDN to avoid bundling issues
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`

        setStatus('Loading PDF...')
        const loadingTask = pdfjsLib.getDocument({ url: fileUrl } as Parameters<typeof pdfjsLib.getDocument>[0])
        const pdf = await loadingTask.promise

        const numPages = pdf.numPages
        setTotal(numPages)
        setStatus(`Processing ${numPages} slides...`)

        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas not available')
        const ctx = canvas.getContext('2d')!

        let processed = 0

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) return

          setStatus(`Extracting slide ${pageNum} of ${numPages}...`)

          const page = await pdf.getPage(pageNum)

          // Render at 1.5x scale for good quality
          const viewport = page.getViewport({ scale: 1.5 })
          canvas.width = viewport.width
          canvas.height = viewport.height

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: ctx as any, viewport } as any).promise

          // Extract text content for keyword matching
          let textContent = ''
          try {
            const tc = await page.getTextContent()
            textContent = tc.items
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((item: any) => (item.str as string) || '')
              .join(' ')
              .toLowerCase()
              .slice(0, 2000)
          } catch {
            // text extraction failed — not critical
          }

          // Convert canvas to blob
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.85)
          })

          // Upload to Supabase storage
          const path = `${lectureId}/page-${pageNum}.jpg`
          const { error: uploadErr } = await supabase.storage
            .from('slide-images')
            .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

          if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

          const { data: { publicUrl } } = supabase.storage.from('slide-images').getPublicUrl(path)

          // Store in lecture_pages table
          await supabase.from('lecture_pages').insert({
            lecture_id: lectureId,
            subject_id: subjectId,
            page_number: pageNum,
            image_url: publicUrl,
            text_content: textContent,
          })

          processed++
          setProgress(processed)
        }

        if (!cancelled) {
          setStatus(`Done! ${numPages} slides extracted.`)
          onComplete(numPages)
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    process()
    return () => { cancelled = true }
  }, [lectureId, subjectId, fileUrl])

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{status}</span>
        {total > 0 && <span>{progress}/{total}</span>}
      </div>
      {total > 0 && (
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.round((progress / total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
