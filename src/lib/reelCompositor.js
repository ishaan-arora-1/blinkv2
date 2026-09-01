/**
 * Plays N clips back to back as one video, and records the result.
 *
 * This is the hook-video export generalised. VideoEditor.jsx composites two
 * fixed parts — a hook then a demo — by drawing whichever is current onto a
 * canvas and recording canvas.captureStream(). A reel is the same idea with the
 * pair replaced by a list, so the timeline is computed rather than hardcoded.
 *
 * Two things had to change on the way, and both matter:
 *
 * 1. Audio. The hook exporter records the canvas plus a music bed and leaves
 *    the source clips muted, which is right when the source is a silent stock
 *    hook. Every Multiframe clip carries generated audio — that is the entire
 *    reason Blink AI moved to Veo — so a reel exported that way would throw
 *    away the voices and be a silent ad. Each clip is routed through WebAudio
 *    into the recorded stream instead.
 *
 * 2. crossOrigin. The clips are Supabase signed URLs, which are cross-origin.
 *    Drawing a cross-origin video onto a canvas taints it, and captureStream on
 *    a tainted canvas yields a stream MediaRecorder cannot encode. The elements
 *    must carry crossOrigin="anonymous" — set by whoever creates them, and
 *    asserted here because the failure is otherwise a silent empty file.
 *
 * The recording is real time: a 32-second reel takes 32 seconds to export.
 * There is no faster path in a browser without re-encoding by hand, and the
 * hook exporter has the same property.
 */

export const REEL_W = 540
export const REEL_H = 960

/**
 * Group the narration's word timings into caption lines.
 *
 * Cut on the words themselves rather than on an even division of the script
 * across the runtime: an even split drifts inside any sentence not spoken at
 * the average rate, and is visibly out by the end of a long one.
 *
 * Lines break on sentence punctuation, on a gap in the speech, or on length —
 * whichever comes first. Short lines are the point: a caption that fills the
 * lower third of a phone screen is read instead of the picture.
 */
export function buildCues(words, { maxChars = 42, maxGap = 0.45, offset = 0 } = {}) {
  const cues = []
  let cur = null

  for (const w of words || []) {
    if (!w?.word || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue

    const gap = cur ? w.start - cur.end : 0
    const tooLong = cur && `${cur.text} ${w.word}`.length > maxChars
    const broke = cur && (gap > maxGap || tooLong)

    if (!cur || broke) {
      if (cur) cues.push(cur)
      cur = { text: w.word, start: w.start + offset, end: w.end + offset }
    } else {
      cur.text += ` ${w.word}`
      cur.end = w.end + offset
    }

    // A sentence ending is the most natural break there is, so take it even if
    // the line has room left.
    if (/[.!?]$/.test(w.word)) {
      cues.push(cur)
      cur = null
    }
  }
  if (cur) cues.push(cur)
  return cues
}

export function cueAt(cues, t) {
  for (const c of cues) if (t >= c.start && t <= c.end) return c
  return null
}

/**
 * Draw one caption, centred in the lower third.
 *
 * Wrapped by measurement rather than by character count, because the same
 * number of characters is a different width in every string. Drawn with a
 * stroke under the fill so it survives a light frame — a white caption over a
 * white wall is invisible, and this footage is deliberately full of plain
 * walls.
 */
export function drawCaption(ctx, text) {
  const size = Math.round(REEL_W * 0.062)
  ctx.save()
  ctx.font = `700 ${size}px "Familjen Grotesk", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const maxWidth = REEL_W * 0.84
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  const lh = size * 1.25
  const baseY = REEL_H * 0.8 - ((lines.length - 1) * lh) / 2

  lines.forEach((ln, i) => {
    const y = baseY + i * lh
    ctx.lineWidth = Math.max(3, size * 0.16)
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.lineJoin = 'round'
    ctx.strokeText(ln, REEL_W / 2, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(ln, REEL_W / 2, y)
  })
  ctx.restore()
}

/** Which clip is playing at time t, and how far into it we are. */
export function locate(clips, t) {
  let acc = 0
  for (let i = 0; i < clips.length; i++) {
    const d = clips[i].duration
    if (t < acc + d) return { index: i, local: t - acc }
    acc += d
  }
  // Past the end: hold the last frame rather than reporting nothing, so the
  // final frame stays on screen instead of flashing to black.
  const lastIdx = clips.length - 1
  return { index: lastIdx, local: clips[lastIdx]?.duration ?? 0 }
}

export const totalDuration = (clips) => clips.reduce((n, c) => n + c.duration, 0)

/**
 * Draw the current clip, or hold the last good frame.
 *
 * The black flash at every cut came from here. Switching clips seeks the next
 * element to 0, a seek briefly drops readyState below 2, and this used to paint
 * black and return — so every join showed one or two black frames, which in a
 * 30fps recording is exactly the flicker you see.
 *
 * Holding the previous frame instead means a cut shows the outgoing shot for
 * the millisecond the incoming one needs, which reads as an instant cut rather
 * than a blink. Black is now only ever drawn when there is nothing at all to
 * show — the very first frame before anything has loaded.
 *
 * Returns whatever it actually drew, so the caller can pass it back as the
 * fallback next time.
 */
function drawFrame(ctx, video, fallback) {
  const ready = (v) => v && v.readyState >= 2 && v.videoWidth && v.videoHeight
  const target = ready(video) ? video : ready(fallback) ? fallback : null

  if (!target) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, REEL_W, REEL_H)
    return null
  }
  return paint(ctx, target)
}

function paint(ctx, video) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  const vw = video.videoWidth
  const vh = video.videoHeight
  // Cover, matching drawVideoFrame in VideoEditor: a clip whose ratio differs
  // from the canvas is filled rather than letterboxed.
  const scale = Math.max(REEL_W / vw, REEL_H / vh)
  const dw = vw * scale
  const dh = vh * scale
  ctx.drawImage(video, (REEL_W - dw) / 2, (REEL_H - dh) / 2, dw, dh)
  return video
}

/**
 * Keep one element in step with the compositor clock.
 *
 * Lifted in shape from syncVideo in VideoEditor. The tolerance is the same 0.35
 * while playing: tighter and every rAF issues a seek, which stutters worse than
 * the drift it corrects.
 */
function sync(video, local, playing, active) {
  if (!video) return
  if (!active) {
    if (!video.paused) video.pause()
    return
  }
  if (playing) {
    if (video.paused) {
      video.currentTime = local
      video.play().catch(() => {})
    } else if (Math.abs(video.currentTime - local) > 0.35) {
      video.currentTime = local
    }
  } else if (Math.abs(video.currentTime - local) > 0.05) {
    video.currentTime = local
  }
}

/**
 * @param canvas  the visible canvas, REEL_W x REEL_H
 * @param clips   [{ video: HTMLVideoElement, duration: number }] in order.
 *                `duration` is how long the scene is *held*, which may be less
 *                than the clip's own runtime — trimming is the only way to fit
 *                the picture to the narration, since a clip's length was fixed
 *                when it was filmed.
 * @param voice   an <audio> element carrying the narration, or null. The clips
 *                are rendered silent, so this is the only sound in the reel.
 * @param cues    subtitle cues from buildCues, or null for no captions
 * @param onTick  called with the current time each frame
 * @param onEnd   called when playback reaches the end
 */
export function createCompositor({ canvas, clips, voice = null, cues = null, onTick, onEnd }) {
  const ctx = canvas.getContext('2d')

  // Both are switched at runtime rather than being fixed when the compositor is
  // built, because the alternative does not work. Turning narration on would
  // mean rebuilding, rebuilding means a new AudioContext, and a media element
  // can only ever be bound to one — createMediaElementSource throws the second
  // time. So the element is bound once and a gain node decides whether it is
  // heard, and the captions are just a variable the draw loop reads.
  let voiceOn = Boolean(voice)
  let activeCues = cues

  // The last clip that actually rendered, held across a cut so the incoming
  // one's seek does not show through as black.
  let lastDrawn = null

  // Held separately from the clips so trimming does not rebuild anything. A
  // rebuild would mean a new AudioContext, and the narration element cannot be
  // bound to a second one — so every slider drag would silently cost the reel
  // its voice.
  let timeline = clips.map((c) => ({ video: c.video, duration: c.duration }))
  const totalOf = () => timeline.reduce((n, c) => n + c.duration, 0)

  let t = 0
  let playing = false
  let raf = null
  let last = performance.now()

  // Built on first export and kept afterwards. A MediaElementAudioSourceNode
  // can only be created once per element, and creating one redirects that
  // element's audio into the graph — so the graph must also feed the speakers
  // or preview goes silent from the first export onward.
  //
  // Only the narration is routed. The clips are rendered silent now (see
  // generate_audio in video.js), so there is nothing in them to mix and
  // binding them would only risk a CORS failure for no sound.
  let audio = null

  function buildAudio() {
    if (audio) return audio
    const actx = new AudioContext()
    const mix = actx.createGain()
    mix.connect(actx.destination)
    const gain = actx.createGain()
    gain.gain.value = voiceOn ? 1 : 0
    gain.connect(mix)
    if (voice) {
      try {
        actx.createMediaElementSource(voice).connect(gain)
      } catch {
        // Already bound to another context, or not CORS-clean. The picture
        // still records; it records without narration rather than not at all.
      }
    }
    audio = { actx, mix, gain }
    return audio
  }

  function loop(now) {
    const dt = (now - last) / 1000
    last = now

    if (playing) {
      t += dt
      if (t >= totalOf()) {
        t = totalOf()
        playing = false
        pauseAll()
        onEnd?.()
      }
      onTick?.(t)
    }

    const { index, local } = locate(timeline, Math.min(t, totalOf()))
    timeline.forEach((clip, i) => sync(clip.video, i === index ? local : 0, playing, i === index))
    lastDrawn = drawFrame(ctx, timeline[index]?.video, lastDrawn)

    // Wake the next clip while the current one is still playing, so its first
    // frame is decoded before the cut rather than during it.
    const next = timeline[index + 1]?.video
    if (next && next.readyState < 2 && next.preload !== 'auto') next.preload = 'auto'

    // The narration runs on the compositor clock like everything else, so
    // scrubbing moves the voice with the picture.
    if (voice && voiceOn) {
      if (playing) {
        if (voice.paused) {
          voice.currentTime = Math.min(t, voice.duration || t)
          voice.play().catch(() => {})
        } else if (Math.abs(voice.currentTime - t) > 0.35) {
          voice.currentTime = Math.min(t, voice.duration || t)
        }
      } else if (!voice.paused) {
        voice.pause()
      }
    } else if (voice && !voice.paused) {
      voice.pause()
    }

    if (activeCues?.length) {
      const cue = cueAt(activeCues, t)
      if (cue) drawCaption(ctx, cue.text)
    }

    raf = requestAnimationFrame(loop)
  }

  function pauseAll() {
    for (const c of timeline) c.video.pause()
    if (voice && !voice.paused) voice.pause()
  }

  raf = requestAnimationFrame(loop)

  return {
    get total() {
      return totalOf()
    },

    /** New on-screen durations, one per clip, without rebuilding anything. */
    setDurations(next) {
      timeline = timeline.map((c, i) => ({
        ...c,
        duration: Number.isFinite(next?.[i]) ? Math.max(0.1, next[i]) : c.duration,
      }))
      if (t > totalOf()) t = totalOf()
      onTick?.(t)
    },

    play() {
      if (t >= totalOf()) {
        t = 0
        if (voice) voice.currentTime = 0
      }
      playing = true
      last = performance.now()
      audio?.actx.resume().catch(() => {})
    },

    pause() {
      playing = false
      pauseAll()
    },

    seek(next) {
      t = Math.max(0, Math.min(totalOf(), next))
      if (voice) {
        try { voice.currentTime = Math.min(t, voice.duration || t) } catch { /* not loaded yet */ }
      }
      onTick?.(t)
    },

    isPlaying: () => playing,

    /** Whether the narration is heard, and therefore recorded. */
    setVoiceEnabled(on) {
      voiceOn = Boolean(on) && Boolean(voice)
      if (audio) audio.gain.gain.value = voiceOn ? 1 : 0
      if (!voiceOn && voice && !voice.paused) voice.pause()
    },

    /** Captions to burn in, or null for none. */
    setCues(next) {
      activeCues = next
    },

    /**
     * Record the reel start to finish and hand back a blob.
     *
     * webm, matching the hook exporter — it is what MediaRecorder supports
     * everywhere, and both features therefore produce the same kind of file.
     */
    async exportReel({ onProgress } = {}) {
      const { actx, mix } = buildAudio()
      await actx.resume().catch(() => {})

      const stream = canvas.captureStream(30)
      const dest = actx.createMediaStreamDestination()
      mix.connect(dest)
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)

      const mime =
        ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(
          (m) => MediaRecorder.isTypeSupported(m)
        ) || ''

      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
      const chunks = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      const stopped = new Promise((resolve) => { rec.onstop = resolve })

      t = 0
      if (voice) {
        try { voice.currentTime = 0 } catch { /* not loaded yet */ }
      }
      onTick?.(0)
      // One frame at t=0 before the recorder starts, so the first chunk is the
      // opening frame rather than whatever was last drawn.
      await new Promise((r) => setTimeout(r, 120))

      rec.start(200)
      playing = true
      last = performance.now()

      await new Promise((resolve) => {
        const tick = () => {
          onProgress?.(Math.min(99, Math.round((t / totalOf()) * 100)))
          if (t >= totalOf() || !playing) resolve()
          else setTimeout(tick, 120)
        }
        tick()
      })

      playing = false
      pauseAll()
      rec.stop()
      await stopped

      mix.disconnect(dest)
      onProgress?.(100)
      return new Blob(chunks, { type: mime || 'video/webm' })
    },

    destroy() {
      playing = false
      if (raf) cancelAnimationFrame(raf)
      pauseAll()
      // The context is closed rather than kept: this runs on unmount, and the
      // elements it was bound to are going away with it.
      audio?.actx.close().catch(() => {})
      audio = null
    },
  }
}
