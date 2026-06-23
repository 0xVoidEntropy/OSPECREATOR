import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import GlossaryCardHost from '@/components/GlossaryCardHost'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'OSPE Study Helper — IMS',
  description: 'Objective Structured Practical Examination study platform for IMS medical students',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-[#0a0f1e] text-slate-100 antialiased">
        {children}
        <GlossaryCardHost />
        <div className="fixed bottom-2 right-3 z-[9999] pointer-events-none select-none text-[10px] tracking-wide text-slate-600/40">
          Made by Alhassan · @0xVoidEntropy
        </div>
      </body>
    </html>
  )
}
