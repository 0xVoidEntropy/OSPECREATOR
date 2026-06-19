'use client'
import { useState } from 'react'

interface Crop { x: number; y: number; w: number; h: number }

interface Props {
  src: string
  crop: Crop | null | undefined
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
}

/**
 * Renders an image cropped to a percent-based region without distorting it.
 * `crop.w`/`crop.h` are percentages of the source image's own width/height,
 * which only map to a square-safe aspect ratio if the source is square — so
 * we measure the real natural size on load and use it to pick a container
 * aspect ratio that matches the true pixel aspect of the selected region.
 */
export default function CroppedImage({ src, crop, alt = '', className, loading = 'lazy' }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
  }

  if (!crop || !crop.w || !crop.h) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading={loading} onLoad={onLoad} />
  }

  const pixelAspect = natural ? (natural.h * crop.h) / (natural.w * crop.w) : crop.h / crop.w

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', paddingBottom: `${pixelAspect * 100}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={onLoad}
        style={{
          position: 'absolute',
          width: `${100 / (crop.w / 100)}%`,
          height: `${100 / (crop.h / 100)}%`,
          left: `${-crop.x / crop.w * 100}%`,
          top: `${-crop.y / crop.h * 100}%`,
          maxWidth: 'none',
        }}
      />
    </div>
  )
}
