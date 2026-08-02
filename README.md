# reelmint

Social content studio for iOS apps. Feed it your app's name, pitch and tone, and
mint scroll-stopping carousels and creator-led hook videos — designed, written
and exported in the browser.

## What's in it

- **Carousels** — pick a photo set and a copy angle, get a full hook → body → CTA
  carousel. Every text layer is draggable and restyleable. Exports 1080 × 1350
  PNGs, one at a time or the whole set as a ZIP.
- **Hook videos** — an AI creator reacts to your app for 3 seconds, then your
  screen recording plays. Trim both, score it with a synthesized track, add
  timed text overlays, export as video.
- **Blink AI** — describe a video and generate it with Google Veo. Optionally
  anchor it to a creator and your product photo.
- **Library** — everything you've generated, in one place.
- **Image sets** — four built-in lifestyle collections plus your own uploads.

## Running it

```bash
npm install
cp .env.example .env   # add your Google AI key for Blink AI
npm run dev            # http://localhost:5199
```

Blink AI is the only feature that needs a key — carousels, hook videos and the
library all work offline.

## How it's built

React 18 + Vite, no backend. State lives in `localStorage`; uploaded images and
videos go to IndexedDB (`src/lib/idb.js`) so only metadata is persisted in the
store. Routing is a hash router in `src/App.jsx`.

- `src/pages` — one file per screen, editors included
- `src/lib/copygen.js` — the carousel copy presets
- `src/lib/creators.js` — the creator roster and their premade hook clips
- `src/lib/audio.js` — the music tracks, synthesized with WebAudio
- `public/creators`, `public/hooks`, `public/sets` — generated image and video assets

Carousel export renders the live DOM stage with `html-to-image`; video export
records the compositor canvas in real time with `MediaRecorder`.
