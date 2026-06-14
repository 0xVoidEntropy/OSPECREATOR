import { LecturePage } from '@/types'

// Words to ignore when scoring relevance
const STOP_WORDS = new Set([
  'the','a','an','and','or','of','in','is','are','was','were','to','for',
  'with','on','at','by','from','that','this','it','its','be','been','has',
  'have','had','not','but','what','which','who','how','can','will','would',
  'should','may','might','do','does','did','station','image','figure','lab',
  'show','shown','shows','above','below','left','right','give','identify',
  'describe','mention','name','type','two','one','three','four','five',
])

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )
}

/**
 * Given a question's text and all lecture pages for the subject,
 * return the page image URL that best matches the question content.
 */
export function findBestImage(
  questionText: string,
  answerText: string,
  hintText: string,
  pages: LecturePage[]
): string | null {
  if (pages.length === 0) return null

  const qWords = keywords(`${questionText} ${answerText} ${hintText}`)
  if (qWords.size === 0) return null

  let bestScore = 0
  let bestUrl: string | null = null

  for (const page of pages) {
    if (!page.text_content) continue
    const pageWords = keywords(page.text_content)
    let score = 0
    for (const w of qWords) {
      if (pageWords.has(w)) score++
      // Partial match bonus — page text contains the keyword
      else {
        for (const pw of pageWords) {
          if (pw.includes(w) || w.includes(pw)) { score += 0.5; break }
        }
      }
    }
    // Normalize by question keyword count
    const normalized = score / qWords.size
    if (normalized > bestScore) {
      bestScore = normalized
      bestUrl = page.image_url
    }
  }

  // Only return if there's a reasonable match (at least 1 keyword overlap)
  return bestScore > 0.05 ? bestUrl : null
}
