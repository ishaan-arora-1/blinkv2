import React, { useState } from 'react'

/**
 * Save a file that lives on another origin.
 *
 * `<a href={signedUrl} download="x.mp4">` does not work here, and the way it
 * fails is confusing rather than obvious: the download attribute is ignored for
 * cross-origin URLs, so the browser navigates instead. Every clip, cut and
 * generation is served from Supabase storage, so every download button opened
 * the video on a blank page with no way to save it.
 *
 * Fetching the bytes and handing over a blob: URL sidesteps that — a blob is
 * same-origin by definition, so the attribute is honoured and the file is
 * saved under the name we asked for. It costs the wait for the transfer, which
 * is why this reports progress rather than looking dead for twenty megabytes.
 */
export default function DownloadButton({
  url,
  filename,
  className = 'btn xs',
  label = '⬇ Download',
  title,
  style,
}) {
  const [state, setState] = useState('idle') // idle | working | error

  async function save(e) {
    e.preventDefault()
    e.stopPropagation()
    if (state === 'working' || !url) return

    setState('working')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()

      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoked late: some browsers cancel an in-flight save if the object URL
      // is released the moment the click returns.
      setTimeout(() => URL.revokeObjectURL(href), 60_000)
      setState('idle')
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2500)
    }
  }

  return (
    <button className={className} onClick={save} disabled={state === 'working' || !url} title={title} style={style}>
      {state === 'working' ? 'Saving…' : state === 'error' ? 'Failed — retry' : label}
    </button>
  )
}
