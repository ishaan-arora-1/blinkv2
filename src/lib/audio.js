// Premade audio tracks, synthesized with WebAudio.
// scheduleTrack() works on any AudioContext + destination, so the same code
// powers live preview and MediaRecorder export.

export const TRACKS = [
  { id: 'hype', name: 'Hype Beat', desc: 'Punchy kick + bass, launch energy' },
  { id: 'lofi', name: 'Lo-fi Calm', desc: 'Soft chords, cozy demo vibes' },
  { id: 'pop', name: 'Bright Pop', desc: 'Plucky arps, upbeat & clean' },
  { id: 'minimal', name: 'Minimal Tick', desc: 'Sparse clicks, lets UI shine' },
]

function noiseBuffer(actx, seconds = 1) {
  const buf = actx.createBuffer(1, actx.sampleRate * seconds, actx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function env(actx, param, t, a, peak, dec) {
  param.setValueAtTime(0.0001, t)
  param.exponentialRampToValueAtTime(peak, t + a)
  param.exponentialRampToValueAtTime(0.0001, t + a + dec)
}

function kick(actx, dest, t, vol) {
  const o = actx.createOscillator()
  const g = actx.createGain()
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  env(actx, g.gain, t, 0.005, 0.9 * vol, 0.18)
  o.connect(g).connect(dest)
  o.start(t); o.stop(t + 0.25)
}

function hat(actx, dest, t, vol, open = false) {
  const src = actx.createBufferSource()
  src.buffer = noiseBuffer(actx, 0.2)
  const hp = actx.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 7000
  const g = actx.createGain()
  env(actx, g.gain, t, 0.002, 0.25 * vol, open ? 0.18 : 0.05)
  src.connect(hp).connect(g).connect(dest)
  src.start(t); src.stop(t + 0.25)
}

function clap(actx, dest, t, vol) {
  const src = actx.createBufferSource()
  src.buffer = noiseBuffer(actx, 0.25)
  const bp = actx.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2
  const g = actx.createGain()
  env(actx, g.gain, t, 0.004, 0.5 * vol, 0.16)
  src.connect(bp).connect(g).connect(dest)
  src.start(t); src.stop(t + 0.3)
}

function tone(actx, dest, t, freq, dur, vol, type = 'triangle') {
  const o = actx.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = actx.createGain()
  env(actx, g.gain, t, 0.01, vol, dur)
  o.connect(g).connect(dest)
  o.start(t); o.stop(t + dur + 0.1)
}

const N = (m) => 440 * Math.pow(2, (m - 69) / 12)

export function scheduleTrack(actx, dest, trackId, startTime, duration, volume = 0.8) {
  const master = actx.createGain()
  master.gain.value = volume
  master.connect(dest)
  const v = 1

  if (trackId === 'hype') {
    const bpm = 128, beat = 60 / bpm
    const bassLine = [33, 33, 36, 31] // A1 A1 C2 G1
    for (let t = 0; t < duration; t += beat) {
      const i = Math.round(t / beat)
      kick(actx, master, startTime + t, v)
      hat(actx, master, startTime + t + beat / 2, v)
      if (i % 2 === 1) clap(actx, master, startTime + t, v * 0.8)
      tone(actx, master, startTime + t, N(bassLine[i % 4]), beat * 0.9, 0.35 * v, 'square')
    }
  } else if (trackId === 'lofi') {
    const bpm = 74, beat = 60 / bpm
    const chords = [[60, 64, 67, 71], [57, 60, 64, 69], [62, 65, 69, 72], [55, 59, 62, 67]]
    for (let t = 0; t < duration; t += beat * 2) {
      const c = chords[Math.round(t / (beat * 2)) % 4]
      c.forEach((m, j) => tone(actx, master, startTime + t + j * 0.03, N(m - 12), beat * 1.8, 0.12 * v, 'triangle'))
      kick(actx, master, startTime + t, v * 0.5)
      if (t + beat < duration) hat(actx, master, startTime + t + beat, v * 0.4)
    }
    // vinyl hiss
    const src = actx.createBufferSource()
    src.buffer = noiseBuffer(actx, 2)
    src.loop = true
    const lp = actx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 3500
    const g = actx.createGain(); g.gain.value = 0.015 * v
    src.connect(lp).connect(g).connect(master)
    src.start(startTime); src.stop(startTime + duration)
  } else if (trackId === 'pop') {
    const bpm = 118, beat = 60 / bpm
    const arp = [64, 67, 71, 74, 71, 67]
    for (let t = 0, i = 0; t < duration; t += beat / 2, i++) {
      tone(actx, master, startTime + t, N(arp[i % arp.length]), 0.22, 0.22 * v, 'sawtooth')
      if (i % 2 === 0) kick(actx, master, startTime + t, v * 0.7)
      if (i % 4 === 2) clap(actx, master, startTime + t, v * 0.6)
    }
  } else if (trackId === 'minimal') {
    const beat = 60 / 100
    for (let t = 0, i = 0; t < duration; t += beat, i++) {
      hat(actx, master, startTime + t, v * 0.5)
      if (i % 4 === 0) tone(actx, master, startTime + t, N(45), 0.4, 0.25 * v, 'sine')
      if (i % 8 === 4) tone(actx, master, startTime + t, N(57), 0.3, 0.12 * v, 'sine')
    }
  }
  return master
}
