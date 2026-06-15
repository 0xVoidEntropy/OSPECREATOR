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

// Analyse canvas pixels to find the actual image region
// Returns null if the slide is text-only (should be skipped)
function analyseSlide(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): {
  isImageSlide: boolean
  cropTop: number
  cropHeight: number
} {
  const w = canvas.width
  const h = canvas.height

  // Sample every 3rd pixel for speed
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Count non-white pixels per row (sample every 3 pixels horizontally)
  const rowNonWhite = new Float32Array(h)
  for (let y = 0; y < h; y++) {
    let count = 0
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // Anything that's not near-white
      if (r < 230 || g < 230 || b < 230) count++
    }
    rowNonWhite[y] = count / (w / 3)
  }

  // A row "has image content" if >12% of sampled pixels are non-white
  const imageThreshold = 0.12

  // Identify image regions: look for blocks of consecutive image rows
  // Text rows: thin (1-3px) bands with <40% non-white
  // Image rows: thick blocks with varied color
  const isImageRow = (y: number) => rowNonWhite[y] > imageThreshold

  // Count total non-white pixels to detect text-only slides
  let totalNonWhite = 0
  for (let y = 0; y < h; y++) totalNonWhite += rowNonWhite[y]
  const avgNonWhite = totalNonWhite / h

  // Text-only slide: very sparse non-white content overall
  if (avgNonWhite < 0.04) {
    return { isImageSlide: false, cropTop: 0, cropHeight: h }
  }

  // Find the largest contiguous image block (block of rows all having image content)
  // This is where the specimen image is
  let bestStart = 0, bestEnd = h, bestLen = 0
  let runStart = -1

  for (let y = 0; y < h; y++) {
    if (isImageRow(y)) {
      if (runStart === -1) runStart = y
    } else {
      if (runStart !== -1) {
        const len = y - runStart
        if (len > bestLen) {
          bestLen = len
          bestStart = runStart
          bestEnd = y
        }
        runStart = -1
      }
    }
  }
  if (runStart !== -1 && h - runStart > bestLen) {
    bestStart = runStart
    bestEnd = h
    bestLen = h - runStart
  }

  // If the best image block is too small, it's likely text only
  if (bestLen < h * 0.12) {
    return { isImageSlide: false, cropTop: 0, cropHeight: h }
  }

  // Add small padding
  const pad = Math.floor(h * 0.02)
  const cropTop = Math.max(0, bestStart - pad)
  const cropBottom = Math.min(h, bestEnd + pad)

  return {
    isImageSlide: true,
    cropTop,
    cropHeight: cropBottom - cropTop,
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

          // Pixel analysis: skip text-only slides, find image region
          const { isImageSlide, cropTop, cropHeight } = analyseSlide(canvas, ctx)

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

          // Use smart crop if image region detected, otherwise crop fixed 10%-78%
          const finalCropTop = isImageSlide ? cropTop : Math.floor(canvas.height * 0.10)
          const finalCropHeight = isImageSlide ? cropHeight : Math.floor(canvas.height * 0.68)

          const cropCanvas = document.createElement('canvas')
          cropCanvas.width = canvas.width
          cropCanvas.height = finalCropHeight
          const cropCtx = cropCanvas.getContext('2d')!
          cropCtx.drawImage(canvas, 0, finalCropTop, canvas.width, finalCropHeight, 0, 0, canvas.width, finalCropHeight)

          const blob = await new Promise<Blob>((resolve, reject) => {
            cropCanvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.88)
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
