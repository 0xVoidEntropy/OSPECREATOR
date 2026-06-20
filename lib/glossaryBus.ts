'use client'

export interface LookupResult {
  definition: string
  image: string | null
  source: 'Wikipedia'
  url: string
}

interface BusState {
  term: string | null
  pos: { top: number; left: number } | null
}

const CACHE_KEY = 'ospe_glossary_cache_v2'
const POS_KEY = 'ospe_glossary_pos_v1'

let state: BusState = { term: null, pos: null }
const listeners = new Set<(s: BusState) => void>()

function emit() {
  listeners.forEach((l) => l(state))
}

export function subscribe(listener: (s: BusState) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getSavedPos(): { top: number; left: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePos(pos: { top: number; left: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  } catch {}
}

export function openCard(term: string, defaultPos: { top: number; left: number }) {
  const saved = getSavedPos()
  state = { term, pos: saved ?? defaultPos }
  emit()
}

export function movePos(pos: { top: number; left: number }) {
  state = { ...state, pos }
  savePos(pos)
  emit()
}

export function closeCard() {
  state = { term: null, pos: null }
  emit()
}

export function getState() {
  return state
}

export function loadCachedResult(key: string): LookupResult | null | undefined {
  try {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    return key in store ? store[key] : undefined
  } catch {
    return undefined
  }
}

export function persistResult(key: string, value: LookupResult | null) {
  try {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    store[key] = value
    localStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {}
}
