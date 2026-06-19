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

// Detect whether a rendered page has ANY embedded raster image XObject.
// Pages with zero images are pure text/title slides and are skipped —
// everything else is uploaded full-page, uncropped, and left to the
// vision model (which can see arrows/multiple specimens) to box each
// specimen individually via per-question image_crop.
async function pageHasImage(page: import('pdfjs-dist').PDFPageProxy): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opList = await page.getOperatorList() as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const OPS = (await import('pdfjs-dist')).OPS as any
    return opList.fnArray.some((fn: number) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject)
  } catch {
    return true // fail open — let the AI decide rather than silently dropping a slide
  }
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
        const pdfjsLib = await import('pdfjs-dist')
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
        let stored = 0

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) return

          setStatus(`Analysing slide ${pageNum} of ${numPages}...`)

          const page = await pdf.getPage(pageNum)

          // Render at 2x for quality
          const viewport = page.getViewport({ scale: 2 })
          canvas.width = viewport.width
          canvas.height = viewport.height

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: ctx as any, viewport } as any).promise

          // Skip slides with no embedded image at all (title/text/contents slides)
          const hasImage = await pageHasImage(page)

          // Extract text regardless (needed for Q&A generation)
          let textContent = ''
          try {
            const tc = await page.getTextContent()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = tc.items as any[]
            items.sort((a, b) => {
              const yDiff = (b.transform?.[5] ?? 0) - (a.transform?.[5] ?? 0)
              if (Math.abs(yDiff) > 5) return yDiff
              return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0)
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            textContent = items.map((item: any) => item.str || '').join(' ').slice(0, 3000)
          } catch { /* not critical */ }

          setStatus(`Saving slide ${pageNum} of ${numPages}...`)

          if (hasImage) {
            // Upload the full, uncropped rendered page — arrows/labels/multiple
            // specimens are all preserved. Cropping to an individual specimen
            // happens later, per-question, via image_crop (set by AI or edited
            // live in the admin review screen) and applied at display time.
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.9)
            })

            const path = `${lectureId}/page-${pageNum}.jpg`
            const { error: uploadErr } = await supabase.storage
              .from('slide-images')
              .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

            if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

            const { data: { publicUrl } } = supabase.storage.from('slide-images').getPublicUrl(path)

            await supabase.from('lecture_pages').insert({
              lecture_id: lectureId,
              subject_id: subjectId,
              page_number: pageNum,
              image_url: publicUrl,
              text_content: textContent,
            })
            stored++
          } else {
            // Text-only slide: keep the text for context but no image_url,
            // so extract-questions naturally skips it (filters on !!image_url).
            await supabase.from('lecture_pages').insert({
              lecture_id: lectureId,
              subject_id: subjectId,
              page_number: pageNum,
              image_url: null,
              text_content: textContent,
            })
          }

          processed++
          setProgress(processed)
        }

        if (!cancelled) {
          setStatus(`Done! ${stored} image slides extracted.`)
          onComplete(stored)
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
