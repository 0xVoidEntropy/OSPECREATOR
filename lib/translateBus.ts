'use client'

const SHOW_KEY = 'ospe_show_translate_v1'

let showButtons = true
const listeners = new Set<(show: boolean) => void>()

function emit() {
  listeners.forEach((l) => l(showButtons))
}

export function subscribeShowTranslate(listener: (show: boolean) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getShowTranslate(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_KEY)
    showButtons = raw === null ? true : raw === '1'
  } catch { /* ignore */ }
  return showButtons
}

export function setShowTranslate(show: boolean) {
  showButtons = show
  try { localStorage.setItem(SHOW_KEY, show ? '1' : '0') } catch { /* ignore */ }
  emit()
}
