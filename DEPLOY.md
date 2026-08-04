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

Run them in order and all eight of them. 0005 and 0006 rename columns that the API
reads (`price_paise` → `price_minor`, `amount_paise` → `amount_minor`), so a
database stopped at 0004 will fail every billing request rather than degrade, and
0007 is what keeps test-mode checkouts from charging live-mode prices.

On the existing Blink UGC project this is already done, and 0001–0008 are recorded
in the CLI's migration history, so a new migration is just:

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

## 3 · Google Veo

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey) with the
Generative Language API enabled → `GOOGLE_AI_KEY`.

Veo video generation is billed per second of output. This key is what the Studio plan is
selling access to, which is exactly why it lives on the server now — in the previous
build it shipped inside the JavaScript bundle.

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
GOOGLE_AI_KEY=...
GOOGLE_AI_MODEL=veo-3.1-generate-preview
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
   with `trial_ends_at` seven days out.
4. Finish onboarding, create a carousel, reload — it is still there. Open it in a
   different browser signed into the same account; it is there too.
5. Blink AI is available (the trial grants Studio). Generate a short clip; a row appears
   in `public.blinks` moving `rendering → ready`, and an object appears in the
   `generations` bucket.
6. Expire the trial by hand:
   ```sql
   update profiles set trial_ends_at = now() - interval '1 day' where email = 'you@example.com';
   ```
   Reload — you should be held at the pricing page.
7. Subscribe to Creator with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/).
   Access returns, Blink AI shows the Studio upsell, `public.subscriptions` has an
   `active` row, and `public.webhook_events` has entries with `processed_at` set.
8. Upgrade to Studio. Blink AI unlocks and the previous subscription is cancelled at
   Razorpay.
9. Cancel from the account page. `cancel_at_cycle_end` becomes true and access continues
   to the period end.

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
| `GOOGLE_AI_KEY` | Veo generation. Billed per second |
| `GOOGLE_AI_MODEL` | Defaults to `veo-3.1-generate-preview` |

---

## 9 · Things worth knowing

**Entitlement lives in one place.** `public.entitled_tier(user_id)` in
`0002_billing.sql` is the definition; the API reads through it rather than
reimplementing the rules. Change the policy there and both agree by construction.

**The trial is a column, not a Razorpay object.** `profiles.trial_ends_at`, seven days,
set by the signup trigger. No card is collected. To change the length, edit the column
default in `0001_init.sql`.

**Users cannot write their own entitlement.** RLS restricts which *rows* a user touches;
column privileges restrict which *fields*. `profiles` grants `UPDATE` on only
`full_name` and `avatar_url` — without that, a user could set their own `trial_ends_at`
from the browser console and never pay.

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
