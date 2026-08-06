# Blink UGC

UGC studio for your product. Feed it your product's name, pitch and tone, and
mint scroll-stopping carousels and creator-led hook videos — designed, written
and exported in the browser.

Not app-specific: the copy engine and category list cover physical goods,
storefronts and B2B software as well as apps.

## What's in it

- **Carousels** — pick a photo set and a copy angle, get a full hook → body → CTA
  carousel. Every text layer is draggable and restyleable. Exports 1080 × 1350
  PNGs, one at a time or the whole set as a ZIP.
- **Hook videos** — an AI creator reacts to your product for 3 seconds, then your
  screen recording plays. Trim both, score it with a synthesized track, add
  timed text overlays, export as video.
- **Blink AI** — describe a video and generate it. Optionally
  anchor it to a creator and your product photo.
- **Library** — everything you've generated, in one place, synced across devices.
- **Image sets** — four built-in lifestyle collections plus your own uploads.

## Plans

Sign-in is Google, via Supabase Auth. Every account lands on a permanent **free
tier**, no card and no countdown. There is no trial and no lapsed state: the
door is always open, and the locks are on individual features.

The line between free and paid is what a use of the feature costs us. Photo
carousels are composed in the browser from our own photography and our own copy
templates — no vendor is billed, nothing renders on our side — so there is
nothing to meter and no reason to charge for them. Everything above that line
either bills a vendor per generation or holds storage we pay for.
`entitled_tier()` in `0012_free_tier_no_trial.sql` is where that is drawn.

Subscribing bills the full amount straight away and starts the billing month
from that day: buying and paying are one transaction. Cancelling drops you back
to free rather than out, and nothing you made is deleted.

Live prices are below; the test-mode Razorpay plans price Growth at $14.99, which
is why the two modes keep separate columns in `plans` — see DEPLOY.md.

| | Free | Starter — $7.99/mo | Growth — $25.99/mo |
|---|---|---|---|
| Photo carousels | ✓ | ✓ | ✓ |
| Built-in image sets | ✓ | ✓ | ✓ |
| Cloud sync | ✓ | ✓ | ✓ |
| Hook videos | — | ✓ | ✓ |
| Animated carousels | — | ✓ | ✓ |
| Custom image sets | — | ✓ | ✓ |
| Blink AI | — | — | ✓ |

Billing is Razorpay subscriptions, monthly, charged in **USD** (the Razorpay
account has international payments enabled).

Prices live in the `plans` table, never in code — but the table is a mirror, not
the source. Razorpay bills whatever its own plan says, so `plans.price_minor` and
`plans.currency` have to match the linked Razorpay plan exactly. If they drift,
the pricing page quotes one number and the customer's card is charged another.
Change the price in Razorpay first, then follow it here with a migration.

## How it's built

```
/                 React 18 + Vite SPA        → any static host
/server           Express                    → Railway
/supabase         Postgres schema + RLS      → Supabase
```

- **Auth** — Supabase Auth with the Google provider. The session lives in the
  browser; the API verifies the JWT on every request.
- **Data** — Postgres, with row level security on every table. Editor documents
  (slides, overlays) are `jsonb`; everything else is columns. Writes are optimistic
  locally and debounced before they hit the database, because the carousel editor
  saves on every pointer move.
- **Media** — private Supabase Storage buckets, read through short-lived signed
  URLs. `uploads` is the user's; `generations` is written only by the server.
- **Money and secrets** — the API owns the Razorpay secret, the webhook secret and
  the fal key. Entitlement is enforced server-side; the client only hides
  what you can't use.
- **Routing** — a hash router in `src/lib/router.js`, so the app is deployable as
  plain static files.

Carousel export renders the live DOM stage with `html-to-image`; video export
records the compositor canvas in real time with `MediaRecorder`.

### Where things are

- `src/pages` — one file per screen, editors included
- `src/lib/store.jsx` — Supabase-backed store with debounced writes
- `src/lib/auth.jsx` — session, profile and entitlement
- `src/lib/copygen.js` — the carousel copy presets
- `src/lib/creators.js` — the creator roster and their premade hook clips
- `src/lib/audio.js` — the music tracks, synthesized with WebAudio
- `server/src/routes` — `me`, `plans`, `billing`, `webhooks`, `veo` (Blink AI), `animated`
- `supabase/migrations` — schema, RLS, entitlement function, storage policies

## Running it

```bash
npm install
cd server && npm install && cd ..
cp .env.example .env
cp server/.env.example server/.env
```

Fill both `.env` files in — see **[DEPLOY.md](DEPLOY.md)** for where each value
comes from. Then, in two terminals:

```bash
npm run dev
```

```bash
cd server && npm run dev
```

Web on `http://localhost:5199`, API on `http://localhost:8080`.

## Deploying

See **[DEPLOY.md](DEPLOY.md)** — Supabase project and migrations, Google OAuth
consent screen, Razorpay plans and webhook, Railway service, static hosting, and
a smoke test to run afterwards.
