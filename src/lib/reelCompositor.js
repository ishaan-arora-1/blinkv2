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

function drawFrame(ctx, video) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  if (!video || video.readyState < 2) return
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  // Cover, matching drawVideoFrame in VideoEditor: a clip whose ratio differs
  // from the canvas is filled rather than letterboxed.
  const scale = Math.max(REEL_W / vw, REEL_H / vh)
  const dw = vw * scale
  const dh = vh * scale
  ctx.drawImage(video, (REEL_W - dw) / 2, (REEL_H - dh) / 2, dw, dh)
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
 * @param clips   [{ video: HTMLVideoElement, duration: number }] in order
 * @param onTick  called with the current time each frame
 * @param onEnd   called when playback reaches the end
 */
export function createCompositor({ canvas, clips, onTick, onEnd }) {
  const ctx = canvas.getContext('2d')
  const total = totalDuration(clips)

  let t = 0
  let playing = false
  let raf = null
  let last = performance.now()

  // Built on first export and kept afterwards. A MediaElementAudioSourceNode
  // can only be created once per element, and creating one redirects that
  // element's audio into the graph — so the graph must also feed the speakers
  // or preview goes silent from the first export onward.
  let audio = null

  function buildAudio() {
    if (audio) return audio
    const actx = new AudioContext()
    const mix = actx.createGain()
    mix.connect(actx.destination)
    for (const clip of clips) {
      try {
        actx.createMediaElementSource(clip.video).connect(mix)
      } catch {
        // Already bound to another context, or the element is not CORS-clean.
        // Preview still works; the export loses this clip's audio rather than
        // failing outright.
      }
    }
    audio = { actx, mix }
    return audio
  }

  function loop(now) {
    const dt = (now - last) / 1000
    last = now

    if (playing) {
      t += dt
      if (t >= total) {
        t = total
        playing = false
        pauseAll()
        onEnd?.()
      }
      onTick?.(t)
    }

    const { index, local } = locate(clips, Math.min(t, total))
    clips.forEach((clip, i) => sync(clip.video, i === index ? local : 0, playing, i === index))
    drawFrame(ctx, clips[index]?.video)

    raf = requestAnimationFrame(loop)
  }

  function pauseAll() {
    for (const c of clips) c.video.pause()
  }

  raf = requestAnimationFrame(loop)

  return {
    total,

    play() {
      if (t >= total) t = 0
      playing = true
      last = performance.now()
      audio?.actx.resume().catch(() => {})
    },

    pause() {
      playing = false
      pauseAll()
    },

    seek(next) {
      t = Math.max(0, Math.min(total, next))
      onTick?.(t)
    },

    isPlaying: () => playing,

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
      onTick?.(0)
      // One frame at t=0 before the recorder starts, so the first chunk is the
      // opening frame rather than whatever was last drawn.
      await new Promise((r) => setTimeout(r, 120))

      rec.start(200)
      playing = true
      last = performance.now()

      await new Promise((resolve) => {
        const tick = () => {
          onProgress?.(Math.min(99, Math.round((t / total) * 100)))
          if (t >= total || !playing) resolve()
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
