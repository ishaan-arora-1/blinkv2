# Deploying Blink UGC

Three pieces, deployed independently:

| Piece | Where | What it is |
|---|---|---|
| **Web app** | any static host (Vercel / Netlify / Cloudflare Pages) | The Vite SPA at the repo root |
| **API** | Railway | `server/` — Express. Holds every secret |
| **Database + auth + storage** | Supabase | Postgres with RLS, Google sign-in, private buckets |

The ordering below matters: Supabase first (everything needs its keys), then Razorpay,
then the API, then the web app.

---

## 1 · Supabase

### 1.1 Create the project

New project at [supabase.com](https://supabase.com). Pick a region near your users —
every page load makes several round trips to it.

From **Project Settings → API**, copy:

- **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

> The `service_role` key bypasses row level security completely. It belongs only in
> Railway's environment. If it ever reaches the browser, every user's data is readable
> by every other user.

### 1.2 Run the migrations

In order, via **SQL Editor** (paste and run each), or with the Supabase CLI:

```bash
supabase db push
```

1. `supabase/migrations/0001_init.sql` — profiles, brands, carousels, videos, blinks, image sets, RLS
2. `supabase/migrations/0002_billing.sql` — plans, subscriptions, payments, webhook idempotency, `entitled_tier()`
3. `supabase/migrations/0003_storage.sql` — the `uploads` and `generations` buckets and their policies
4. `supabase/migrations/0004_annual_plans.sql` — annual plan rows (removed again by 0005)
5. `supabase/migrations/0005_usd_plans.sql` — INR → USD, Creator/Studio → Starter/Growth
6. `supabase/migrations/0006_razorpay_plan_ids.sql` — the real Razorpay plan ids and amounts
7. `supabase/migrations/0007_live_and_test_plans.sql` — separate test and live plan ids and prices
8. `supabase/migrations/0008_brand_accent_default.sql` — brand accent default moved to the Blink UGC violet
9. `supabase/migrations/0009_trial_excludes_blink.sql` — the trial grants Starter, so Blink AI needs a paid Growth plan
10. `supabase/migrations/0010_animated_carousels.sql` — animated carousels, slide rows, and `paid_tier()`
11. `supabase/migrations/0011_multiple_brands.sql` — an account can hold more than one brand
12. `supabase/migrations/0012_free_tier_no_trial.sql` — the trial becomes a permanent free tier; custom image sets move to Starter

Run them in order and all twelve of them. 0005 and 0006 rename columns that the API
reads (`price_paise` → `price_minor`, `amount_paise` → `amount_minor`), so a
database stopped at 0004 will fail every billing request rather than degrade, and
0007 is what keeps test-mode checkouts from charging live-mode prices.

On the existing Blink UGC project this is already done, and the applied ones are
recorded in the CLI's migration history, so a new migration is just:

```bash
supabase db push
```

The first seven were applied by hand in the SQL Editor before the project was
linked, which left that history empty — `supabase migration repair --status
applied 0001 … 0007` is what backfilled it. A fresh project does not need that
step; run the files in order and the history records itself.

Verify afterwards:

```sql
select id, name, tier, razorpay_plan_id, price_minor / 100.0 as usd, currency
from plans order by sort;

select count(*) from storage.buckets where id in ('uploads','generations');
```

You should see two plans — Starter at 7.99 USD and Growth at 14.99 USD, each with
a non-null `razorpay_plan_id` — and two buckets.

### 1.3 Google sign-in

**In Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: External, fill in app name, support email,
   and the developer contact. Add your domain under Authorised domains.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   *Web application*.
4. Under **Authorised redirect URIs**, add exactly:

   ```
   https://YOUR-PROJECT.supabase.co/auth/v1/callback
   ```

   This is Supabase's callback, not your app's. Getting this wrong is the single most
   common cause of `redirect_uri_mismatch`.
5. Copy the **Client ID** and **Client secret**.

**In Supabase** → **Authentication → Providers → Google**: enable it and paste the client
ID and secret.

**In Supabase** → **Authentication → URL Configuration**:

- **Site URL** — your production web app URL, e.g. `https://blinkugc.app`
- **Redirect URLs** — add every origin the app is served from:
  ```
  http://localhost:5199
  http://localhost:5199/
  https://blinkugc.app
  https://blinkugc.app/
  ```

While the consent screen is in *Testing*, only accounts listed under **Test users** can
sign in. Publish it before real customers arrive.

---

## 2 · Razorpay

### 2.1 Keys

**Account & Settings → API Keys → Generate**. Start in **Test mode**.

- **Key ID** → `RAZORPAY_KEY_ID`
- **Key Secret** → `RAZORPAY_KEY_SECRET`

The key ID reaches the browser (Checkout needs it) but the server hands it over at
checkout time, so it is not a build-time variable. The secret never leaves Railway.

### 2.2 Create the two plans

Pricing is in **USD**, which requires **international payments** to be enabled on the
Razorpay account (Account & Settings → Payment methods). Without it, a USD plan can be
created but the charge is declined at checkout.

**Subscriptions → Plans → Create Plan**, twice. Currency **USD**, billing cycle
**Monthly**, interval **1**:

| Plan | Amount | Matches |
|---|---|---|
| Starter | $7.99 | `plans.id = 'starter'` |
| Growth | $14.99 | `plans.id = 'growth'` |

**Test and live are two separate sets of plans.** Razorpay isolates the modes
completely: different keys, different plan ids, and here different prices too. A live key
cannot see a test plan, or the reverse — it fails with `The ID provided is invalid or
could not be found` at the moment the customer tries to pay.

So the `plans` table holds both, and the server picks by the prefix of
`RAZORPAY_KEY_ID` (`rzp_test_` → test). Nothing else needs setting; see
`server/src/planMode.js`.

| Column | Mode |
|---|---|
| `razorpay_plan_id`, `price_minor` | live (canonical) |
| `razorpay_plan_id_test`, `price_minor_test` | test (null = same as live) |

```sql
-- live
update plans set razorpay_plan_id = 'plan_LIVE_STARTER', price_minor = 799  where id = 'starter';
update plans set razorpay_plan_id = 'plan_LIVE_GROWTH',  price_minor = 2599 where id = 'growth';
-- test
update plans set razorpay_plan_id_test = 'plan_TEST_STARTER', price_minor_test = 799  where id = 'starter';
update plans set razorpay_plan_id_test = 'plan_TEST_GROWTH',  price_minor_test = 1499 where id = 'growth';
```

Until the column for the deployed mode is set, checkout returns a clear
`plan_not_configured` naming the missing column, rather than failing obscurely.

### 2.2b Always verify the ids against the keys

**Do this after every billing change.** It is the one check that catches both failures
that have already happened here — an id belonging to the other mode, and an id written
into the wrong row:

```bash
curl -s -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" https://api.razorpay.com/v1/plans \
  | python3 -m json.tool
```

Every id the database references for that mode must appear in the output **against the
plan of the same name and amount**. Matching only the id is not enough. Migration 0005
wrote two real live ids into the wrong rows, so `starter` pointed at the Growth plan:
checkout succeeded, the webhook arrived, the mirror row said `starter`, and the only thing
that disagreed was the customer's card being charged $25.99 for a plan advertised at
$7.99. Nothing in the app could have detected it — only this comparison can.

To change prices later, update **both** the Razorpay plan (create a new one — Razorpay
plans are immutable) and the matching `price_minor` column. The database value is what the
pricing page displays; Razorpay's is what actually gets charged. Letting them drift means
quoting one price and charging another.

### 2.3 Webhook

**Webhooks are per-mode too.** A webhook created in test mode never fires for a live
payment. Going live therefore means creating a *second* webhook in the live dashboard —
and if you skip it, live checkout will appear to succeed while no subscription is ever
allocated, because the webhook is what grants access. Nothing in the UI will say so.

Use a **long random secret** in live mode, not a placeholder. The secret is the only thing
standing between the internet and a forged `subscription.activated`, which grants a paid
tier for free:

```bash
openssl rand -hex 32
```

**Settings → Webhooks → Add New Webhook** (once per mode you intend to take money in):

- **URL** — `https://YOUR-API.up.railway.app/api/webhooks/razorpay`
- **Secret** — the generated string → `RAZORPAY_WEBHOOK_SECRET`
- **Active events**:
  - `subscription.authenticated`
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.updated`
  - `subscription.pending`
  - `subscription.halted`
  - `subscription.cancelled`
  - `subscription.completed`
  - `payment.captured`
  - `payment.failed`

The webhook is the source of truth for subscription state. The browser's post-checkout
`verify` call only shortcuts the wait; if the webhook is misconfigured, subscriptions will
appear to work and then silently never renew.

---

## 3 · fal

Get a key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) → `FAL_KEY`.

One key covers every generation in the product: Blink AI video, the animated-carousel
backgrounds, and the slide copy. All of it is metered, which is exactly why the key lives
on the server — in an early build the video key shipped inside the JavaScript bundle.

Video used to be Google Veo on a separate Google AI balance. When that balance ran dry,
Blink AI failed for every paying Growth subscriber while the rest of the product carried
on working, and nothing in the app said why. Two vendors meant two balances to keep
funded and two ways to go dark; there is now one.

`/health` reports whether the key is set:

```bash
curl -s https://YOUR-API.up.railway.app/health | python3 -m json.tool
```

---

## 4 · API on Railway

New project → **Deploy from GitHub repo** → set **Root Directory** to `server`.
`server/railway.json` supplies the build and healthcheck config.

Set these variables under **Variables**:

```
NODE_ENV=production
WEB_ORIGIN=https://blinkugc.app
EXTRA_ORIGINS=https://staging.blinkugc.app     # optional, comma separated
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
FAL_KEY=...
ANIMATED_MONTHLY_LIMIT=30
```

Do **not** set `PORT` — Railway injects it.

`WEB_ORIGIN` does double duty: it is the CORS allowlist, and it is the origin the server
fetches creator reference stills from when conditioning a Blink AI generation. If the web
app is not reachable at that URL, creator-anchored generations fail.

Generate a domain under **Settings → Networking**, then check:

```bash
curl https://YOUR-API.up.railway.app/health
```

The server refuses to boot with a missing variable and names the ones it needs, so a
failed deploy's logs will tell you exactly what is absent.

---

## 5 · Web app

Any static host. Build settings:

- **Build command** — `npm run build`
- **Output directory** — `dist`
- **Install command** — `npm install`

Environment variables:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://YOUR-API.up.railway.app
```

Vite inlines every `VITE_*` variable into the bundle, so treat all three as public. They
are: the anon key grants nothing on its own, because row level security is what protects
the data.

Routing is hash-based (`#/carousels`), so no SPA rewrite rules are needed.

After the first deploy, go back and set `WEB_ORIGIN` on Railway to this URL, and add it to
Supabase's redirect URLs.

---

## 6 · Local development

```bash
# once
npm install
cd server && npm install && cd ..
cp .env.example .env
cp server/.env.example server/.env
# fill both in — server/.env takes the Google and Razorpay secrets
```

Two terminals:

```bash
npm run dev
```

```bash
cd server && npm run dev
```

Web on `http://localhost:5199`, API on `http://localhost:8080`. Keep
`WEB_ORIGIN=http://localhost:5199` in `server/.env` and
`VITE_API_URL=http://localhost:8080` in `.env`.

For webhooks locally, tunnel the API (`ngrok http 8080`) and point a **test-mode**
Razorpay webhook at the tunnel.

---

## 7 · Smoke test after deploying

Work through this in order — each step depends on the previous one:

1. `GET /health` on the API returns `{"ok":true}`.
2. The web app loads and shows the sign-in screen, not the "isn't configured yet" screen.
3. Sign in with Google. You land on onboarding, and a row appears in `public.profiles`
   with `trial_ends_at` null — nothing stamps a trial any more.
4. Finish onboarding, create a photo carousel, reload — it is still there. Open it in a
   different browser signed into the same account; it is there too. All of this on the
   free tier, with no subscription anywhere.
5. Still on free: Videos, Blink AI and the "+ New custom set" button each show an upsell
   rather than the feature, and the animated tile in the carousel wizard is locked.
6. Confirm the free tier is enforced, not just hidden — from the browser console of a
   signed-in free account:
   ```js
   await supabase.from('image_sets').insert({ user_id: (await supabase.auth.getUser()).data.user.id, name: 'x' })
   ```
   It must come back with a row-level-security error. If it inserts, 0012 did not run.
7. Subscribe to Starter with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/).
   The full $7.99 is charged immediately — not a token authorisation — hook videos and
   image sets unlock, Blink AI shows the Growth upsell, `public.subscriptions` has an
   `active` row, and `public.webhook_events` has entries with `processed_at` set.
8. Upgrade to Growth. Blink AI unlocks and the previous subscription is cancelled at
   Razorpay.
9. Cancel from the account page. `cancel_at_cycle_end` becomes true, access continues to
   the period end, and after it you drop to free rather than being locked out.

Or run the whole entitlement half of that against a running API:

```bash
cd server && node scripts/verify-tiers.mjs
```

It creates a throwaway account, walks it free → Starter → Growth → cancelled, checks
both the API gates and the RLS ones at each step, and deletes the account afterwards.
Point it at a non-production Supabase project: it writes subscription rows.

If step 7 grants access but `webhook_events` stays empty, the webhook secret or URL is
wrong. Fix it before taking real money — without it, renewals and failed payments are
invisible to the app.

---

## 8 · Environment variable reference

**Web** (public, inlined into the bundle)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key; RLS does the protecting |
| `VITE_API_URL` | Railway API base URL |

**Server** (secret, Railway only)

| Variable | Purpose |
|---|---|
| `PORT` | Injected by Railway |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | CORS allowlist + source of creator stills |
| `EXTRA_ORIGINS` | Optional extra allowed origins, comma separated |
| `SUPABASE_URL` | Same project URL |
| `SUPABASE_ANON_KEY` | Used for token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses RLS.** Server only |
| `RAZORPAY_KEY_ID` | Public-ish; handed to Checkout by the server |
| `RAZORPAY_KEY_SECRET` | Signs and authenticates API calls |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies webhook deliveries |
| `FAL_KEY` | Every generation: video, images, slide copy. Metered |
| `ANIMATED_MONTHLY_LIMIT` | Animated carousels per account per month (default 30) |

---

## 9 · Things worth knowing

**Entitlement lives in one place.** `public.entitled_tier(user_id)`, last redefined in
`0012_free_tier_no_trial.sql`, is the definition; the API reads through it rather than
reimplementing the rules. Change the policy there and both agree by construction.

**The free tier is the absence of a subscription.** There is no row for it in `plans`
and no Razorpay object behind it — `entitled_tier()` simply returns `'free'` when it
finds nothing live. `profiles.trial_ends_at` is a historical column now; nothing reads
it and new signups leave it null.

**Custom image sets are gated in RLS, not in the API.** They are the one feature the
browser writes directly, with the user's own token, never touching the Express server —
so the insert policies on `image_sets` and `set_images` are the enforcement, and the
React check is only there to explain it. Everything else is gated by `requireFeature()`.

**Users cannot write their own entitlement.** RLS restricts which *rows* a user touches;
column privileges restrict which *fields*. `profiles` grants `UPDATE` on only
`full_name` and `avatar_url` — without that, a user could write their own billing
columns from the browser console and never pay.

**Blinks and subscriptions are server-written.** Neither table has an insert policy for
authenticated users, so a paid generation or an active plan cannot be fabricated client
side.

**Storage is private.** Both buckets are served through short-lived signed URLs. The
`generations` bucket is read-only to users; only the service role writes to it.

**Local work is imported once.** On first sign-in, anything left in this browser's
localStorage/IndexedDB from the pre-accounts build is lifted into the account, but only
if the account is empty — the risk worth avoiding is duplicating someone's work. The
local copy is never deleted. Old Blink AI clips are not imported, because the browser is
deliberately unable to write to the `generations` bucket.
