'use client'
import { useEffect, useState } from 'react'
import { Languages } from 'lucide-react'
import { subscribeShowTranslate, getShowTranslate } from '@/lib/translateBus'

function isArabicActive() {
  return document.cookie.includes('googtrans=/en/ar')
}

function setLang(lang: 'en' | 'ar') {
  const value = lang === 'ar' ? '/en/ar' : '/en/en'
  document.cookie = `googtrans=${value}; path=/`
  // Google's widget also scopes the cookie to the apex domain in some setups.
  const domain = window.location.hostname
  document.cookie = `googtrans=${value}; path=/; domain=${domain}`
  window.location.reload()
}

export default function TranslateButton({ className = '' }: { className?: string }) {
  const [show, setShow] = useState(true)
  const [active, setActive] = useState(false)

  useEffect(() => {
    setShow(getShowTranslate())
    setActive(isArabicActive())
    return subscribeShowTranslate(setShow)
  }, [])

  if (!show) return null

  return (
    <button
      type="button"
      onClick={() => setLang(active ? 'en' : 'ar')}
      title={active ? 'Switch back to English' : 'Translate this page to Arabic'}
      className={`press-scale inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-cyan-300 bg-slate-900/60 border border-white/10 rounded-md px-2 py-1 transition-colors ${className}`}
    >
      <Languages className="w-3 h-3" />
      {active ? 'English' : 'العربية'}
    </button>
  )
}
