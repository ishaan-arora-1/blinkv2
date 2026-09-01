import { env } from './env.js'
import { ApiError } from './middleware/errors.js'

/**
 * The narration: one voice over the whole reel.
 *
 * ElevenLabs through fal, so this runs on the key everything else already uses
 * and there is no second balance to let run dry — the same reason video moved
 * off Google Veo's own billing.
 *
 * Synthesised server-side rather than in the browser. The Web Speech API is
 * free and would seem to fit, but it speaks through the user's own installed
 * voices, which differ on every machine, cannot be captured into a recording
 * reliably, and would make the exported file sound different for whoever
 * pressed the button. A narration track is part of the deliverable, so it is
 * generated once, stored, and reused by every render of the reel.
 */

const QUEUE = 'https://queue.fal.run'
const SYNC = 'https://fal.run'

export const MAX_SCRIPT = 3000

/**
 * The voices offered.
 *
 * Every name here was verified against the model by generating a word with it —
 * the first version of this list was written from memory and four of its six
 * did not exist, so choosing anything but the default answered 422 "Voice not
 * found" and the feature looked broken for every voice but one.
 *
 * A short list rather than the whole ElevenLabs library: this is an ad for a
 * product, the choice that matters is roughly who is talking, and forty names
 * is a worse question than eight. Descriptions say what the voice is for, since
 * nobody can pick a narrator from a first name alone.
 */
export const VOICES = [
  { id: 'Rachel',    name: 'Rachel',    blurb: 'warm, conversational — the default UGC read' },
  { id: 'Sarah',     name: 'Sarah',     blurb: 'soft and friendly, younger' },
  { id: 'Aria',      name: 'Aria',      blurb: 'bright and expressive' },
  { id: 'Charlotte', name: 'Charlotte', blurb: 'calm, measured, a little posh' },
  { id: 'Adam',      name: 'Adam',      blurb: 'low, steady, male' },
  { id: 'Brian',     name: 'Brian',     blurb: 'deep and reassuring, male' },
  { id: 'Liam',      name: 'Liam',      blurb: 'casual young male' },
  { id: 'Will',      name: 'Will',      blurb: 'easy, upbeat male' },
]

export const DEFAULT_VOICE = 'Rachel'

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) || null
}

/**
 * Synthesise the script.
 *
 * `timestamps` is requested because it is what makes subtitles honest. Without
 * it the only way to time captions is to divide the script evenly across the
 * runtime, which drifts inside any sentence that is not spoken at the average
 * rate and is visibly wrong by the end of a long one. With it, every word
 * carries the moment it is actually said.
 *
 * Returns { audioUrl, words, duration }. `words` may be empty if the model
 * declines to provide timings — subtitles then fall back to an even split,
 * which is worse but still usable, and is better than refusing to caption.
 */
export async function synthesize({ script, voice }) {
  if (!env.fal.configured) {
    throw new ApiError(503, 'voice_not_configured', 'Voiceover is not set up on this server yet.')
  }

  const text = String(script || '').trim()
  if (!text) throw new ApiError(400, 'empty_script', 'There is no script to read.')

  const res = await fetch(`${SYNC}/${env.fal.voiceModel}`, {
    method: 'POST',
    headers: { Authorization: `Key ${env.fal.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text.slice(0, MAX_SCRIPT),
      voice: voiceById(voice)?.id || DEFAULT_VOICE,
      timestamps: true,
    }),
  })

  const body = await res.text()
  let data
  try {
    data = body ? JSON.parse(body) : {}
  } catch {
    data = {}
  }

  if (!res.ok) {
    // Same discipline as video.js: the vendor's detail explains the failure and
    // is the only thing that does, but it can echo the input, so it is logged
    // rather than returned.
    console.warn(`[voice] ${res.status} from ${env.fal.voiceModel} — ${body.slice(0, 300)}`)
    if (res.status === 401 || res.status === 403) {
      // fal answers 403 both for a bad key and for an account out of balance,
      // the latter as {"detail":"User is locked. Reason: TOP_UP."}. Reporting
      // the second as a credentials failure sends whoever reads it to check a
      // key that is fine.
      const detail = typeof data?.detail === 'string' ? data.detail : ''
      if (/locked/i.test(detail) || /top_?up/i.test(detail)) {
        throw new ApiError(
          503,
          'voice_out_of_credit',
          'Voiceover is paused because our generation account is out of credit. This is on us — it is not your plan or your card.'
        )
      }
      throw new ApiError(502, 'voice_auth_failed', 'The voice generator rejected our credentials.')
    }
    if (res.status === 402 || res.status === 429) {
      throw new ApiError(503, 'voice_unavailable', 'Voice generation is temporarily unavailable.')
    }
    throw new ApiError(502, 'voice_failed', `The voice generator returned ${res.status}.`)
  }

  const audioUrl = data?.audio?.url
  if (!audioUrl) throw new ApiError(502, 'voice_empty', 'The voice generator returned no audio.')

  const words = normaliseTimestamps(data?.timestamps)
  return {
    audioUrl,
    words,
    // The last word's end is the real length. Falls back to null rather than a
    // guess: the browser can read the true duration off the audio element, and
    // a wrong number here would be shown next to the video's runtime as if it
    // meant something.
    duration: words.length ? words[words.length - 1].end : null,
  }
}

/**
 * Turn the model's timings into words.
 *
 * eleven-v3 returns them per CHARACTER, in chunks:
 *
 *   [{ characters: ['S','o','m','e',' ',...],
 *      character_start_times_seconds: [0, 0.04, ...],
 *      character_end_times_seconds:   [0.04, 0.08, ...] }, ...]
 *
 * The first version of this looked for {word,start,end} and, finding nothing,
 * returned an empty list — which is why subtitles were quietly unavailable on
 * every reel: the switch stayed disabled and nothing said why.
 *
 * Characters are accumulated into words, a word starting at its first
 * character and ending at its last. Whitespace closes the current word rather
 * than joining it, so punctuation stays attached — buildCues breaks lines on
 * sentence endings, and it can only see them if the full stop is on the word.
 *
 * Still tolerant of the word-level shape, in case a future model or a different
 * FAL_VOICE_MODEL returns one.
 */
function normaliseTimestamps(raw) {
  const chunks = Array.isArray(raw) ? raw : Array.isArray(raw?.words) ? raw.words : []
  if (!chunks.length) return []

  // Word-level already.
  if (chunks[0]?.word || chunks[0]?.text) {
    return chunks
      .map((t) => ({
        word: String(t?.word ?? t?.text ?? '').trim(),
        start: Number(t?.start ?? t?.start_time ?? t?.startTime),
        end: Number(t?.end ?? t?.end_time ?? t?.endTime),
      }))
      .filter((t) => t.word && Number.isFinite(t.start) && Number.isFinite(t.end))
  }

  const words = []
  let cur = null

  for (const chunk of chunks) {
    const chars = chunk?.characters
    const starts = chunk?.character_start_times_seconds
    const ends = chunk?.character_end_times_seconds
    if (!Array.isArray(chars) || !Array.isArray(starts)) continue

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      const start = Number(starts[i])
      const end = Number(ends?.[i] ?? starts[i + 1] ?? starts[i])

      if (/\s/.test(ch)) {
        if (cur) { words.push(cur); cur = null }
        continue
      }
      if (!Number.isFinite(start)) continue

      if (!cur) cur = { word: ch, start, end }
      else { cur.word += ch; cur.end = Number.isFinite(end) ? end : cur.end }
    }
  }
  if (cur) words.push(cur)

  return words.filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
}

/** Pull the finished audio off fal's temporary URL so it can be archived. */
export async function downloadAudio(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new ApiError(502, 'voice_download_failed', `Could not download the narration (${res.status}).`)
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'audio/mpeg',
  }
}
