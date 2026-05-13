# LeadFinder

AI-assisted lead discovery for freelancers and agencies. **LeadFinder** ingests public Reddit posts that match your campaigns, scores hiring intent with an LLM, surfaces qualified opportunities in a dashboard, and supports draft outreach—with optional email alerts for high-confidence leads.

---

## Highlights

- **Campaign-driven discovery** — Keywords, target subreddits, minimum score, and active/paused state per campaign.
- **Deduplication** — Upstash Redis tracks recently seen Reddit post IDs so the same thread is not repeatedly collected during the retention window.
- **Two ingestion paths** — On-demand **Scan Now** (`POST /api/scrape`) scores posts in parallel and inserts qualified leads immediately; **Inngest** cron jobs run scheduled scrape → score → alert for unattended operation.
- **Reply drafting** — Google Gemini generates short, contextual reply drafts from post text and optional user voice/portfolio fields in Supabase.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| App framework | [Next.js](https://nextjs.org/) 16 (App Router), React 19, TypeScript |
| Auth & database | [Supabase](https://supabase.com/) (SSR client, Google OAuth) |
| Cache / dedup | [Upstash Redis](https://upstash.com/) |
| Background jobs | [Inngest](https://www.inngest.com/) |
| Scoring (LLM) | [Groq](https://groq.com/) (`llama-3.3-70b-versatile`) |
| Reply generation | [Google Generative AI](https://ai.google.dev/) (Gemini) |
| Transactional email | [Resend](https://resend.com/) |

Styling uses **Tailwind CSS v4** with global design tokens in `app/globals.css`.

---

## Repository layout

```
app/
  (auth)/login/          # Sign-in UI
  (dashboard)/           # Leads, analytics, campaigns
  api/                   # scrape, score, reply, inngest, Stripe webhook stub
  auth/                  # Google OAuth, callback, sign-out
actions/                 # Server Actions (leads, campaigns)
components/              # LeadCard, CampaignForm, ScanButton, ReplyModal, …
inngest/                 # scrapeJob, scoreJob, alertJob + client
lib/                     # Supabase, Groq, Gemini, Redis helpers
scrapers/                # Reddit (public JSON API), Apify placeholder
types/                   # Shared TypeScript models
proxy.ts                 # Next.js proxy (session refresh + auth redirects)
```

Reddit ingestion uses Reddit’s **public `.json` endpoints** (see `scrapers/reddit.ts`), not authenticated Reddit OAuth in the current path.

---

## Prerequisites

- **Node.js** 20+ (recommended; aligns with `@types/node`)
- **Supabase** project with Google provider enabled (or adjust auth to your provider)
- **Groq** API key for scoring
- **Gemini** API key for `/api/reply`
- **Upstash Redis** for deduplication (`Redis.fromEnv()`)
- **Inngest** app (for cron functions); sync the production URL in the Inngest dashboard
- **Resend** (optional) for high-score email alerts from `alertJob`
- **Vercel** (or any Node host) for deployment; set all environment variables in the host UI

---

## Environment variables

Create `.env.local` for local development (never commit secrets; this repo ignores `.env*`).

| Variable | Required | Used for |
|----------|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser + server anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role access in API routes and Inngest (keep server-only) |
| `NEXT_PUBLIC_APP_URL` | Yes | OAuth redirects, email links (e.g. `http://localhost:3000` or production URL) |
| `GROQ_API_KEY` | Yes | Lead scoring |
| `GEMINI_API_KEY` | Yes | Reply generation |
| `UPSTASH_REDIS_REST_URL` | Yes* | Redis REST URL (*required if dedup is used) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes* | Redis REST token |
| `RESEND_API_KEY` | For alerts | High-score email job |
| `RESEND_FROM_EMAIL` | For alerts | Verified sender in Resend |

\*Upstash is required for `scrapers/reddit.ts` deduplication as implemented.

**Inngest:** configure your Inngest app to call your deployment’s `/api/inngest` endpoint and supply Inngest’s signing keys per their docs.

---

## Supabase data model

The app expects tables consistent with `types/index.ts` (exact SQL migrations are not bundled in this repo—mirror these shapes in Supabase):

- **`users`** — Profile keyed to auth user (`id`, `email`, `name`, `plan`, `voice_profile`, `portfolio_summary`, …).
- **`campaigns`** — `user_id`, `name`, `keywords` (array), `subreddits` (array), `platforms` (array; app currently sets Reddit), `min_score`, `is_active`, timestamps.
- **`leads`** — `campaign_id`, `platform`, `post_id`, `post_title`, `post_body`, `post_url`, `author`, `score`, `score_reason`, `status` (`new` \| `seen` \| `replied`), `found_at`.
- **`outreach_log`** — `lead_id`, `user_id`, `generated_reply`, `sent`, `replied_back`, … (written when generating a reply).

Enable **Row Level Security** and policies appropriate for your threat model; server routes that use the **service role** bypass RLS and must be treated as trusted backend only.

---

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated visitors are redirected to `/login` by `proxy.ts` (dashboard routes); `/api/*` and `/auth/*` are excluded from that redirect matcher.

```bash
npm run lint      # ESLint
npm run build     # Production build + typecheck
```

---

## Scheduled jobs (Inngest)

| Function | Role | Trigger (UTC) |
|----------|------|-----------------|
| `scrape-reddit` | Fetch posts for active campaigns, insert unscored leads | `0 */6 * * *` |
| `score-leads` | Score unscored leads; delete below `min_score` | `15 */6 * * *` |
| `alert-leads` | Email users for high scores (≥ 9) on `new` leads; mark `seen` | `30 */6 * * *` |

Manual **Scan Now** uses `POST /api/scrape`, which scores in parallel and inserts only leads that already meet the campaign threshold.

---

## API routes (summary)

| Route | Purpose |
|-------|---------|
| `POST /api/scrape` | Run scrape + score for all active campaigns (service role) |
| `POST /api/score` | Score unscored leads for the authenticated user |
| `POST /api/reply` | Generate a draft reply for a `lead_id` (service role + Gemini) |
| `GET/POST/PUT /api/inngest` | Inngest serve endpoint |
| `POST /api/webhooks/stripe` | Placeholder for future billing |

Treat service-role routes as **backend-only**; protect them with network rules, secrets, or additional auth if you expose them publicly.

---

## Deployment (e.g. Vercel)

1. Connect the GitHub repository and set **all** environment variables in the project settings.  
2. Deploy the default **Next.js** preset (`npm run build` / `next start` or Vercel’s build).  
3. Point **Inngest** at `https://<your-domain>/api/inngest`.  
4. Configure **Supabase Auth** redirect URLs to include `https://<your-domain>/auth/callback`.

---

## License

Private project (`"private": true` in `package.json`). Add a `LICENSE` file if you open-source the repository.

---

## Author

[SantoshMalana](https://github.com/SantoshMalana) — [LeadFinder on GitHub](https://github.com/SantoshMalana/LeadFinder)
