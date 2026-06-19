import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en">
      <body className="min-h-screen bg-[#0a0f1e] text-slate-100 antialiased">
        {children}
        <div className="fixed bottom-2 right-3 z-[9999] pointer-events-none select-none text-[10px] tracking-wide text-slate-600/40">
          Made by Alhassan · @0xVoidEntropy
        </div>
      </body>
    </html>
  )
}
