'use client'
import { useEffect } from 'react'

declare global {
  interface Window {
    googleTranslateElementInit?: () => void
    google?: { translate?: { TranslateElement: new (opts: Record<string, unknown>, el: string) => unknown } }
  }
}

let loaded = false

// Loads Google's Website Translator widget once. The widget reads the
// `googtrans` cookie on load and auto-translates the page if it's set —
// TranslateButton only needs to set that cookie and reload.
export default function GoogleTranslateLoader() {
  useEffect(() => {
    if (loaded) return
    loaded = true

    window.googleTranslateElementInit = () => {
      if (window.google?.translate) {
        new window.google.translate.TranslateElement(
          { pageLanguage: 'en', includedLanguages: 'ar', autoDisplay: false },
          'google_translate_element'
        )
      }
    }

    const script = document.createElement('script')
    script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    script.async = true
    document.body.appendChild(script)
  }, [])

  return <div id="google_translate_element" className="hidden" />
}
